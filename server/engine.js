// 创作者业务核心：总览统计、报价估算、披露检查、预约时段、线索/订单流转，以及自动化触发
import { loadState, saveState, userById, newRef } from './db.js';
import { emit as emitTo } from './events.js';
import { local } from './seed.js';
import { sendMail } from './mail.js';

export const PUBLIC_URL = () => (process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, '');
export const iso = (d) => d.toISOString();
export const usd = (c) => '$' + (Number(c || 0) / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
export const err = (status, error) => { throw Object.assign(new Error(error), { status }); };
export const slugify = (s, n = 60) => String(s || '').toLowerCase().normalize('NFKD').replace(/[^\w]+/g, '-').replace(/^-+|-+$/g, '').slice(0, n) || 'item';

// ---------- 上下文 ----------
export function ctxFor(uid) {
  const S = loadState(uid);
  if (!S) return null;
  const user = userById(uid);
  S.me.email = user.email; S.me.handle = user.handle; S.me.id = uid;
  return {
    uid, S, user,
    emit: (e) => emitTo(uid, e),
    save: () => saveState(uid, S),
    id: () => ++S.seq,
    publicUrl: `${PUBLIC_URL()}/c/${encodeURIComponent(user.handle)}`,
  };
}

// ---------- 套餐与用量 ----------
export const PLANS = {
  free: { name: 'Starter', price: 0, agents: 2, agent_runs: 150, twin_messages: 300, fee_pct: 8, features: ['2 AI agents', '150 agent tasks / month', 'AI twin: 300 replies / month', 'Storefront, booking & link-in-bio', '8% platform fee on sales'] },
  pro: { name: 'Pro', price: 29, agents: 20, agent_runs: 3000, twin_messages: 10000, fee_pct: 0, features: ['Up to 20 AI agents', '3,000 agent tasks / month', 'AI twin: 10,000 replies / month', 'Phone number & messaging channels', '0% platform fee'] },
};
export const plan = (S) => PLANS[S.me.plan === 'pro' ? 'pro' : 'free'];
const month = () => new Date().toISOString().slice(0, 7);
export function usage(S) {
  if (!S.usage || S.usage.month !== month()) S.usage = { month: month(), agent_runs: 0, twin_messages: 0 };
  return S.usage;
}
export function chargeUsage(S, kind) {
  const u = usage(S), p = plan(S);
  if (u[kind] >= p[kind]) return false;
  u[kind]++;
  return true;
}

// ---------- 视图辅助 ----------
export const brandOf = (S, d) => S.brands.find((b) => b.id === d.brand_id) || {};
export function agentView(S, aid) {
  const a = S.agents.find((x) => x.id === +aid);
  if (!a) return null;
  const conv = S.convs.find((c) => c.type === 'agent' && c.agent_id === a.id);
  const { template, ...rest } = a;
  return { ...rest, channels: Object.fromEntries(Object.entries(a.channels || {}).map(([k, v]) => [k, { ...v, token: v.token ? '••••' + String(v.token).slice(-4) : '' }])), conversation_id: conv?.id, balance_cents: S.wallet.filter((w) => w.agent_id === a.id).reduce((s, w) => s + w.amount_cents, 0) };
}
export function dealView(S, d) {
  const xs = S.deliverables.filter((x) => x.deal_id === d.id);
  const b = brandOf(S, d);
  const open = xs.filter((x) => x.status !== 'posted' && x.due_date).map((x) => x.due_date).sort();
  return { ...d, brand_name: b.name, contact_email: b.contact_email, contact_name: b.contact_name, website: b.website, deliverable_count: xs.length, deliverable_done: xs.filter((x) => x.status === 'posted').length, next_due: open[0] || null, deliverables: xs };
}

export function overview(ctx, busyCount = 0) {
  const { S } = ctx;
  const months = [];
  for (let i = 5; i >= 0; i--) { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i); months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`); }
  const paid = (kind, m) => S.orders.filter((o) => o.status === 'paid' && o.kind === kind && (!m || (o.paid_at || '').slice(0, 7) === m)).reduce((s, o) => s + o.amount_cents - (o.fee_cents || 0), 0);
  const aff = (m) => S.earnings.filter((e) => !m || e.period === m).reduce((s, e) => s + e.amount_cents, 0);
  const ms = months.map((m) => ({ month: m, deals: paid('deal', m), products: paid('product', m), bookings: paid('booking', m), affiliate: aff(m) }));
  const t = ms[ms.length - 1];
  const upcoming = S.deliverables.filter((x) => x.status !== 'posted').map((x) => { const d = S.deals.find((y) => y.id === x.deal_id); return d && !['lost', 'paid'].includes(d.stage) ? { ...x, deal_title: d.title, brand_name: brandOf(S, d).name } : null; }).filter(Boolean).sort((a, b) => (a.due_date || '9').localeCompare(b.due_date || '9')).slice(0, 8);
  const since30 = Date.now() - 30 * 864e5;
  return {
    this_month: { ...t, total: t.deals + t.products + t.bookings + t.affiliate }, months: ms,
    all_time: { deals: paid('deal'), products: paid('product'), bookings: paid('booking'), affiliate: aff() },
    pipeline_cents: S.deals.filter((d) => ['negotiating', 'contracted', 'in_production', 'delivered'].includes(d.stage)).reduce((s, d) => s + d.amount_cents, 0),
    unpaid_invoices: S.deals.filter((d) => d.stage === 'invoiced').map((d) => ({ ...d, brand_name: brandOf(S, d).name })),
    upcoming_deliverables: upcoming,
    upcoming_bookings: S.bookings.filter((b) => b.status === 'confirmed' && b.start_at >= iso(new Date())).sort((a, b) => a.start_at.localeCompare(b.start_at)).slice(0, 5).map((b) => ({ ...b, title: S.services.find((s) => s.id === b.service_id)?.title })),
    new_leads: S.leads.filter((l) => l.status === 'new').slice().reverse().slice(0, 5),
    recent_orders: S.orders.filter((o) => o.status === 'paid').sort((a, b) => (b.paid_at || '').localeCompare(a.paid_at || '')).slice(0, 6).map((o) => ({ ...o, product_title: S.products.find((p) => p.id === o.product_id)?.title })),
    counts: { deals_open: S.deals.filter((d) => !['paid', 'lost'].includes(d.stage)).length, products: S.products.filter((p) => p.active).length, socials: S.socials.length, link_clicks_30d: S.links.reduce((s, l) => s + (l.clicks_30d || 0), 0), twin_chats_30d: S.twin.filter((x) => new Date((x.updated_at || x.created_at || '').replace(' ', 'T')).getTime() > since30).length },
    approvals: S.approvals.filter((a) => a.status === 'pending').length, unread: S.notifications.filter((n) => !n.read).length, running: busyCount,
    automations: S.automations.filter((a) => a.enabled).length, usage: usage(S), plan: plan(S),
  };
}

// ---------- 报价估算（CPM 经验法） ----------
export const RATE = { youtube_dedicated: ['avg_views', 20, 40, 'YouTube dedicated video', 'youtube'], youtube_integration: ['avg_views', 10, 25, 'YouTube 60–90s integration', 'youtube'], youtube_short: ['avg_views', 5, 12, 'YouTube Short', 'youtube'], tiktok_video: ['avg_views', 6, 15, 'TikTok video', 'tiktok'], instagram_reel: ['avg_views', 8, 18, 'Instagram Reel', 'instagram'], instagram_post: ['followers', 6, 12, 'Instagram feed post', 'instagram'], instagram_story: ['followers', 2, 5, 'Instagram story (3 frames)', 'instagram'], newsletter_ad: ['followers', 25, 60, 'Newsletter sponsorship (per 1k subs)', 'newsletter'], podcast_ad: ['avg_views', 18, 30, 'Podcast 60s ad read', 'podcast'] };
export function estimate(S, type, um = 0, ex = 0) {
  const r = RATE[type]; if (!r) return { error: `Unknown type. Use one of: ${Object.keys(RATE).join(', ')}` };
  const s = S.socials.filter((x) => x.platform === r[4]).sort((a, b) => b.followers - a.followers)[0];
  const n = s ? (r[0] === 'avg_views' ? s.avg_views || s.followers * 0.1 : s.followers) : 0;
  let lo = Math.round((n / 1000) * r[1] * 100), hi = Math.round((n / 1000) * r[2] * 100);
  if (s && s.engagement_rate >= 6) { lo = Math.round(lo * 1.2); hi = Math.round(hi * 1.25); }
  const adj = [];
  if (um > 0) { const p = Math.min(100, um * 10); adj.push(`Paid usage ${um} mo: +${p}%`); lo = Math.round(lo * (1 + p / 100)); hi = Math.round(hi * (1 + p / 100)); }
  if (ex > 0) { const p = Math.min(50, Math.round(ex / 30) * 10); adj.push(`Exclusivity ${ex} days: +${p}%`); lo = Math.round(lo * (1 + p / 100)); hi = Math.round(hi * (1 + p / 100)); }
  lo = Math.max(lo, 10000); hi = Math.max(hi, 25000);
  const fmt = (c) => '$' + (c / 100).toLocaleString('en-US', { minimumFractionDigits: 2 });
  return { deliverable: r[3], platform_stats: s ? { followers: s.followers, avg_views: s.avg_views, engagement_rate: s.engagement_rate } : 'No stats yet — add your platform stats for a better estimate', suggested_range: `${fmt(lo)} – ${fmt(hi)}`, low_cents: lo, high_cents: hi, your_rate_card: S.me.rate_card[type] ? fmt(S.me.rate_card[type]) : null, adjustments: adj, note: 'Industry rule-of-thumb based on CPM. Anchor toward the high end for strong engagement, niche audiences, or rush timelines.' };
}

// ---------- FTC 披露检查 ----------
export function disclosure(caption, platform = '') {
  const t = String(caption || ''), lower = t.toLowerCase();
  const good = ['#ad', '#sponsored', 'paid partnership', 'sponsored by', 'ad:', '[ad]'];
  const weak = ['#sp', '#spon', '#collab', '#partner', '#ambassador', '#gifted'];
  const found = good.filter((g) => lower.includes(g));
  const weakFound = weak.filter((w) => new RegExp(`${w.replace(/[#[\]]/g, '\\$&')}(\\b|$)`).test(lower)).filter((w) => !found.some((f) => f.includes(w)));
  const idx = found.length ? Math.min(...found.map((g) => lower.indexOf(g))) : -1;
  const issues = [];
  if (!found.length) issues.push('No clear disclosure found. Add "#ad" or "Sponsored" (or use the platform\'s paid-partnership label).');
  if (weakFound.length) issues.push(`Ambiguous tags (${weakFound.join(', ')}) don't count as clear disclosure on their own.`);
  if (idx > 125) issues.push('Disclosure appears late — put it in the first line.');
  if (/youtube|tiktok|reel|podcast/i.test(platform)) issues.push('For video/audio, also say it out loud near the start and turn on the paid-promotion setting.');
  return { compliant: found.length > 0 && idx <= 125 && !weakFound.length, found, issues, reference: 'FTC Endorsement Guides — disclosures must be clear and conspicuous.' };
}

// ---------- 时区换算 + 可约时段 ----------
function tzOff(tz, date) { const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }); const p = Object.fromEntries(f.formatToParts(date).map((x) => [x.type, x.value])); return Math.round((Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - date.getTime()) / 60000); }
function zoned(ds, ts, tz) { const g = new Date(`${ds}T${ts}:00Z`); const o = tzOff(tz, g); const d = new Date(g.getTime() - o * 60000); const o2 = tzOff(tz, d); return o2 === o ? d : new Date(g.getTime() - o2 * 60000); }
export function slots(S, sid, ds) {
  const s = S.services.find((x) => x.id === +sid && x.active);
  if (!s) err(404, 'Service not found');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(ds))) err(400, 'Bad date');
  const tz = S.me.timezone || 'UTC';
  const ranges = S.me.availability?.[new Date(`${ds}T12:00:00Z`).getUTCDay()] || [];
  const earliest = Date.now() + (s.notice_hours || 0) * 3600e3; const out = [];
  for (const [f, t] of ranges) {
    let x = zoned(ds, f, tz).getTime(); const end = zoned(ds, t, tz).getTime();
    while (x + s.duration_min * 60e3 <= end) {
      const st = x, en = x + s.duration_min * 60e3;
      const clash = S.bookings.some((b) => ['confirmed', 'pending'].includes(b.status) && (b.status === 'confirmed' || Date.now() - new Date(b.created_at.replace(' ', 'T')).getTime() < 30 * 60e3) && st < new Date(b.end_at).getTime() + (s.buffer_min || 0) * 60e3 && en + (s.buffer_min || 0) * 60e3 > new Date(b.start_at).getTime());
      if (st >= earliest && !clash) out.push(iso(new Date(st)));
      x += 30 * 60e3;
    }
  }
  return { timezone: tz, duration_min: s.duration_min, slots: out };
}

// ---------- 通知、线索、品牌 ----------
export function notify(ctx, kind, title, body, link) {
  ctx.S.notifications.unshift({ id: ctx.id(), kind, title, body, link, read: 0, created_at: local() });
  ctx.S.notifications.length = Math.min(ctx.S.notifications.length, 200);
  ctx.emit({ type: 'notification', notification: { title } });
}
export function addLead(ctx, l) {
  const lead = { id: ctx.id(), kind: 'brand', name: '', email: '', company: '', budget: '', message: '', source: 'form', status: 'new', deal_id: null, created_at: local(), ...l };
  ctx.S.leads.push(lead);
  notify(ctx, 'lead', `New ${lead.kind} inquiry${lead.company ? ' from ' + lead.company : ''}`, lead.message, '#/leads');
  ctx.emit({ type: 'business' });
  trigger(ctx, 'lead', `New ${lead.kind} lead: ${[lead.name, lead.company, lead.email].filter(Boolean).join(' · ')}${lead.budget ? ` · budget ${lead.budget}` : ''}\nMessage: ${lead.message}\n(Lead #${lead.id})`, lead.kind);
  return lead;
}
export function upsertBrand(ctx, b) {
  const S = ctx.S;
  let x = S.brands.find((y) => y.name.toLowerCase() === String(b.name).toLowerCase());
  if (x) { Object.assign(x, Object.fromEntries(Object.entries(b).filter(([, v]) => v))); return x; }
  x = { id: ctx.id(), website: '', category: '', contact_name: '', contact_email: '', notes: '', created_at: local(), ...b };
  S.brands.push(x); return x;
}
export function createDeal(ctx, b) {
  if (!String(b.brand_name || '').trim()) err(400, 'Brand name is required');
  const br = upsertBrand(ctx, { name: String(b.brand_name).trim(), contact_email: b.contact_email || '', contact_name: b.contact_name || '', category: b.category || '' });
  const d = { id: ctx.id(), brand_id: br.id, title: b.title || `${br.name} collaboration`, stage: b.stage || 'lead', amount_cents: Math.round((+b.amount || 0) * 100), platforms: b.platforms || '', usage_rights: b.usage_rights || '', exclusivity: b.exclusivity || '', due_date: b.due_date || null, contract_url: b.contract_url || '', invoice_url: '', notes: b.notes || '', source: b.source || 'manual', paid_at: null, created_at: local(), updated_at: local() };
  ctx.S.deals.push(d);
  ctx.emit({ type: 'business' });
  return d;
}
export function convertLead(ctx, lid) {
  const l = ctx.S.leads.find((x) => x.id === +lid) || err(404, 'Lead not found');
  if (l.deal_id) return dealView(ctx.S, ctx.S.deals.find((d) => d.id === l.deal_id) || err(404, 'Deal not found'));
  const d = createDeal(ctx, { brand_name: l.company || l.name || l.email, contact_email: l.email, contact_name: l.name, title: `${l.company || l.name || 'Inbound'} — inbound`, notes: l.message + (l.budget ? `\nBudget: ${l.budget}` : ''), source: l.source });
  l.status = 'converted'; l.deal_id = d.id;
  return dealView(ctx.S, d);
}
export function markDealPaid(ctx, d) {
  d.stage = 'paid'; d.paid_at = local(); d.updated_at = local();
  if (!ctx.S.orders.some((o) => o.deal_id === d.id && o.status === 'paid')) ctx.S.orders.push({ id: ctx.id(), kind: 'deal', deal_id: d.id, amount_cents: d.amount_cents, fee_cents: 0, status: 'paid', paid_at: local(), created_at: local(), buyer_name: brandOf(ctx.S, d).name });
}

// ---------- 订单 ----------
export function createOrder(ctx, o) {
  const order = { id: ctx.id(), status: 'pending', fee_cents: 0, created_at: local(), ...o };
  order.ref = newRef(ctx.uid, 'order', order.id);
  ctx.S.orders.push(order);
  return order;
}
// 付款完成（Stripe webhook 或测试模式）：发货、确认预约、通知创作者、给买家发确认邮件
export async function fulfill(ctx, order, { stripeSession } = {}) {
  const S = ctx.S;
  if (order.status === 'paid') return;
  order.status = 'paid'; order.paid_at = local();
  if (stripeSession) order.stripe_session = stripeSession;
  let mail;
  if (order.kind === 'product') {
    const p = S.products.find((x) => x.id === order.product_id) || {};
    notify(ctx, 'order', `New sale: ${p.title}`, `${order.buyer_name || order.buyer_email} paid ${usd(order.amount_cents)}`, '#/products');
    trigger(ctx, 'order', `New sale: "${p.title}" for ${usd(order.amount_cents)} to ${order.buyer_name || ''} <${order.buyer_email}>.`);
    const parts = [`Thanks for buying ${p.title}!`];
    if (p.file_path) parts.push(`Download: ${PUBLIC_URL()}/api/public/download/${order.ref}`);
    if (p.delivery_note) parts.push(p.delivery_note);
    parts.push(`Order details: ${ctx.publicUrl}?order=${order.ref}`);
    mail = { subject: `Your purchase: ${p.title}`, text: parts.join('\n\n') };
  }
  if (order.kind === 'booking') {
    const b = S.bookings.find((x) => x.id === order.booking_id);
    const sv = S.services.find((x) => x.id === b?.service_id) || {};
    if (b) b.status = 'confirmed';
    notify(ctx, 'booking', `New booking: ${sv.title || 'call'}`, b?.name, '#/booking');
    trigger(ctx, 'booking', `New booking for "${sv.title}" on ${b?.start_at} with ${b?.name} <${b?.email}>.\nIntake answers: ${JSON.stringify(b?.answers || {})}`);
    mail = { subject: `Booked: ${sv.title} with ${S.me.name}`, text: `You're booked for ${sv.title} with ${S.me.name}.\n\nWhen: ${new Date(b.start_at).toUTCString()}\nWhere: ${sv.location || 'details to follow'}\n\nAdd to calendar: ${PUBLIC_URL()}/api/public/order/${order.ref}/ics` };
  }
  if (order.kind === 'deal') {
    const d = S.deals.find((x) => x.id === order.deal_id);
    if (d) { d.stage = 'paid'; d.paid_at = local(); d.updated_at = local(); notify(ctx, 'deal', `Invoice paid: ${brandOf(S, d).name}`, usd(order.amount_cents), '#/deals'); }
  }
  ctx.emit({ type: 'business' });
  ctx.save();
  if (mail && order.buyer_email) sendMail({ to: order.buyer_email, ...mail, fromName: S.me.name, replyTo: S.me.email }).catch((e) => console.error('receipt email', e.message));
}

// ---------- 自动化触发（事件型） ----------
let runner = null; // ai.js 注册：(ctx, automation, reason) => void
export const setAutomationRunner = (fn) => { runner = fn; };
export function trigger(ctx, kind, text, filterTarget) {
  for (const x of ctx.S.automations.filter((a) => a.enabled && a.trigger === kind)) {
    const hay = `${filterTarget || ''} ${text}`.toLowerCase();
    if (x.filter && !hay.includes(String(x.filter).toLowerCase())) continue;
    runner?.(ctx, x, text);
  }
}

export const meView = (ctx, extra = {}) => {
  const { S } = ctx;
  return { ...S.me, plan_info: plan(S), usage: usage(S), public_url: ctx.publicUrl, ...extra };
};
