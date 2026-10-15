// 端到端：起一个真实服务（临时数据目录、测试模式支付、无 AI），走完注册、业务、公开主页和下单流程
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PORT = 3900 + Math.floor(Math.random() * 90);
const B = `http://localhost:${PORT}`;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-test-'));
let proc;
let cookie = '';

async function call(method, p, body, { auth = true } = {}) {
  const r = await fetch(B + '/api' + p, { method, headers: { 'content-type': 'application/json', ...(auth && cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined, redirect: 'manual' });
  const sc = r.headers.get('set-cookie'); if (sc && auth) cookie = sc.split(';')[0];
  return { status: r.status, body: await r.json().catch(() => null) };
}

test.before(async () => {
  const env = { ...process.env, PORT: String(PORT), DATA_DIR: dir, PUBLIC_URL: B };
  delete env.ANTHROPIC_API_KEY; delete env.STRIPE_SECRET_KEY; delete env.RESEND_API_KEY;
  proc = spawn(process.execPath, ['--no-warnings=ExperimentalWarning', 'server/index.js'], { env, stdio: 'ignore' });
  for (let i = 0; i < 50; i++) { try { if ((await fetch(B + '/healthz')).ok) return; } catch { /* starting */ } await new Promise((r) => setTimeout(r, 100)); }
  throw new Error('server did not start');
});
test.after(() => { proc.kill(); fs.rmSync(dir, { recursive: true, force: true }); });

test('signup, profile, business data, public page and checkout', async () => {
  assert.equal((await call('GET', '/me')).status, 401);
  assert.equal((await call('POST', '/auth/signup', { name: 'Kai Wu', handle: 'api', email: 'kai@example.com', password: 'password123' })).status, 400, 'reserved handle');
  const su = await call('POST', '/auth/signup', { name: 'Kai Wu', handle: 'kaiwu', email: 'kai@example.com', password: 'password123' });
  assert.equal(su.status, 200);
  assert.equal((await call('POST', '/auth/signup', { name: 'X', handle: 'kaiwu2', email: 'KAI@example.com', password: 'password123' })).status, 409, 'duplicate email');

  const me = (await call('GET', '/me')).body;
  assert.equal(me.handle, 'kaiwu'); assert.equal(me.ai_ready, false); assert.equal(me.admin, true);
  assert.equal(me.public_url, `${B}/c/kaiwu`);
  const agents = (await call('GET', '/agents')).body;
  assert.deepEqual(agents.map((a) => a.name).sort(), ['Max', 'Remy']);

  await call('PATCH', '/me', { bio: 'Tech reviews', niche: 'Tech', rate_card: { youtube_integration: 200000, bogus: 5 } });
  assert.deepEqual((await call('GET', '/me')).body.rate_card, { youtube_integration: 200000 });

  await call('POST', '/socials', { platform: 'youtube', handle: '@kai', followers: 50000, avg_views: 20000, engagement_rate: 4 });
  const est = (await call('GET', '/rates/estimate?type=youtube_integration&usage_months=1')).body;
  assert.ok(est.low_cents >= 10000 && est.high_cents > est.low_cents);

  const deal = (await call('POST', '/deals', { brand_name: 'Acme', amount: 1200, title: 'Acme reel' })).body;
  assert.equal(deal.amount_cents, 120000);
  const inv = (await call('POST', `/deals/${deal.id}/invoice`, {})).body;
  assert.match(inv.url, /\/pay\//);
  const payPage = await fetch(inv.url.replace(/^https?:\/\/[^/]+/, B));
  assert.match(await payPage.text(), /Mark as paid/);
  await fetch(inv.url.replace(/^https?:\/\/[^/]+/, B), { method: 'POST' });
  assert.equal((await call('GET', `/deals/${deal.id}`)).body.stage, 'paid');

  const prod = (await call('POST', '/products', { title: 'Lightroom Presets', price: 15, type: 'digital' })).body;
  await call('POST', `/products/${prod.id}/file`, { name: 'presets.zip', data: Buffer.from('zipdata').toString('base64') });
  const link = (await call('POST', '/links', { title: 'My Camera', url: 'https://shop.example/cam', featured: 1 })).body;
  assert.equal(link.short_url, `${B}/go/kaiwu/my-camera`);
  const go = await fetch(`${B}/go/kaiwu/my-camera`, { redirect: 'manual' });
  assert.equal(go.status, 302); assert.equal(go.headers.get('location'), 'https://shop.example/cam');

  // 公开主页（不带登录）
  const pub = (await call('GET', '/public/kaiwu', null, { auth: false })).body;
  assert.equal(pub.creator.name, 'Kai Wu'); assert.equal(pub.payments, 'demo');
  assert.equal(pub.products[0].file_path, undefined, 'file paths stay private');
  const buy = (await call('POST', '/public/kaiwu/buy', { product_id: prod.id, email: 'fan@example.com' }, { auth: false })).body;
  assert.equal(buy.done, true);
  const order = (await call('GET', `/public/order/${buy.order_ref}`, null, { auth: false })).body;
  assert.equal(order.status, 'paid');
  const dl = await fetch(B + order.download);
  assert.equal(await dl.text(), 'zipdata');

  const inq = await call('POST', '/public/kaiwu/inquiry', { kind: 'brand', email: 'brand@example.com', company: 'BrandCo', message: 'Video in January' }, { auth: false });
  assert.equal(inq.status, 200);
  const chat = (await call('POST', '/public/kaiwu/chat', { visitor: 'v1', message: 'hi' }, { auth: false })).body;
  assert.ok(chat.reply.length > 0);

  const ov = (await call('GET', '/overview')).body;
  assert.equal(ov.this_month.deals, 120000);
  assert.equal(ov.this_month.products, 1500 - Math.round(1500 * 0.08));
  assert.equal(ov.new_leads.length, 1);

  // 没有 AI 时代理会如实说明
  const conv = agents[0].conversation_id;
  await call('POST', `/conversations/${conv}/messages`, { text: 'hello' });
  await new Promise((r) => setTimeout(r, 300));
  const msgs = (await call('GET', `/conversations/${conv}`)).body.messages;
  assert.match(msgs.at(-1).content, /ANTHROPIC_API_KEY/);

  // 只接受 JSON，防跨站表单提交
  const csrf = await fetch(B + '/api/deals', { method: 'POST', headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' }, body: 'brand_name=x' });
  assert.equal(csrf.status, 415);

  // 数据隔离：另一个账号看不到 Kai 的交易
  cookie = '';
  await call('POST', '/auth/signup', { name: 'Lee', handle: 'lee', email: 'lee@example.com', password: 'password123' });
  assert.equal((await call('GET', '/deals')).body.length, 0);
  assert.equal((await call('GET', `/deals/${deal.id}`)).status, 404);
  assert.equal((await call('GET', '/admin/creators')).status, 403);
});
