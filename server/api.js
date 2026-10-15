// REST 接口：与前端 /api/* 一一对应。需要登录的接口拿到 ctx（当前创作者），公开接口按 handle 找创作者。
import fs from 'node:fs';
import path from 'node:path';
import { TEMPLATES } from './templates.js';
import {
  DATA_DIR, userByEmail, userByHandle, insertUser, verifyPassword, setUserPassword, setUserHandle, createSession,
  deleteSession, deleteUserSessions, saveState, allUsers, loadState, setting, setSetting, SETTING_KEYS, newRef, getRef,
} from './db.js';
import { newState, local } from './seed.js';
import {
  ctxFor, PLANS, plan, usage, agentView, dealView, brandOf, overview, estimate, RATE, disclosure, slots, notify, addLead,
  upsertBrand, createDeal, convertLead, markDealPaid, createOrder, fulfill, meView, err, usd, slugify, PUBLIC_URL, iso,
} from './engine.js';
import { aiReady, isBusy, busyCount, stop, pushMsg, runConversation, runAutomation, deliverEmail, twinReply, listFiles, safePath, writeFile } from './ai.js';
import { stripeReady, stripe, checkout } from './payments.js';
import { mailReady } from './mail.js';

export const routes = [];
const R = (m, p, h, opts = {}) => { const keys = []; routes.push({ m, re: new RegExp('^' + p.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$'), keys, h, ...opts }); };
const pub = (m, p, h) => R(m, p, h, { public: true });
const pick = (o, keys) => Object.fromEntries(keys.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]));
const str = (v, max = 5000) => String(v ?? '').slice(0, max);
const cents = (v) => Math.max(0, Math.round((+v || 0) * 100));
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HANDLE_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{1,29}$/;
const RESERVED = new Set(['admin', 'api', 'app', 'go', 'c', 'pay', 'hooks', 'static', 'login', 'signup', 'settings', 'help', 'support', 'www']);
const byId = (arr, id, what = 'Item') => arr.find((x) => x.id === +id) || err(404, `${what} not found`);
export const isAdmin = (user) => {
  const list = String(process.env.ADMIN_EMAILS || '').toLowerCase().split(',').map((s) => s.trim()).filter(Boolean);
  return list.length ? list.includes(user.email.toLowerCase()) : user.id === 1;
};

// ================= 账号 =================
pub('POST', '/auth/signup', (ctx, b) => {
  const name = str(b.name, 80).trim(), handle = str(b.handle, 30).trim(), email = str(b.email, 200).trim().toLowerCase(), password = str(b.password, 200);
  if (!name) err(400, 'Please enter your name');
  if (!HANDLE_RE.test(handle) || RESERVED.has(handle.toLowerCase())) err(400, 'Pick a handle with 2–30 letters, numbers, - or _');
  if (!EMAIL_RE.test(email)) err(400, 'Please enter a valid email');
  if (password.length < 8) err(400, 'Password must be at least 8 characters');
  if (userByEmail(email)) err(409, 'An account with this email already exists — log in instead');
  if (userByHandle(handle)) err(409, 'That handle is taken');
  const uid = insertUser({ email, password, handle });
  saveState(uid, newState({ name, handle, email }));
  return { ok: true, _session: createSession(uid) };
});
pub('POST', '/auth/login', (ctx, b) => {
  const u = userByEmail(str(b.email, 200));
  if (!u || !verifyPassword(str(b.password, 200), u.password)) err(401, 'Wrong email or password');
  return { ok: true, _session: createSession(u.id) };
});
pub('POST', '/auth/logout', (ctx, b, p, q, req) => { if (req.sessionToken) deleteSession(req.sessionToken); return { ok: true, _session: '' }; });

R('GET', '/me', (ctx) => meView(ctx, { admin: isAdmin(ctx.user), ai_ready: aiReady(), stripe_ready: stripeReady(), mail_ready: mailReady(), stripe_charges_enabled: ctx.S.me.stripe_charges_enabled || !stripeReady() ? 1 : 0 }));
R('PATCH', '/me', (ctx, b) => {
  const me = ctx.S.me;
  if (b.handle !== undefined && b.handle !== me.handle) {
    const h = str(b.handle, 30).trim();
    if (!HANDLE_RE.test(h) || RESERVED.has(h.toLowerCase())) err(400, 'Pick a handle with 2–30 letters, numbers, - or _');
    const other = userByHandle(h); if (other && other.id !== ctx.uid) err(409, 'That handle is taken');
    setUserHandle(ctx.uid, h); me.handle = h; ctx.publicUrl = `${PUBLIC_URL()}/c/${encodeURIComponent(h)}`;
  }
  if (b.timezone !== undefined) { try { new Intl.DateTimeFormat('en-US', { timeZone: b.timezone }); } catch { err(400, 'Unknown time zone'); } }
  for (const k of ['name', 'bio', 'niche', 'location', 'timezone', 'color', 'shape', 'voice']) if (b[k] !== undefined) me[k] = str(b[k], 2000);
  if (b.onboarded !== undefined) me.onboarded = b.onboarded ? 1 : 0;
  if (b.rate_card && typeof b.rate_card === 'object') me.rate_card = Object.fromEntries(Object.entries(b.rate_card).filter(([k, v]) => RATE[k] && +v > 0).map(([k, v]) => [k, Math.round(+v)]));
  if (b.page && typeof b.page === 'object') { me.page = { ...me.page, ...b.page }; if (Array.isArray(b.page.links)) me.page.links = b.page.links.slice(0, 30).map((l) => ({ title: str(l.title, 120), url: /^https?:\/\//.test(l.url) ? str(l.url, 500) : '' })).filter((l) => l.title && l.url); }
  if (b.twin && typeof b.twin === 'object') me.twin = { ...me.twin, ...pick(b.twin, ['enabled', 'name', 'greeting', 'instructions']) };
  if (b.availability && typeof b.availability === 'object') me.availability = b.availability;
  return meView(ctx, { admin: isAdmin(ctx.user), ai_ready: aiReady(), stripe_ready: stripeReady() });
});
R('POST', '/me/password', (ctx, b, p, q, req) => {
  if (!verifyPassword(str(b.old_password, 200), ctx.user.password)) err(400, 'Current password is wrong');
  if (str(b.new_password, 200).length < 8) err(400, 'New password must be at least 8 characters');
  setUserPassword(ctx.uid, b.new_password); deleteUserSessions(ctx.uid);
  return { ok: true, _session: '' };
});
R('GET', '/notifications', (ctx) => ctx.S.notifications);
R('POST', '/notifications/read', (ctx) => { ctx.S.notifications.forEach((n) => (n.read = 1)); return { ok: true }; });
R('GET', '/overview', (ctx) => overview(ctx, busyCount(ctx.uid)));
R('GET', '/templates', () => TEMPLATES);

// ================= 代理 =================
R('GET', '/agents', (ctx) => ctx.S.agents.map((a) => { const v = agentView(ctx.S, a.id); const last = [...ctx.S.messages].reverse().find((m) => m.conversation_id === v.conversation_id); return { ...v, last, busy: isBusy(ctx.uid, v.conversation_id), pending: ctx.S.approvals.filter((x) => x.agent_id === a.id && x.status === 'pending').length }; }).sort((x, y) => (y.last?.created_at || y.created_at || '').localeCompare(x.last?.created_at || x.created_at || '')));
R('POST', '/agents', (ctx, b) => {
  const S = ctx.S;
  if (S.agents.length >= plan(S).agents) err(402, `Your ${plan(S).name} plan includes ${plan(S).agents} agents. Upgrade to add more.`);
  const t = b.template && TEMPLATES.agents.find((x) => x.key === b.template);
  const name = str(b.name || t?.name, 40).trim() || err(400, 'Give your agent a name');
  const a = { id: ctx.id(), name, role: str(b.role ?? t?.role ?? '', 80), instructions: str(b.instructions ?? t?.instructions ?? '', 8000), color: str(b.color || t?.color || '#3ddc97', 20), shape: str(b.shape || t?.shape || 'square', 20), email: '', approval: { email: true, sms: true, call: true, exec: false, local: true, payment: true }, channels: {}, connections: {}, budget_cents: 0, phone: null, created_at: local() };
  S.agents.push(a); S.convs.push({ id: ctx.id(), type: 'agent', agent_id: a.id, title: a.name, goal: '' });
  return agentView(S, a.id);
});
R('GET', '/agents/:id', (ctx, b, p) => agentView(ctx.S, p.id) || err(404, 'Agent not found'));
R('PATCH', '/agents/:id', (ctx, b, p) => {
  const a = byId(ctx.S.agents, p.id, 'Agent');
  for (const k of ['name', 'role', 'instructions', 'color', 'shape', 'email']) if (b[k] !== undefined) a[k] = str(b[k], 8000);
  if (b.budget_cents !== undefined) a.budget_cents = Math.max(0, Math.round(+b.budget_cents || 0));
  if (b.approval) a.approval = { ...a.approval, ...b.approval };
  if (b.channels) for (const [k, v] of Object.entries(b.channels)) { const prev = a.channels[k] || {}; a.channels[k] = { ...prev, ...v, token: v.token && !String(v.token).startsWith('••••') ? v.token : prev.token || '' }; }
  if (b.connections) a.connections = { ...a.connections, ...b.connections };
  const conv = ctx.S.convs.find((c) => c.type === 'agent' && c.agent_id === a.id); if (conv) conv.title = a.name;
  return agentView(ctx.S, a.id);
});
R('DELETE', '/agents/:id', (ctx, b, p) => {
  const S = ctx.S, aid = +p.id;
  const conv = S.convs.find((c) => c.type === 'agent' && c.agent_id === aid);
  S.agents = S.agents.filter((x) => x.id !== aid);
  if (conv) { S.convs = S.convs.filter((c) => c !== conv); S.messages = S.messages.filter((m) => m.conversation_id !== conv.id); }
  S.automations = S.automations.filter((x) => x.agent_id !== aid);
  S.memories = S.memories.filter((x) => x.agent_id !== aid);
  for (const g of S.convs.filter((c) => c.type === 'group')) g.members = g.members.filter((m) => m !== aid);
  fs.rmSync(path.join(DATA_DIR, 'files', String(ctx.uid), String(aid)), { recursive: true, force: true });
  return { ok: true };
});
R('GET', '/groups', (ctx) => ctx.S.convs.filter((c) => c.type === 'group').map((g) => ({ ...g, members: g.members.map((m) => agentView(ctx.S, m)).filter(Boolean), last: [...ctx.S.messages].reverse().find((m) => m.conversation_id === g.id), busy: isBusy(ctx.uid, g.id) })));
R('POST', '/groups', (ctx, b) => {
  const members = (b.members || []).map((m) => +(m.id ?? m)).filter((id) => ctx.S.agents.some((a) => a.id === id));
  if (members.length < 2) err(400, 'Pick at least two agents');
  const g = { id: ctx.id(), type: 'group', title: str(b.title, 80) || 'Team', goal: str(b.goal, 500), members };
  ctx.S.convs.push(g); return g;
});
R('DELETE', '/groups/:id', (ctx, b, p) => { ctx.S.convs = ctx.S.convs.filter((c) => !(c.id === +p.id && c.type === 'group')); ctx.S.messages = ctx.S.messages.filter((m) => m.conversation_id !== +p.id); return { ok: true }; });
R('GET', '/conversations/:id', (ctx, b, p) => { const c = byId(ctx.S.convs, p.id, 'Conversation'); return { ...c, members: c.type === 'group' ? c.members.map((m) => agentView(ctx.S, m)).filter(Boolean) : [], busy: isBusy(ctx.uid, c.id), messages: ctx.S.messages.filter((m) => m.conversation_id === c.id) }; });
R('POST', '/conversations/:id/messages', (ctx, b, p) => {
  const S = ctx.S, c = byId(S.convs, p.id, 'Conversation');
  if (aiReady() && usage(S).agent_runs >= plan(S).agent_runs) err(402, `You've used all ${plan(S).agent_runs} agent tasks in your ${plan(S).name} plan this month. Upgrade to keep going.`);
  const target = c.type === 'agent' ? c.agent_id : c.members[0];
  const attachments = [];
  for (const f of (b.attachments || []).slice(0, 10)) {
    const buf = Buffer.from(String(f.data || ''), 'base64');
    if (buf.length > 20e6) err(413, `${f.name} is over 20 MB`);
    const rel = `uploads/${slugify(path.parse(str(f.name, 120)).name, 60)}${path.extname(str(f.name, 120)).replace(/[^.\w]/g, '').slice(0, 10)}`;
    if (target) writeFile(ctx.uid, target, rel, buf);
    attachments.push({ name: str(f.name, 120), path: rel, size: buf.length });
  }
  const msg = pushMsg(ctx, { conversation_id: c.id, sender: 'user', content: str(b.text, 20000) || '(sent attachments)', attachments });
  runConversation(ctx, c.id);
  return { id: msg.id };
});
R('POST', '/conversations/:id/stop', (ctx, b, p) => { stop(ctx.uid, +p.id); return { ok: true }; });
R('DELETE', '/conversations/:id/messages', (ctx, b, p) => { ctx.S.messages = ctx.S.messages.filter((m) => m.conversation_id !== +p.id); return { ok: true }; });
R('GET', '/agents/:id/memories', (ctx, b, p) => ctx.S.memories.filter((m) => m.agent_id === +p.id).reverse());
R('POST', '/agents/:id/memories', (ctx, b, p) => { byId(ctx.S.agents, p.id, 'Agent'); const m = { id: ctx.id(), agent_id: +p.id, content: str(b.content, 2000), created_at: local() }; ctx.S.memories.push(m); return m; });
R('DELETE', '/memories/:id', (ctx, b, p) => { ctx.S.memories = ctx.S.memories.filter((m) => m.id !== +p.id); return { ok: true }; });
R('GET', '/agents/:id/files', (ctx, b, p) => { byId(ctx.S.agents, p.id, 'Agent'); return listFiles(ctx.uid, +p.id); });
R('GET', '/agents/:id/files/raw', (ctx, b, p, q) => { byId(ctx.S.agents, p.id, 'Agent'); const f = safePath(ctx.uid, +p.id, q.path); if (!fs.existsSync(f)) err(404, 'File not found'); return { _file: f, download: !!q.download }; });
R('DELETE', '/agents/:id/files', (ctx, b, p, q) => { const f = safePath(ctx.uid, +p.id, q.path); fs.rmSync(f, { force: true }); return { ok: true }; });
R('GET', '/agents/:id/commands', (ctx, b, p) => ctx.S.commands.filter((c) => c.agent_id === +p.id).reverse());
R('POST', '/agents/:id/exec', () => err(403, 'Running shell commands is turned off on this server for safety.'));
R('GET', '/agents/:id/wallet', (ctx, b, p) => { const a = agentView(ctx.S, p.id) || err(404, 'Agent not found'); return { balance_cents: a.balance_cents, tx: ctx.S.wallet.filter((w) => w.agent_id === +p.id).reverse(), stripe: stripeReady() }; });
R('POST', '/agents/:id/wallet/topup', async (ctx, b, p) => {
  const a = byId(ctx.S.agents, p.id, 'Agent'); const amount = cents(b.amount);
  if (amount < 100 || amount > 100000) err(400, 'Enter an amount between $1 and $1,000');
  if (stripeReady()) {
    const url = await checkout({ title: `Wallet top-up for ${a.name}`, amountCents: amount, email: ctx.S.me.email, successUrl: `${PUBLIC_URL()}/app#/agent/${a.id}`, cancelUrl: `${PUBLIC_URL()}/app#/agent/${a.id}`, metadata: { uid: String(ctx.uid), kind: 'wallet', agent_id: String(a.id) } });
    return { url };
  }
  ctx.S.wallet.push({ id: ctx.id(), agent_id: a.id, amount_cents: amount, kind: 'topup', description: 'Top-up (test mode)', created_at: local() });
  ctx.emit({ type: 'wallet', agent_id: a.id });
  return { ok: true };
});
R('GET', '/agents/:id/mailbox', (ctx, b, p) => ctx.S.mailbox.filter((m) => m.agent_id === +p.id).reverse());
R('GET', '/phone/numbers', () => []);
R('POST', '/agents/:id/phone', (ctx, b, p) => {
  if (b.buy) err(400, 'Buying phone numbers is not available on this server yet. You can enter a number you already own.');
  const a = byId(ctx.S.agents, p.id, 'Agent'); const n = str(b.number, 20).trim();
  if (n && !/^\+[1-9]\d{6,14}$/.test(n)) err(400, 'Use international format, e.g. +14155550100');
  a.phone = n || null; return agentView(ctx.S, a.id);
});
R('POST', '/agents/:id/channels/test', () => err(400, 'Messaging channels (Telegram, Slack, iMessage, LINE) are saved but not connected on this server yet.'));
R('GET', '/devices', (ctx) => ctx.S.devices);
R('POST', '/devices', () => err(400, 'Device pairing is not available on this server yet.'));
R('DELETE', '/devices/:id', (ctx, b, p) => { ctx.S.devices = ctx.S.devices.filter((d) => d.id !== +p.id); return { ok: true }; });

// ================= 自动化 / 审批 =================
const autoView = (ctx, x) => { const a = agentView(ctx.S, x.agent_id) || {}; return { ...x, agent_name: a.name, color: a.color, shape: a.shape, webhook_url: x.trigger === 'webhook' ? `${PUBLIC_URL()}/hooks/${ctx.uid}/${x.id}/${x.secret}` : undefined, runs: ctx.S.runs.filter((r) => r.automation_id === x.id).reverse().slice(0, 10) }; };
const autoFields = (ctx, b, x = {}) => {
  const out = pick(b, ['name', 'trigger', 'cron', 'filter', 'prompt']);
  for (const k of Object.keys(out)) out[k] = str(out[k], 4000);
  if (out.trigger && !['cron', 'lead', 'order', 'booking', 'email', 'sms', 'webhook'].includes(out.trigger)) err(400, 'Unknown trigger');
  const trig = out.trigger || x.trigger;
  if (trig === 'cron' && !/^(\S+\s+){4}\S+$/.test(out.cron ?? x.cron ?? '')) err(400, 'Schedule must be a 5-field cron expression');
  if (trig === 'webhook' && !x.secret) out.secret = newRef(ctx.uid, 'hook', 0);
  if (b.enabled !== undefined) out.enabled = b.enabled ? 1 : 0;
  return out;
};
R('GET', '/automations', (ctx, b, p, q) => ctx.S.automations.filter((x) => !q.agent_id || x.agent_id === +q.agent_id).map((x) => autoView(ctx, x)).reverse());
R('POST', '/automations', (ctx, b) => { byId(ctx.S.agents, b.agent_id, 'Agent'); if (!b.prompt) err(400, 'Tell the agent what to do'); const x = { id: ctx.id(), enabled: 1, filter: '', cron: null, last_run_at: null, ...autoFields(ctx, b), agent_id: +b.agent_id }; ctx.S.automations.push(x); return autoView(ctx, x); });
R('PATCH', '/automations/:id', (ctx, b, p) => { const x = byId(ctx.S.automations, p.id, 'Automation'); Object.assign(x, autoFields(ctx, b, x)); return autoView(ctx, x); });
R('DELETE', '/automations/:id', (ctx, b, p) => { ctx.S.automations = ctx.S.automations.filter((x) => x.id !== +p.id); return { ok: true }; });
R('POST', '/automations/:id/run', (ctx, b, p) => { const x = byId(ctx.S.automations, p.id, 'Automation'); runAutomation(ctx, x, 'run manually'); return { ok: true }; });
R('GET', '/approvals', (ctx, b, p, q) => ctx.S.approvals.filter((x) => q.all || x.status === 'pending').slice(0, 200).map((x) => { const a = agentView(ctx.S, x.agent_id) || {}; return { ...x, agent_name: a.name, color: a.color, shape: a.shape }; }));
R('POST', '/approvals/:id', async (ctx, b, p) => {
  const ap = byId(ctx.S.approvals, p.id, 'Approval');
  if (ap.status !== 'pending') err(409, 'This was already decided');
  const agent = ctx.S.agents.find((a) => a.id === ap.agent_id);
  if (!b.approve) {
    ap.status = 'rejected'; ap.decided_at = local();
    pushMsg(ctx, { conversation_id: ap.conversation_id, sender: 'system', content: `The creator declined #${ap.id}: ${ap.summary}${b.reason ? ` — ${str(b.reason, 500)}` : ''}` });
    ctx.emit({ type: 'approval' });
    return { status: 'rejected' };
  }
  if (b.payload) Object.assign(ap.payload, pick(b.payload, ['to', 'subject', 'body']));
  if (!EMAIL_RE.test(ap.payload.to)) err(400, 'Invalid recipient email');
  const r = await deliverEmail(ctx, agent || { id: ap.agent_id, name: 'Your crew' }, ap.payload);
  ap.status = 'done'; ap.decided_at = local(); ap.result = r.info;
  pushMsg(ctx, { conversation_id: ap.conversation_id, sender: 'system', content: `Approved #${ap.id}: ${ap.summary}. ${r.info}` });
  ctx.emit({ type: 'approval' });
  return { status: 'done', result: r.info };
});

// ================= 业务 =================
const socialFields = (b) => ({ ...pick(b, ['platform', 'handle', 'url', 'audience']), ...(b.followers !== undefined ? { followers: Math.max(0, Math.round(+b.followers || 0)) } : {}), ...(b.avg_views !== undefined ? { avg_views: Math.max(0, Math.round(+b.avg_views || 0)) } : {}), ...(b.engagement_rate !== undefined ? { engagement_rate: Math.max(0, +b.engagement_rate || 0) } : {}) });
R('GET', '/socials', (ctx) => ctx.S.socials);
R('POST', '/socials', (ctx, b) => { if (!b.platform) err(400, 'Pick a platform'); const s = { id: ctx.id(), followers: 0, avg_views: 0, engagement_rate: 0, audience: '', url: '', handle: '', ...socialFields(b), updated_at: local() }; ctx.S.socials.push(s); return s; });
R('PATCH', '/socials/:id', (ctx, b, p) => Object.assign(byId(ctx.S.socials, p.id, 'Platform'), socialFields(b), { updated_at: local() }));
R('DELETE', '/socials/:id', (ctx, b, p) => { ctx.S.socials = ctx.S.socials.filter((x) => x.id !== +p.id); return { ok: true }; });
R('POST', '/socials/:id/refresh', (ctx, b, p) => { const s = byId(ctx.S.socials, p.id, 'Platform'); s.updated_at = local(); return s; });
R('GET', '/brands', (ctx) => ctx.S.brands.map((b) => ({ ...b, deals: ctx.S.deals.filter((d) => d.brand_id === b.id).length })).sort((a, b) => a.name.localeCompare(b.name)));
R('POST', '/brands', (ctx, b) => { if (!b.name) err(400, 'Brand name is required'); return upsertBrand(ctx, pick(b, ['name', 'website', 'category', 'contact_name', 'contact_email', 'notes'])); });
R('PATCH', '/brands/:id', (ctx, b, p) => Object.assign(byId(ctx.S.brands, p.id, 'Brand'), pick(b, ['name', 'website', 'category', 'contact_name', 'contact_email', 'notes'])));
R('GET', '/deals', (ctx) => ctx.S.deals.slice().sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || '')).map((d) => dealView(ctx.S, d)));
R('POST', '/deals', (ctx, b) => dealView(ctx.S, createDeal(ctx, b)));
R('GET', '/deals/:id', (ctx, b, p) => dealView(ctx.S, byId(ctx.S.deals, p.id, 'Deal')));
R('PATCH', '/deals/:id', (ctx, b, p) => {
  const d = byId(ctx.S.deals, p.id, 'Deal');
  if (b.brand_name) d.brand_id = upsertBrand(ctx, { name: str(b.brand_name, 120) }).id;
  if (b.contact_email !== undefined) brandOf(ctx.S, d).contact_email = str(b.contact_email, 200);
  Object.assign(d, pick(b, ['title', 'stage', 'platforms', 'usage_rights', 'exclusivity', 'due_date', 'contract_url', 'notes']), b.amount !== undefined ? { amount_cents: cents(b.amount) } : {}, { updated_at: local() });
  if (b.stage === 'paid') markDealPaid(ctx, d);
  return dealView(ctx.S, d);
});
R('DELETE', '/deals/:id', (ctx, b, p) => { ctx.S.deals = ctx.S.deals.filter((x) => x.id !== +p.id); ctx.S.deliverables = ctx.S.deliverables.filter((x) => x.deal_id !== +p.id); return { ok: true }; });
export function invoiceDeal(ctx, id) {
  const d = byId(ctx.S.deals, id, 'Deal');
  if (!d.amount_cents) return err(400, 'Set the deal amount before invoicing');
  if (!d.invoice_ref) d.invoice_ref = newRef(ctx.uid, 'invoice', d.id);
  d.invoice_url = `${PUBLIC_URL()}/pay/${d.invoice_ref}`;
  if (!['paid', 'lost'].includes(d.stage)) d.stage = 'invoiced';
  d.updated_at = local(); ctx.emit({ type: 'business' });
  return { url: d.invoice_url, amount: usd(d.amount_cents) };
}
R('POST', '/deals/:id/invoice', (ctx, b, p) => invoiceDeal(ctx, p.id));
R('POST', '/deals/:id/deliverables', (ctx, b, p) => { byId(ctx.S.deals, p.id, 'Deal'); const x = { id: ctx.id(), deal_id: +p.id, status: 'todo', link: '', title: '', platform: '', due_date: null, ...pick(b, ['title', 'platform', 'due_date', 'status', 'link']) }; ctx.S.deliverables.push(x); return x; });
R('PATCH', '/deliverables/:id', (ctx, b, p) => Object.assign(byId(ctx.S.deliverables, p.id, 'Deliverable'), pick(b, ['title', 'platform', 'due_date', 'status', 'link'])));
R('DELETE', '/deliverables/:id', (ctx, b, p) => { ctx.S.deliverables = ctx.S.deliverables.filter((x) => x.id !== +p.id); return { ok: true }; });
R('GET', '/rates/types', () => Object.entries(RATE).map(([k, v]) => ({ key: k, label: v[3] })));
R('GET', '/rates/estimate', (ctx, b, p, q) => estimate(ctx.S, q.type, +q.usage_months || 0, +q.exclusivity_days || 0));
R('POST', '/disclosure', (ctx, b) => disclosure(b.caption, b.platform));

const productFields = (b) => { const o = pick(b, ['type', 'title', 'tagline', 'description', 'delivery_note', 'interval']); for (const k of Object.keys(o)) o[k] = str(o[k], 20000); if (b.price !== undefined) o.price_cents = cents(b.price); for (const k of ['active', 'featured']) if (b[k] !== undefined) o[k] = b[k] && b[k] !== '0' ? 1 : 0; if (o.interval === '') o.interval = null; return o; };
R('GET', '/products', (ctx) => ctx.S.products.map((p) => { const os = ctx.S.orders.filter((o) => o.product_id === p.id && o.status === 'paid'); return { ...p, sales: os.length, revenue_cents: os.reduce((s, o) => s + o.amount_cents, 0) }; }).reverse());
R('POST', '/products', (ctx, b) => { if (!b.title) err(400, 'Give your product a title'); const p = { id: ctx.id(), type: 'digital', tagline: '', description: '', delivery_note: '', interval: null, price_cents: 0, file_path: null, active: 1, featured: 0, created_at: local(), ...productFields(b) }; p.slug = slugify(p.title); ctx.S.products.push(p); return p; });
R('PATCH', '/products/:id', (ctx, b, p) => Object.assign(byId(ctx.S.products, p.id, 'Product'), productFields(b)));
R('DELETE', '/products/:id', (ctx, b, p) => { byId(ctx.S.products, p.id, 'Product').active = 0; return { ok: true }; });
R('POST', '/products/:id/file', (ctx, b, p) => {
  const pr = byId(ctx.S.products, p.id, 'Product');
  const buf = Buffer.from(String(b.data || ''), 'base64');
  if (!buf.length) err(400, 'Empty file'); if (buf.length > 50e6) err(413, 'Files must be under 50 MB');
  const dir = path.join(DATA_DIR, 'products', String(ctx.uid)); fs.mkdirSync(dir, { recursive: true });
  const name = `${pr.id}-${slugify(path.parse(str(b.name, 200)).name, 80)}${path.extname(str(b.name, 200)).replace(/[^.\w]/g, '').slice(0, 10)}`;
  if (pr.file_path) fs.rmSync(path.join(dir, pr.file_path), { force: true });
  fs.writeFileSync(path.join(dir, name), buf); pr.file_path = name; pr.file_name = str(b.name, 200);
  return { ok: true };
});
R('GET', '/orders', (ctx, b, p, q) => ctx.S.orders.filter((o) => !q.kind || o.kind === q.kind).slice().sort((a, b) => (b.paid_at || b.created_at || '').localeCompare(a.paid_at || a.created_at || '')).slice(0, 200).map((o) => ({ ...o, simulated: o.simulated ? 1 : 0, product_title: ctx.S.products.find((x) => x.id === o.product_id)?.title, deal_title: ctx.S.deals.find((x) => x.id === o.deal_id)?.title, service_title: o.kind === 'booking' ? ctx.S.services.find((s) => s.id === ctx.S.bookings.find((x) => x.id === o.booking_id)?.service_id)?.title || 'Coaching call' : null })));
const serviceFields = (b) => { const o = pick(b, ['title', 'description', 'location']); for (const k of Object.keys(o)) o[k] = str(o[k], 4000); for (const k of ['duration_min', 'buffer_min', 'notice_hours']) if (b[k] !== undefined) o[k] = Math.max(0, Math.round(+b[k] || 0)); if (b.price !== undefined) o.price_cents = cents(b.price); if (b.questions !== undefined) o.questions = (Array.isArray(b.questions) ? b.questions : String(b.questions).split('\n')).map((x) => str(x, 300).trim()).filter(Boolean).slice(0, 10); if (b.active !== undefined) o.active = b.active && b.active !== '0' ? 1 : 0; return o; };
R('GET', '/services', (ctx) => ctx.S.services);
R('POST', '/services', (ctx, b) => { if (!b.title) err(400, 'Give the call a title'); const s = { id: ctx.id(), active: 1, duration_min: 30, buffer_min: 15, notice_hours: 24, price_cents: 0, questions: [], location: '', description: '', ...serviceFields(b) }; s.slug = slugify(s.title); if (s.duration_min < 10) s.duration_min = 30; ctx.S.services.push(s); return s; });
R('PATCH', '/services/:id', (ctx, b, p) => Object.assign(byId(ctx.S.services, p.id, 'Service'), serviceFields(b)));
R('GET', '/bookings', (ctx) => ctx.S.bookings.slice().sort((a, b) => b.start_at.localeCompare(a.start_at)).map((b) => { const s = ctx.S.services.find((x) => x.id === b.service_id) || {}; return { ...b, service_title: s.title, duration_min: s.duration_min }; }));
R('PATCH', '/bookings/:id', (ctx, b, p) => Object.assign(byId(ctx.S.bookings, p.id, 'Booking'), pick(b, ['status', 'notes'])));

const linkView = (ctx, l) => ({ ...l, short_url: `${PUBLIC_URL()}/go/${encodeURIComponent(ctx.S.me.handle)}/${l.slug}`, earned_cents: ctx.S.earnings.filter((e) => e.link_id === l.id).reduce((s, e) => s + e.amount_cents, 0) });
const uniqueSlug = (ctx, base, selfId) => { let s = slugify(base, 30), n = 2; while (ctx.S.links.some((l) => l.slug === s && l.id !== selfId)) s = `${slugify(base, 26)}-${n++}`; return s; };
const linkFields = (b) => { const o = pick(b, ['title', 'url', 'network', 'commission', 'category', 'note']); for (const k of Object.keys(o)) o[k] = str(o[k], 1000); if (o.url !== undefined && !/^https?:\/\//.test(o.url)) err(400, 'Links must start with http:// or https://'); if (b.featured !== undefined) o.featured = b.featured && b.featured !== '0' ? 1 : 0; return o; };
R('GET', '/links', (ctx) => ctx.S.links.map((l) => linkView(ctx, l)).reverse());
R('POST', '/links', (ctx, b) => { if (!b.title || !b.url) err(400, 'Title and URL are required'); const l = { id: ctx.id(), clicks: 0, clicks_30d: 0, click_log: [], featured: 0, network: '', commission: '', category: '', note: '', ...linkFields(b) }; l.slug = uniqueSlug(ctx, b.slug || l.title); ctx.S.links.push(l); return linkView(ctx, l); });
R('PATCH', '/links/:id', (ctx, b, p) => { const l = byId(ctx.S.links, p.id, 'Link'); Object.assign(l, linkFields(b)); if (b.slug) l.slug = uniqueSlug(ctx, b.slug, l.id); return linkView(ctx, l); });
R('DELETE', '/links/:id', (ctx, b, p) => { ctx.S.links = ctx.S.links.filter((x) => x.id !== +p.id); return { ok: true }; });
R('GET', '/earnings', (ctx) => ctx.S.earnings.slice().reverse().map((e) => ({ ...e, link_title: ctx.S.links.find((l) => l.id === e.link_id)?.title })));
R('POST', '/earnings', (ctx, b) => { if (!/^\d{4}-\d{2}$/.test(String(b.period))) err(400, 'Period must be YYYY-MM'); const e = { id: ctx.id(), link_id: b.link_id ? +b.link_id : null, network: str(b.network, 100), amount_cents: cents(b.amount), period: b.period, note: str(b.note, 500), created_at: local() }; ctx.S.earnings.push(e); return e; });
R('DELETE', '/earnings/:id', (ctx, b, p) => { ctx.S.earnings = ctx.S.earnings.filter((x) => x.id !== +p.id); return { ok: true }; });
R('GET', '/leads', (ctx) => ctx.S.leads.slice().reverse());
R('PATCH', '/leads/:id', (ctx, b, p) => Object.assign(byId(ctx.S.leads, p.id, 'Lead'), pick(b, ['status', 'kind'])));
R('POST', '/leads/:id/convert', (ctx, b, p) => convertLead(ctx, p.id));
R('GET', '/knowledge', (ctx) => ctx.S.knowledge.slice().reverse());
R('POST', '/knowledge', (ctx, b) => { if (!b.question || !b.answer) err(400, 'Question and answer are required'); const k = { id: ctx.id(), public: b.public === false ? 0 : 1, question: str(b.question, 500), answer: str(b.answer, 4000) }; ctx.S.knowledge.push(k); return k; });
R('PATCH', '/knowledge/:id', (ctx, b, p) => Object.assign(byId(ctx.S.knowledge, p.id, 'Answer'), pick(b, ['question', 'answer', 'public'])));
R('DELETE', '/knowledge/:id', (ctx, b, p) => { ctx.S.knowledge = ctx.S.knowledge.filter((x) => x.id !== +p.id); return { ok: true }; });
R('GET', '/twin/sessions', (ctx) => ctx.S.twin.slice().reverse().slice(0, 200).map((s) => ({ ...s, count: s.messages.length, preview: s.messages.find((m) => m.role === 'user')?.content || '' })));
R('POST', '/twin/test', async (ctx, b) => ({ reply: await twinReply(ctx, { messages: [], lead_id: -1 }, str(b.message, 2000)) }));

// ================= 套餐与收款 =================
R('GET', '/billing', (ctx) => ({ plans: PLANS, current: ctx.S.me.plan, status: ctx.S.me.plan_status, usage: usage(ctx.S), stripe: stripeReady(), can_upgrade: !stripeReady() || !!setting('STRIPE_PRO_PRICE_ID') }));
R('POST', '/billing/upgrade', async (ctx) => {
  if (!stripeReady()) { ctx.S.me.plan = 'pro'; ctx.S.me.plan_status = 'active'; return { ok: true, simulated: true }; }
  const price = setting('STRIPE_PRO_PRICE_ID') || err(400, 'The Pro plan is not set up on this server yet');
  const s = await stripe('POST', '/checkout/sessions', { mode: 'subscription', line_items: { 0: { price, quantity: 1 } }, success_url: `${PUBLIC_URL()}/app#/settings/billing`, cancel_url: `${PUBLIC_URL()}/app#/settings/billing`, client_reference_id: String(ctx.uid), metadata: { uid: String(ctx.uid), kind: 'pro' }, subscription_data: { metadata: { uid: String(ctx.uid), kind: 'pro' } }, ...(ctx.S.me.stripe_customer_id ? { customer: ctx.S.me.stripe_customer_id } : { customer_email: ctx.S.me.email }) });
  return { url: s.url };
});
R('POST', '/billing/portal', async (ctx) => { if (!ctx.S.me.stripe_customer_id) err(400, 'No billing account yet'); const s = await stripe('POST', '/billing_portal/sessions', { customer: ctx.S.me.stripe_customer_id, return_url: `${PUBLIC_URL()}/app#/settings/billing` }); return { url: s.url }; });
R('GET', '/stripe/status', async (ctx) => {
  if (!stripeReady()) return { demo: true, connected: true, charges_enabled: true, details_submitted: true, payouts_enabled: true };
  const id = ctx.S.me.stripe_account_id;
  if (!id) return { connected: false };
  const a = await stripe('GET', `/accounts/${id}`);
  ctx.S.me.stripe_charges_enabled = a.charges_enabled ? 1 : 0; ctx.save();
  return { connected: true, charges_enabled: a.charges_enabled, details_submitted: a.details_submitted, payouts_enabled: a.payouts_enabled };
});
R('POST', '/stripe/connect', async (ctx) => {
  if (!stripeReady()) err(400, 'Payments are in test mode on this server');
  if (!ctx.S.me.stripe_account_id) { const a = await stripe('POST', '/accounts', { type: 'express', email: ctx.S.me.email, metadata: { uid: String(ctx.uid) }, capabilities: { card_payments: { requested: true }, transfers: { requested: true } } }); ctx.S.me.stripe_account_id = a.id; ctx.save(); }
  const l = await stripe('POST', '/account_links', { account: ctx.S.me.stripe_account_id, type: 'account_onboarding', refresh_url: `${PUBLIC_URL()}/app#/settings/payments`, return_url: `${PUBLIC_URL()}/app#/settings/payments` });
  return { url: l.url };
});
R('POST', '/stripe/dashboard', async (ctx) => { if (!ctx.S.me.stripe_account_id) err(400, 'Connect Stripe first'); const l = await stripe('POST', `/accounts/${ctx.S.me.stripe_account_id}/login_links`, {}); return { url: l.url }; });

// ================= 管理员 =================
const adminOnly = (ctx) => { if (!isAdmin(ctx.user)) err(403, 'Admins only'); };
R('GET', '/admin/creators', (ctx) => { adminOnly(ctx); return allUsers().map((u) => { const S = loadState(u.id) || { me: {}, orders: [] }; const paid = S.orders.filter((o) => o.status === 'paid' && o.kind !== 'deal'); const u2 = S.usage?.month === new Date().toISOString().slice(0, 7) ? S.usage : {}; return { id: u.id, name: S.me.name, handle: u.handle, email: u.email, plan: S.me.plan, gmv_cents: paid.reduce((s, o) => s + o.amount_cents, 0), fees_cents: paid.reduce((s, o) => s + (o.fee_cents || 0), 0), agent_runs: u2.agent_runs || 0, twin_messages: u2.twin_messages || 0, created_at: u.created_at }; }); });
R('GET', '/admin/settings', (ctx) => { adminOnly(ctx); return Object.fromEntries(SETTING_KEYS.map((k) => { const v = setting(k); return [k, /KEY|SECRET/.test(k) && v ? '••••' + v.slice(-4) : v]; })); });
R('PUT', '/admin/settings', (ctx, b) => { adminOnly(ctx); for (const k of SETTING_KEYS) if (b[k] !== undefined && b[k] !== '__keep__' && !String(b[k]).startsWith('••••')) setSetting(k, str(b[k], 500).trim()); return { ok: true }; });

// ================= 公开主页 =================
const publicCtx = (handle) => { const u = userByHandle(handle); const ctx = u && ctxFor(u.id); return ctx || err(404, 'Page not found'); };
pub('GET', '/public/:handle', (_, b, p) => {
  const ctx = publicCtx(p.handle), S = ctx.S, me = S.me, show = me.page || {};
  return {
    creator: { name: me.name, handle: me.handle, bio: me.bio, niche: me.niche, location: me.location, timezone: me.timezone, color: me.color, shape: me.shape, links: show.links || [], show },
    twin: { enabled: !!me.twin?.enabled, name: me.twin?.name, greeting: me.twin?.greeting },
    socials: S.socials.slice().sort((a, b) => b.followers - a.followers),
    products: show.show_products === false ? [] : S.products.filter((x) => x.active).sort((a, b) => b.featured - a.featured).map(({ file_path, delivery_note, ...x }) => ({ ...x, has_file: !!file_path })),
    services: show.show_booking === false ? [] : S.services.filter((s) => s.active).map(({ location, ...s }) => s),
    picks: show.show_links === false ? [] : S.links.filter((l) => l.featured).map((l) => ({ id: l.id, title: l.title, note: l.note, category: l.category, slug: l.slug, url: `/go/${encodeURIComponent(me.handle)}/${l.slug}` })),
    kit: { name: me.name, handle: me.handle, bio: me.bio, niche: me.niche, location: me.location, total_followers: S.socials.reduce((s, x) => s + x.followers, 0), socials: S.socials, past_brands: [...new Set(S.deals.filter((d) => ['delivered', 'invoiced', 'paid'].includes(d.stage)).map((d) => brandOf(S, d).name).filter(Boolean))], rates: show.show_rates === false ? [] : Object.entries(me.rate_card || {}).map(([k, v]) => ({ type: k, label: RATE[k]?.[3] || k, from: usd(v) })), show_rates: show.show_rates !== false },
    payments: stripeReady() ? 'stripe' : 'demo',
  };
});
pub('POST', '/public/:handle/chat', async (_, b, p) => {
  const ctx = publicCtx(p.handle), S = ctx.S;
  if (!S.me.twin?.enabled) err(404, 'Chat is off');
  const text = str(b.message, 1500).trim(); if (!text) err(400, 'Say something');
  const visitor = str(b.visitor, 64) || 'anon';
  let s = S.twin.find((x) => x.visitor === visitor);
  if (!s) { s = { id: ctx.id(), visitor, lead_id: null, messages: [], created_at: local() }; S.twin.push(s); if (S.twin.length > 1000) S.twin.splice(0, S.twin.length - 1000); }
  if (s.messages.length >= 60) return { reply: 'Thanks for chatting! For anything else, please use the contact form on this page.' };
  const reply = await twinReply(ctx, s, text);
  s.messages.push({ role: 'user', content: text }, { role: 'assistant', content: reply }); s.updated_at = local();
  ctx.save();
  return { reply };
});
pub('POST', '/public/:handle/inquiry', (_, b, p) => {
  const ctx = publicCtx(p.handle);
  if (!EMAIL_RE.test(str(b.email, 200))) err(400, 'Please enter a valid email');
  if (!str(b.message).trim()) err(400, 'Tell us a bit about your idea');
  addLead(ctx, { kind: ['brand', 'coaching', 'other'].includes(b.kind) ? b.kind : 'brand', name: str(b.name, 120), email: str(b.email, 200), company: str(b.company, 120), budget: str(b.budget, 60), message: str(b.message, 4000), source: 'form' });
  ctx.save();
  return { ok: true };
});
pub('GET', '/public/:handle/slots', (_, b, p, q) => slots(publicCtx(p.handle).S, q.service_id, q.date));

// 结账：测试模式直接完成；Stripe 模式钱进创作者的 Connect 账户，平台按套餐抽成
async function payOrStart(ctx, order, { title, recurring }) {
  const S = ctx.S;
  if (!order.amount_cents || !stripeReady()) { if (stripeReady() === false && order.amount_cents) order.simulated = 1; await fulfill(ctx, order); return { done: true, order_ref: order.ref }; }
  if (!S.me.stripe_account_id || !S.me.stripe_charges_enabled) err(400, `${S.me.name} isn't accepting payments yet.`);
  const url = await checkout({ title, amountCents: order.amount_cents, email: order.buyer_email, successUrl: `${ctx.publicUrl}?order=${order.ref}`, cancelUrl: ctx.publicUrl, metadata: { uid: String(ctx.uid), kind: 'order', order_id: String(order.id) }, destination: S.me.stripe_account_id, feeCents: order.fee_cents, recurring });
  ctx.save();
  return { url };
}
pub('POST', '/public/:handle/buy', async (_, b, p) => {
  const ctx = publicCtx(p.handle), S = ctx.S;
  const pr = S.products.find((x) => x.id === +b.product_id && x.active) || err(404, 'Product not found');
  if (!EMAIL_RE.test(str(b.email, 200))) err(400, 'Please enter a valid email');
  const order = createOrder(ctx, { kind: 'product', product_id: pr.id, buyer_name: str(b.name, 120), buyer_email: str(b.email, 200), amount_cents: pr.price_cents, fee_cents: Math.round(pr.price_cents * plan(S).fee_pct / 100) });
  return payOrStart(ctx, order, { title: pr.title, recurring: pr.type === 'membership' ? pr.interval || 'month' : null });
});
pub('POST', '/public/:handle/book', async (_, b, p) => {
  const ctx = publicCtx(p.handle), S = ctx.S;
  const s = S.services.find((x) => x.id === +b.service_id && x.active) || err(404, 'Service not found');
  if (!EMAIL_RE.test(str(b.email, 200)) || !str(b.name).trim()) err(400, 'Please enter your name and a valid email');
  const start = new Date(String(b.start_at)); if (isNaN(start)) err(400, 'Pick a time');
  const ok = slots(S, s.id, new Date(start.getTime()).toLocaleDateString('en-CA', { timeZone: S.me.timezone || 'UTC' })).slots.includes(iso(start));
  if (!ok) err(409, 'That time is no longer available — please pick another');
  const answers = Object.fromEntries(Object.entries(b.answers || {}).slice(0, 10).map(([k, v]) => [str(k, 300), str(v, 2000)]));
  const bk = { id: ctx.id(), service_id: s.id, start_at: iso(start), end_at: iso(new Date(start.getTime() + s.duration_min * 60e3)), name: str(b.name, 120), email: str(b.email, 200), answers, status: 'pending', notes: '', created_at: local() };
  S.bookings.push(bk);
  const order = createOrder(ctx, { kind: 'booking', booking_id: bk.id, buyer_name: bk.name, buyer_email: bk.email, amount_cents: s.price_cents, fee_cents: Math.round(s.price_cents * plan(S).fee_pct / 100) });
  return payOrStart(ctx, order, { title: `${s.title} with ${S.me.name}` });
});
function orderByRef(ref) {
  const r = getRef(ref); if (!r || r.kind !== 'order') err(404, 'Order not found');
  const ctx = ctxFor(r.user_id); const o = ctx?.S.orders.find((x) => x.id === r.target_id) || err(404, 'Order not found');
  return { ctx, o };
}
pub('GET', '/public/order/:ref', (_, b, p) => {
  const { ctx, o } = orderByRef(p.ref), S = ctx.S;
  const pr = S.products.find((x) => x.id === o.product_id); const bk = S.bookings.find((x) => x.id === o.booking_id); const sv = bk && S.services.find((s) => s.id === bk.service_id);
  const paid = o.status === 'paid';
  return { status: o.status, kind: o.kind, title: pr?.title || sv?.title || '', download: paid && pr?.file_path ? `/api/public/download/${o.ref}` : null, delivery_note: paid && pr ? pr.delivery_note || '' : '', booking: bk ? { start_at: bk.start_at, title: sv?.title, location: paid ? sv?.location : '', ics: `/api/public/order/${o.ref}/ics` } : null };
});
pub('GET', '/public/order/:ref/ics', (_, b, p) => {
  const { ctx, o } = orderByRef(p.ref); const S = ctx.S;
  const bk = S.bookings.find((x) => x.id === o.booking_id) || err(404, 'Not a booking'); const sv = S.services.find((s) => s.id === bk.service_id) || {};
  const f = (d) => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const esc = (s) => String(s || '').replace(/[\\;,]/g, (c) => '\\' + c).replace(/\n/g, '\\n');
  const body = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Creator Crew//EN', 'BEGIN:VEVENT', `UID:${o.ref}@creatorcrew`, `DTSTAMP:${f(Date.now())}`, `DTSTART:${f(bk.start_at)}`, `DTEND:${f(bk.end_at)}`, `SUMMARY:${esc(`${sv.title} with ${S.me.name}`)}`, `LOCATION:${esc(o.status === 'paid' ? sv.location : '')}`, `DESCRIPTION:${esc(sv.description)}`, 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  return { _raw: body, type: 'text/calendar; charset=utf-8', filename: 'booking.ics' };
});
pub('GET', '/public/download/:ref', (_, b, p) => {
  const { ctx, o } = orderByRef(p.ref);
  if (o.status !== 'paid') err(402, 'This order is not paid');
  const pr = ctx.S.products.find((x) => x.id === o.product_id); if (!pr?.file_path) err(404, 'No file for this product');
  o.downloads = (o.downloads || 0) + 1; if (o.downloads > 50) err(429, 'Download limit reached — contact the creator');
  ctx.save();
  return { _file: path.join(DATA_DIR, 'products', String(ctx.uid), pr.file_path), download: true, filename: pr.file_name || pr.file_path };
});

export { ctxFor, fulfill, markDealPaid, createOrder, notify };
