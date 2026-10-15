// HTTP 服务：静态页面、/api 路由、实时事件、短链跳转、发票付款页、Stripe/自动化 Webhook、定时任务
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sessionUser, userByHandle, userByEmail, insertUser, saveState, getRef, allUsers, loadState } from './db.js';
import { subscribe } from './events.js';
import { routes, ctxFor, fulfill, createOrder } from './api.js';
import { PUBLIC_URL, usd, brandOf } from './engine.js';
import { runAutomation } from './ai.js';
import { stripeReady, checkout, verifyWebhook } from './payments.js';
import { demoState, local } from './seed.js';
import { cronMatches } from './cron.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json' };
const SECURE = PUBLIC_URL().startsWith('https://');
const PAGES = { '/': 'index.html', '/app': 'app.html' };

const cookies = (req) => Object.fromEntries(String(req.headers.cookie || '').split(';').map((c) => c.trim().split('=')).filter((p) => p[0]).map(([k, ...v]) => [k, decodeURIComponent(v.join('='))]));
const setSession = (res, token) => res.setHeader('set-cookie', `cc_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${token ? 30 * 86400 : 0}${SECURE ? '; Secure' : ''}`);
function send(res, status, body, type = 'application/json; charset=utf-8', extra = {}) {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store', ...extra });
  res.end(type.startsWith('application/json') ? JSON.stringify(body ?? null) : body);
}
const html = (res, status, title, body) => send(res, status, `<!doctype html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${title}</title><link rel="icon" href="/logo.svg"/><style>body{margin:0;background:#fff8e7;color:#15131c;font:16px/1.55 Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;display:grid;place-items:center;min-height:100vh;padding:16px;box-sizing:border-box}.c{background:#fff;border:2px solid #15131c;border-radius:20px;box-shadow:5px 5px 0 #15131c;padding:28px;max-width:440px;width:100%}h1{margin:0 0 6px;font-size:24px}.m{color:#5d5868}.a{font-size:34px;font-weight:700;margin:14px 0}button,a.b{display:inline-block;border:2px solid #15131c;border-radius:12px;padding:11px 18px;font:700 15px inherit;background:#6c4cff;color:#fff;cursor:pointer;box-shadow:3px 3px 0 #15131c;text-decoration:none}.n{background:#ffd23f;border:2px solid #15131c;border-radius:10px;padding:8px 12px;font-size:13px;margin:12px 0}</style></head><body><div class="c">${body}</div></body></html>`, 'text/html; charset=utf-8');
const escHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function readBody(req, limit) {
  const chunks = []; let size = 0;
  for await (const c of req) { size += c.length; if (size > limit) throw Object.assign(new Error('Request too large'), { status: 413 }); chunks.push(c); }
  return Buffer.concat(chunks).toString('utf8');
}

// 简单的按 IP 限流（公开接口和登录）
const hits = new Map();
function limited(key, max, windowMs) {
  const now = Date.now(); const h = hits.get(key) || { n: 0, t: now };
  if (now - h.t > windowMs) { h.n = 0; h.t = now; }
  h.n++; hits.set(key, h);
  return h.n > max;
}
setInterval(() => { const now = Date.now(); for (const [k, h] of hits) if (now - h.t > 3600e3) hits.delete(k); }, 600e3).unref();
const ipOf = (req) => (process.env.TRUST_PROXY ? String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() : '') || req.socket.remoteAddress || '';

function serveFile(res, file, { download, filename, cache, sandbox } = {}) {
  const st = fs.statSync(file);
  res.writeHead(200, {
    'content-type': MIME[path.extname(file).toLowerCase()] || (download ? 'application/octet-stream' : 'text/plain; charset=utf-8'),
    'content-length': st.size, 'cache-control': cache || 'no-store', 'x-content-type-options': 'nosniff',
    ...(download ? { 'content-disposition': `attachment; filename="${encodeURIComponent(filename || path.basename(file))}"` } : {}),
    // 用户/代理生成的文件在独立沙箱里打开，防止其中的 HTML 脚本拿到登录态
    ...(sandbox ? { 'content-security-policy': "sandbox; default-src 'none'; img-src data:; style-src 'unsafe-inline'" } : {}),
  });
  fs.createReadStream(file).pipe(res);
}

async function handleApi(req, res, url) {
  const method = req.method;
  const p = url.pathname.slice(4) || '/';
  const token = cookies(req).cc_session;
  const user = sessionUser(token);
  if (p === '/stream' && method === 'GET') { if (!user) return send(res, 401, { error: 'Please log in' }); return subscribe(user.id, res); }

  const route = routes.find((r) => r.m === method && r.re.test(p));
  if (!route) return send(res, 404, { error: `Not found: ${method} ${p}` });
  const mm = p.match(route.re);
  const params = Object.fromEntries(route.keys.map((k, i) => [k, decodeURIComponent(mm[i + 1])]));
  const query = Object.fromEntries(url.searchParams);

  if (method !== 'GET') {
    // 只接受 JSON（配合 SameSite cookie 防跨站提交）
    if (!String(req.headers['content-type'] || '').includes('application/json')) return send(res, 415, { error: 'Expected JSON' });
    const ip = ipOf(req);
    if (/^\/auth\//.test(p) && limited(`auth:${ip}`, 20, 15 * 60e3)) return send(res, 429, { error: 'Too many attempts — try again in a few minutes' });
    if (route.public && /\/(chat|inquiry|buy|book)$/.test(p) && limited(`pub:${ip}`, 40, 10 * 60e3)) return send(res, 429, { error: "You're going a bit fast — try again in a few minutes" });
  }
  let body = {};
  if (method !== 'GET') {
    const raw = await readBody(req, /\/(file|messages)$/.test(p) ? 80e6 : 1e6);
    try { body = raw ? JSON.parse(raw) : {}; } catch { return send(res, 400, { error: 'Invalid JSON' }); }
  }
  let ctx = null;
  if (!route.public) {
    if (!user) return send(res, 401, { error: 'Please log in' });
    ctx = ctxFor(user.id);
    if (!ctx) return send(res, 401, { error: 'Please log in' });
  }
  req.sessionToken = token;
  try {
    const out = await route.h(ctx, body, params, query, req);
    if (ctx && method !== 'GET') ctx.save();
    if (out && out._file) { if (!fs.existsSync(out._file)) return send(res, 404, { error: 'File not found' }); return serveFile(res, out._file, { ...out, sandbox: true }); }
    if (out && out._raw) return send(res, 200, out._raw, out.type, out.filename ? { 'content-disposition': `attachment; filename="${out.filename}"` } : {});
    if (out && '_session' in out) { setSession(res, out._session); delete out._session; }
    return send(res, 200, out);
  } catch (e) {
    if (!e.status) console.error(method, p, e);
    return send(res, e.status || 500, { error: e.status ? e.message : 'Something went wrong on our side' });
  }
}

// 品牌发票付款页：Stripe 模式跳转到 Checkout，测试模式提供“标记已付款”
async function handlePay(req, res, ref) {
  const r = getRef(ref);
  const ctx = r?.kind === 'invoice' && ctxFor(r.user_id);
  const d = ctx && ctx.S.deals.find((x) => x.id === r.target_id && x.invoice_ref === ref);
  if (!d) return html(res, 404, 'Invoice not found', '<h1>Invoice not found</h1><p class="m">This payment link is no longer valid.</p>');
  const S = ctx.S, brand = brandOf(S, d).name || 'Brand';
  const head = `<p class="m" style="margin:0">Invoice from ${escHtml(S.me.name)}</p><h1>${escHtml(d.title)}</h1><p class="m">Billed to ${escHtml(brand)}</p><div class="a">${usd(d.amount_cents)}</div>`;
  if (d.stage === 'paid') return html(res, 200, 'Invoice paid', `${head}<p>✅ This invoice has been paid. Thank you!</p>`);
  if (req.method === 'POST') {
    if (stripeReady()) return send(res, 405, 'Use the card checkout', 'text/plain');
    const order = createOrder(ctx, { kind: 'deal', deal_id: d.id, buyer_name: brand, buyer_email: brandOf(S, d).contact_email || '', amount_cents: d.amount_cents, fee_cents: 0, simulated: 1 });
    await fulfill(ctx, order);
    return html(res, 200, 'Invoice paid', `${head}<p>✅ Marked as paid (test mode — no card was charged).</p>`);
  }
  if (stripeReady()) {
    if (!S.me.stripe_account_id || !S.me.stripe_charges_enabled) return html(res, 200, 'Invoice', `${head}<p class="m">${escHtml(S.me.name)} hasn't finished setting up card payments yet. Please contact them for other ways to pay.</p>`);
    const order = createOrder(ctx, { kind: 'deal', deal_id: d.id, buyer_name: brand, buyer_email: brandOf(S, d).contact_email || '', amount_cents: d.amount_cents, fee_cents: 0 });
    ctx.save();
    const urlTo = await checkout({ title: `${d.title} — ${S.me.name}`, amountCents: d.amount_cents, email: brandOf(S, d).contact_email || undefined, successUrl: `${PUBLIC_URL()}/pay/${ref}`, cancelUrl: `${PUBLIC_URL()}/pay/${ref}`, metadata: { uid: String(ctx.uid), kind: 'order', order_id: String(order.id) }, destination: S.me.stripe_account_id });
    res.writeHead(303, { location: urlTo }); return res.end();
  }
  return html(res, 200, 'Invoice', `${head}<div class="n">Payments are in test mode on this server — no card will be charged.</div><form method="post"><button>Mark as paid (test)</button></form>`);
}

async function handleStripeWebhook(req, res) {
  let event;
  try { event = verifyWebhook(await readBody(req, 1e6), req.headers['stripe-signature']); }
  catch (e) { return send(res, 400, { error: e.message }); }
  const o = event.data?.object || {};
  const md = o.metadata || {};
  const ctx = md.uid ? ctxFor(+md.uid) : null;
  try {
    if (event.type === 'checkout.session.completed' && ctx) {
      if (md.kind === 'order') { const order = ctx.S.orders.find((x) => x.id === +md.order_id); if (order) await fulfill(ctx, order, { stripeSession: o.id }); }
      if (md.kind === 'pro') { Object.assign(ctx.S.me, { plan: 'pro', plan_status: 'active', stripe_customer_id: o.customer, stripe_subscription_id: o.subscription }); }
      if (md.kind === 'wallet') { ctx.S.wallet.push({ id: ctx.id(), agent_id: +md.agent_id, amount_cents: o.amount_total, kind: 'topup', description: 'Card top-up', created_at: local() }); ctx.emit({ type: 'wallet', agent_id: +md.agent_id }); }
    }
    if (['customer.subscription.updated', 'customer.subscription.deleted'].includes(event.type) && ctx && md.kind === 'pro') {
      const active = event.type === 'customer.subscription.updated' && ['active', 'trialing', 'past_due'].includes(o.status);
      Object.assign(ctx.S.me, { plan: active ? 'pro' : 'free', plan_status: o.status });
    }
    if (event.type === 'account.updated' && ctx) ctx.S.me.stripe_charges_enabled = o.charges_enabled ? 1 : 0;
    ctx?.save();
  } catch (e) { console.error('webhook', e); return send(res, 500, { error: 'handler failed' }); }
  return send(res, 200, { received: true });
}

const server = http.createServer(async (req, res) => {
  res.setHeader('x-frame-options', 'SAMEORIGIN');
  res.setHeader('referrer-policy', 'strict-origin-when-cross-origin');
  try {
    const url = new URL(req.url, 'http://x');
    const p = decodeURIComponent(url.pathname);
    if (p.startsWith('/api/')) return await handleApi(req, res, url);
    if (p === '/stripe/webhook' && req.method === 'POST') return await handleStripeWebhook(req, res);
    if (p === '/healthz') return send(res, 200, { ok: true });
    let m;
    if ((m = p.match(/^\/go\/([^/]+)\/([^/]+)$/))) {
      const u = userByHandle(m[1]); const ctx = u && ctxFor(u.id); const l = ctx?.S.links.find((x) => x.slug === m[2]);
      if (!l) return html(res, 404, 'Link not found', '<h1>Link not found</h1>');
      const now = Date.now(); l.click_log = (l.click_log || []).filter((t) => now - t < 30 * 864e5); l.click_log.push(now);
      l.clicks = (l.clicks || 0) + 1; l.clicks_30d = l.click_log.length; ctx.save();
      res.writeHead(302, { location: l.url, 'cache-control': 'no-store' }); return res.end();
    }
    if ((m = p.match(/^\/pay\/([\w-]+)$/))) return await handlePay(req, res, m[1]);
    if ((m = p.match(/^\/hooks\/(\d+)\/(\d+)\/([\w-]+)$/)) && req.method === 'POST') {
      const ctx = ctxFor(+m[1]); const x = ctx?.S.automations.find((a) => a.id === +m[2] && a.trigger === 'webhook' && a.secret === m[3]);
      if (!x || !x.enabled) return send(res, 404, { error: 'Not found' });
      if (limited(`hook:${m[1]}:${m[2]}`, 30, 3600e3)) return send(res, 429, { error: 'Too many calls' });
      const raw = await readBody(req, 100e3);
      if (x.filter && !raw.toLowerCase().includes(x.filter.toLowerCase())) return send(res, 200, { skipped: true });
      runAutomation(ctx, x, `webhook: ${raw.slice(0, 2000)}`); ctx.save();
      return send(res, 202, { ok: true });
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { error: 'Method not allowed' });
    if (/^\/c\/[^/]+(\/(kit|p\/\d+|book\/\d+))?\/?$/.test(p)) return serveFile(res, path.join(ROOT, 'creator.html'), { cache: 'no-cache' });
    const file = path.join(ROOT, PAGES[p] || p);
    if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return html(res, 404, 'Not found', '<h1>Page not found</h1><p><a class="b" href="/">Go home</a></p>');
    return serveFile(res, file, { cache: 'no-cache' });
  } catch (e) {
    console.error(e);
    if (!res.headersSent) send(res, e.status || 500, { error: e.status ? e.message : 'Server error' });
  }
});

// ---------- 定时自动化：每分钟检查一次，按创作者时区匹配 cron ----------
function tick() {
  const now = new Date();
  for (const u of allUsers()) {
    const S = loadState(u.id); if (!S) continue;
    const due = S.automations.filter((x) => x.enabled && x.trigger === 'cron' && x.cron && cronMatches(x.cron, now, S.me.timezone || 'UTC'));
    if (!due.length) continue;
    const ctx = ctxFor(u.id);
    for (const x of due) runAutomation(ctx, x, 'schedule');
    ctx.save();
  }
}
function scheduleTick() { const ms = 60e3 - (Date.now() % 60e3) + 500; setTimeout(() => { try { tick(); } catch (e) { console.error('cron', e); } scheduleTick(); }, ms).unref(); }

// ---------- 可选：演示账号 ----------
if (process.env.DEMO_EMAIL && process.env.DEMO_PASSWORD && !userByEmail(process.env.DEMO_EMAIL)) {
  const handle = userByHandle('avalee') ? `avalee${Date.now() % 1000}` : 'avalee';
  const uid = insertUser({ email: process.env.DEMO_EMAIL, password: process.env.DEMO_PASSWORD, handle });
  const S = demoState(); S.me.email = process.env.DEMO_EMAIL; S.me.handle = handle; S.me.onboarded = 1;
  saveState(uid, S);
  console.log(`Demo account created: ${process.env.DEMO_EMAIL} → /c/${handle}`);
}

const PORT = +process.env.PORT || 3000;
if (process.env.NODE_ENV !== 'test' || process.env.LISTEN) {
  server.listen(PORT, () => {
    console.log(`Creator Crew running on ${PUBLIC_URL()} (port ${PORT})`);
    console.log(`AI: ${process.env.ANTHROPIC_API_KEY ? 'on' : 'set ANTHROPIC_API_KEY to enable agents'} · Payments: ${stripeReady() ? 'Stripe' : 'test mode'}`);
  });
  scheduleTick();
}
export { server, tick };
