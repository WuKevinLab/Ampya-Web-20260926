// 初始数据：新账号的空白工作区，以及可选的演示账号（示例创作者 Ava Lee）
import { TEMPLATES } from './templates.js';

const now = () => new Date();
const iso = (d) => d.toISOString();
export const local = (d = now()) => { const z = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())} ${z(d.getHours())}:${z(d.getMinutes())}:${z(d.getSeconds())}`; };
const daysAgo = (n, h = 10) => { const d = now(); d.setDate(d.getDate() - n); d.setHours(h, 12, 0, 0); return local(d); };
const inDays = (n) => { const d = now(); d.setDate(d.getDate() + n); return local(d).slice(0, 10); };
const monthAgo = (m, day = 12) => { const d = now(); d.setDate(1); d.setMonth(d.getMonth() - m); d.setDate(Math.min(day, 28)); d.setHours(11, 0, 0, 0); return local(d); };

const EMPTY = () => ({ seq: 100, me: null, agents: [], convs: [], messages: [], memories: [], automations: [], runs: [], approvals: [], devices: [], socials: [], brands: [], deals: [], deliverables: [], products: [], orders: [], services: [], bookings: [], links: [], earnings: [], leads: [], knowledge: [], twin: [], notifications: [], wallet: [], mailbox: [], commands: [], files: {}, usage: {} });
const DEFAULT_APPROVAL = () => ({ email: true, sms: true, call: true, exec: false, local: true, payment: true });

// 新注册创作者：资料 + 入门团队（模板里的 starter_team）+ 默认自动化
export function newState({ name, handle, email }) {
  const S = EMPTY();
  S.me = {
    id: 0, email, name, handle, bio: '', niche: '', location: '', timezone: 'America/New_York',
    color: '#6c4cff', shape: 'blob', voice: '', plan: 'free', plan_status: 'active', onboarded: 0, created_at: local(), stripe_charges_enabled: 0,
    rate_card: {},
    page: { show_products: true, show_booking: true, show_links: true, show_collab: true, show_rates: true, links: [] },
    twin: { enabled: true, name: `${name.split(' ')[0]}'s AI`, greeting: `Hi! I'm ${name.split(' ')[0]}'s AI assistant. Ask me about products, coaching calls, or working together.`, instructions: '' },
    availability: { 1: [['10:00', '16:00']], 2: [['10:00', '16:00']], 3: [['10:00', '16:00']], 4: [['10:00', '16:00']], 5: [['10:00', '14:00']] },
  };
  for (const key of TEMPLATES.starter_team) {
    const t = TEMPLATES.agents.find((a) => a.key === key);
    const id = ++S.seq;
    S.agents.push({ id, name: t.name, role: t.role, color: t.color, shape: t.shape, instructions: t.instructions, email: '', approval: DEFAULT_APPROVAL(), channels: {}, connections: {}, budget_cents: 0, phone: null, created_at: local(), template: key });
    S.convs.push({ id: ++S.seq, type: 'agent', agent_id: id, title: t.name, goal: '' });
  }
  for (const a of TEMPLATES.automations) {
    const agent = S.agents.find((x) => x.template === a.agent) || S.agents[0];
    S.automations.push({ id: ++S.seq, agent_id: agent.id, name: a.name, trigger: a.trigger, cron: a.cron || null, filter: a.filter || '', prompt: a.prompt, enabled: a.trigger === 'cron' || a.trigger === 'lead' ? 1 : 0, last_run_at: null });
  }
  return S;
}

// 演示账号：完整的示例数据，方便第一次部署后直接体验
export function demoState() {
  const S = EMPTY();
  S.me = {
    id: 1, email: 'ava@avalee.studio', name: 'Ava Lee', handle: 'avalee', bio: 'Honest tech reviews for busy people. New video every Thursday.', niche: 'Consumer tech', location: 'Austin, TX', timezone: 'America/Chicago',
    color: '#6c4cff', shape: 'blob', voice: 'Friendly, direct, a little nerdy. Short sentences. No hype.', plan: 'free', plan_status: 'active', onboarded: 0, created_at: daysAgo(64), stripe_charges_enabled: 0,
    rate_card: { youtube_integration: 300000, youtube_dedicated: 650000, instagram_reel: 120000, tiktok_video: 90000 },
    page: { show_products: true, show_booking: true, show_links: true, show_collab: true, show_rates: true, links: [{ title: '▶ Latest video: Is the $299 phone finally good?', url: 'https://example.com/latest' }, { title: '📬 The Thursday Tech newsletter', url: 'https://example.com/newsletter' }] },
    twin: { enabled: true, name: "Ava's AI", greeting: "Hi! I'm Ava's AI assistant. Ask me about her gear, products, coaching calls, or working together.", instructions: "Recommend the Creator Notion Template to new YouTubers. Ava doesn't take gambling, crypto or vape sponsorships." },
    availability: { 1: [['10:00', '16:00']], 2: [['10:00', '16:00']], 3: [['13:00', '17:00']], 4: [['10:00', '16:00']], 5: [['10:00', '13:00']] },
  };
  const A = (o) => ({ approval: { email: true, sms: true, call: true, exec: false, local: true, payment: true }, channels: {}, connections: {}, budget_cents: 5000, phone: null, created_at: daysAgo(60), ...o });
  S.agents = [
    A({ id: 1, name: 'Max', role: 'Business Manager', color: '#6c4cff', shape: 'blob', email: 'max@crew.avalee.studio', instructions: 'Own the brand-deal pipeline end to end: triage inquiries, qualify brands, negotiate within the rate card, track deliverables, invoice on delivery and chase unpaid invoices after 7 and 14 days. Send a weekly business summary every Monday.'}),
    A({ id: 2, name: 'Remy', role: 'Partnerships & Pitches', color: '#ff7ac6', shape: 'circle', email: 'remy@crew.avalee.studio', instructions: 'Find brand partners that fit the niche and audience, research each brand, and write short, specific pitches with 2–3 content ideas and a price anchored on the rate calculator.' }),
  ];
  S.convs = [{ id: 1, type: 'agent', agent_id: 1, title: 'Max', goal: '' }, { id: 2, type: 'agent', agent_id: 2, title: 'Remy', goal: '' }];
  const M = (conv, sender, content, extra = {}) => S.messages.push({ id: ++S.seq, conversation_id: conv, sender, agent_id: sender === 'agent' ? (extra.agent_id || conv) : null, channel: 'app', content, steps: [], attachments: [], created_at: extra.at || daysAgo(1), ...extra });
  M(1, 'system', '⏰ Automation "Weekly business summary" triggered. Do this: send the creator a short weekly business summary and the top 3 priorities.', { at: daysAgo(2, 9) });
  M(1, 'agent', "**Your week at a glance**\n\n- **Earned this month:** $5,935 across brand deals, products, coaching and affiliate\n- **Open pipeline:** $12,100 across 5 deals\n- **Unpaid:** Orbit Earbuds — $3,000, invoiced 9 days ago\n\n**Top 3 priorities**\n1. Approve the follow-up to Orbit (drafted, waiting for you)\n2. Northwind integration is due in 5 days — script draft is in my workspace\n3. BrandCo asked about a January smart-ring video — worth a call", { agent_id: 1, at: daysAgo(2, 9), steps: [{ text: 'Business overview', status: 'done' }, { text: 'Checking deals', status: 'done' }, { text: 'Writing file: weekly-summary.md', status: 'done' }] });
  M(1, 'user', 'Chase the Orbit invoice please — keep it friendly', { at: daysAgo(1, 16) });
  M(1, 'agent', "Drafted a friendly nudge to Orbit's partnerships lead with the payment link. It's waiting for your approval — I'll follow up again Friday if it's still open.", { agent_id: 1, at: daysAgo(1, 16), steps: [{ text: 'Checking deals: invoiced', status: 'done' }, { text: 'Email: maya@orbit.example', status: 'waiting' }] });
  M(2, 'user', 'Find me 3 brands in desk setup / productivity that sponsor tech YouTubers right now', { at: daysAgo(3, 14) });
  M(2, 'agent', "Here are three good fits, all added to your pipeline as **leads**:\n\n| Brand | Why it fits | Angle |\n|---|---|---|\n| Lumen Lamps | Ran 12 creator integrations this quarter | “My 3-light desk setup under $200” |\n| Fieldnote | Notebook + app combo, loves productivity creators | 30-day analog/digital workflow test |\n| Kettle Coffee | Sponsors morning-routine shorts | Routine short + IG story set |\n\nWant me to draft pitches for any of them?", { agent_id: 2, at: daysAgo(3, 14), steps: [{ text: 'Searching the web: desk setup brands sponsoring YouTubers 2026', status: 'done' }, { text: 'Searching the web: Lumen Lamps creator program', status: 'done' }, { text: 'Creating deal: Lumen Lamps', status: 'done' }, { text: 'Creating deal: Fieldnote', status: 'done' }, { text: 'Creating deal: Kettle Coffee', status: 'done' }] });
  S.memories = [{ id: 1, agent_id: 1, content: "No gambling, crypto or vape sponsors.", created_at: daysAgo(40) }, { id: 2, agent_id: 1, content: 'Prefers integrations of 60–90s, max 2 sponsors per month.', created_at: daysAgo(30) }, { id: 3, agent_id: 2, content: 'Ava films on Tuesdays; deliverables need 10 days lead time.', created_at: daysAgo(20) }];
  S.automations = [
    { id: 1, agent_id: 1, name: 'Weekly business summary', trigger: 'cron', cron: '0 9 * * 1', filter: '', prompt: 'Send the creator a short weekly business summary and the top 3 priorities.', enabled: 0, last_run_at: daysAgo(2, 9) },
    { id: 2, agent_id: 1, name: 'Qualify new brand leads', trigger: 'lead', cron: null, filter: 'brand', prompt: 'Research the brand, judge fit and budget, convert to a deal if promising, and draft a reply for approval.', enabled: 1, last_run_at: daysAgo(0, 8) },
    { id: 3, agent_id: 1, name: 'Chase unpaid invoices', trigger: 'cron', cron: '0 10 * * 1-5', filter: '', prompt: 'Find invoices unpaid for 7+ days and draft polite follow-ups for approval.', enabled: 0, last_run_at: daysAgo(1, 10) },
  ];
  S.runs = [{ id: 1, automation_id: 1, status: 'done', started_at: daysAgo(2, 9) }, { id: 2, automation_id: 2, status: 'done', started_at: daysAgo(0, 8) }, { id: 3, automation_id: 3, status: 'done', started_at: daysAgo(1, 10) }];
  S.approvals = [{ id: 1, agent_id: 1, conversation_id: 1, kind: 'email', summary: 'Email maya@orbit.example: "Quick nudge on the unboxing invoice"', status: 'pending', created_at: daysAgo(1, 16),
    payload: { to: 'maya@orbit.example', subject: 'Quick nudge on the unboxing invoice', body: "Hi Maya,\n\nHope launch week went well! The unboxing video has been live since the 6th and is already past 80k views.\n\nJust a friendly reminder about the $3,000 invoice — here's the card payment link again: https://pay.example/inv_orbit\n\nThanks so much,\nMax\n(on behalf of Ava Lee)" } }];
  S.socials = [
    { id: 1, platform: 'youtube', handle: '@avalee', url: 'https://youtube.com/@avalee', followers: 184000, avg_views: 62000, engagement_rate: 5.1, audience: '25–34 · 68% US · 61% male', updated_at: daysAgo(3) },
    { id: 2, platform: 'tiktok', handle: '@avatech', url: 'https://tiktok.com/@avatech', followers: 97000, avg_views: 40000, engagement_rate: 6.2, audience: '18–24 · 55% US', updated_at: daysAgo(9) },
    { id: 3, platform: 'instagram', handle: '@ava.tech', url: 'https://instagram.com/ava.tech', followers: 52000, avg_views: 18000, engagement_rate: 3.4, audience: '25–34 · 60% US', updated_at: daysAgo(9) },
    { id: 4, platform: 'newsletter', handle: 'Thursday Tech', url: 'https://example.com/newsletter', followers: 21000, avg_views: 0, engagement_rate: 48, audience: '52% open rate', updated_at: daysAgo(12) },
  ];
  const brands = [['Northwind VPN', 'Software', 'Jon Park', 'partners@northwind.example'], ['Orbit Earbuds', 'Audio', 'Maya Ruiz', 'maya@orbit.example'], ['Brightpack', 'Bags', 'Lee Chen', 'creators@brightpack.example'], ['Lumen Lamps', 'Home office', '', 'hello@lumen.example'], ['Fieldnote', 'Productivity', '', ''], ['Kettle Coffee', 'Food & drink', 'Sam Ortiz', 'sam@kettle.example'], ['Pixel Mount', 'Accessories', 'Ana Silva', 'ana@pixelmount.example'], ['Acme Audio', 'Audio', 'Rae Kim', 'rae@acme.example']];
  S.brands = brands.map((b, i) => ({ id: i + 1, name: b[0], website: `https://${b[0].toLowerCase().replace(/\s+/g, '')}.example`, category: b[1], contact_name: b[2], contact_email: b[3], notes: '', created_at: daysAgo(50 - i) }));
  const D = (id, brand_id, title, stage, amount, o = {}) => S.deals.push({ id, brand_id, title, stage, amount_cents: amount * 100, platforms: 'YouTube', usage_rights: '', exclusivity: '', due_date: null, contract_url: '', invoice_url: '', notes: '', source: 'manual', paid_at: null, created_at: daysAgo(30), updated_at: daysAgo(5), ...o });
  D(1, 1, 'Q4 integration', 'contracted', 4200, { usage_rights: '30 days paid social', exclusivity: 'No VPNs for 60 days', due_date: inDays(9) });
  D(2, 2, 'Unboxing video', 'invoiced', 3000, { invoice_url: 'https://pay.example/inv_orbit', updated_at: daysAgo(9) });
  D(3, 3, 'Backpack review', 'delivered', 2500, { platforms: 'YouTube, Instagram' });
  D(4, 4, 'Desk setup reel', 'pitched', 1800, { platforms: 'Instagram', source: 'agent' });
  D(5, 5, '30-day workflow test', 'lead', 0, { source: 'agent' });
  D(6, 6, 'Morning routine short', 'paid', 900, { platforms: 'TikTok', paid_at: daysAgo(6) });
  D(7, 7, 'Phone mount integration', 'paid', 2800, { paid_at: monthAgo(1, 18) });
  D(8, 8, 'Headphones launch', 'negotiating', 3600, { platforms: 'YouTube, TikTok', source: 'inbound_email', usage_rights: '60 days paid', due_date: inDays(24) });
  S.deliverables = [
    { id: 1, deal_id: 1, title: '60–90s YouTube integration', platform: 'YouTube', due_date: inDays(5), status: 'draft', link: '' },
    { id: 2, deal_id: 1, title: 'Pinned comment + description link', platform: 'YouTube', due_date: inDays(5), status: 'todo', link: '' },
    { id: 3, deal_id: 3, title: 'Review video', platform: 'YouTube', due_date: inDays(-3), status: 'posted', link: 'https://example.com/v/backpack' },
    { id: 4, deal_id: 3, title: 'IG story set (3 frames)', platform: 'Instagram', due_date: inDays(2), status: 'approved', link: '' },
    { id: 5, deal_id: 8, title: 'Dedicated TikTok', platform: 'TikTok', due_date: inDays(24), status: 'todo', link: '' },
  ];
  S.products = [
    { id: 1, type: 'template', title: 'Creator Notion Template', slug: 'creator-notion-template', tagline: 'Plan a month of videos in one afternoon', description: '**What you get**\n\n- Content calendar with status board\n- Sponsor tracker with rate calculator\n- Script template I use every week\n\nDuplicate it into your Notion in one click.', price_cents: 2900, interval: null, file_path: '1-creator-os.zip', delivery_note: 'Open the duplicate link inside the PDF to copy the template into your workspace.', active: 1, featured: 1, created_at: daysAgo(90) },
    { id: 2, type: 'membership', title: 'Inner Circle', slug: 'inner-circle', tagline: 'Monthly live Q&A + private Discord', description: 'Join 140+ creators. One live Q&A a month, gear deals first, and a private Discord.', price_cents: 1200, interval: 'month', file_path: null, delivery_note: 'Your Discord invite: https://discord.example/ava', active: 1, featured: 0, created_at: daysAgo(80) },
    { id: 3, type: 'ebook', title: 'Gear Guide 2026', slug: 'gear-guide-2026', tagline: 'Every piece of gear I use, and why', description: 'Cameras, mics, lights and the cheap upgrades that matter most.', price_cents: 0, interval: null, file_path: '3-gear-guide.pdf', delivery_note: '', active: 1, featured: 0, created_at: daysAgo(70) },
    { id: 4, type: 'course', title: 'Sponsorship Playbook', slug: 'sponsorship-playbook', tagline: 'Land your first $2k brand deal', description: 'Draft — 6 lessons on pricing, pitching and contracts.', price_cents: 9900, interval: null, file_path: null, delivery_note: '', active: 0, featured: 0, created_at: daysAgo(2) },
  ];
  const names = ['Jordan P.', 'Riley S.', 'Casey M.', 'Taylor W.', 'Morgan K.', 'Jamie L.', 'Drew H.', 'Alex R.', 'Sam B.', 'Quinn D.', 'Avery T.', 'Blake N.'];
  const O = (o) => S.orders.push({ id: ++S.seq, buyer_name: names[S.seq % names.length], buyer_email: `${names[S.seq % names.length].split(' ')[0].toLowerCase()}@example.com`, fee_cents: 0, status: 'paid', simulated: 1, created_at: o.paid_at, ...o });
  // 6 个月的历史收入（让图表有内容）
  const plan = [[5, 1, 4, 2, 0, 1, 1800], [4, 2, 6, 2, 1, 0, 0], [3, 3, 9, 3, 2, 1, 2200], [2, 4, 11, 4, 2, 0, 0], [1, 6, 14, 5, 3, 1, 0], [0, 4, 9, 5, 2, 0, 0]];
  for (const [m, prodSales, , members, calls] of plan) {
    for (let i = 0; i < prodSales * 3; i++) O({ kind: 'product', product_id: 1, amount_cents: 2900, fee_cents: 232, paid_at: monthAgo(m, 2 + i) });
    for (let i = 0; i < members * 6; i++) O({ kind: 'product', product_id: 2, amount_cents: 1200, fee_cents: 96, paid_at: monthAgo(m, 3 + i) });
    for (let i = 0; i < calls; i++) O({ kind: 'booking', amount_cents: 15000, fee_cents: 1200, paid_at: monthAgo(m, 8 + i * 5) });
  }
  O({ kind: 'deal', deal_id: 6, amount_cents: 90000, paid_at: daysAgo(6) });
  O({ kind: 'deal', deal_id: 7, amount_cents: 280000, paid_at: monthAgo(1, 18) });
  O({ kind: 'deal', amount_cents: 350000, paid_at: monthAgo(2, 20) });
  O({ kind: 'deal', amount_cents: 220000, paid_at: monthAgo(3, 9) });
  O({ kind: 'deal', amount_cents: 410000, paid_at: monthAgo(4, 14) });
  O({ kind: 'deal', amount_cents: 180000, paid_at: monthAgo(5, 22) });
  S.earnings = [5, 4, 3, 2, 1, 0].map((m, i) => ({ id: i + 1, link_id: null, network: 'Amazon Associates', amount_cents: [6200, 7400, 9100, 8800, 11200, 8640][i], period: monthAgo(m).slice(0, 7), note: '', created_at: monthAgo(m) }));
  S.services = [
    { id: 1, title: '45-min channel audit', slug: 'channel-audit', description: 'I review your last 10 videos and give you a concrete growth plan.', duration_min: 45, price_cents: 15000, questions: ['Channel link?', 'Biggest goal right now?'], location: 'https://zoom.example/j/ava', buffer_min: 15, notice_hours: 24, active: 1 },
    { id: 2, title: 'Sponsorship rate review', slug: 'rate-review', description: '30 minutes to price your next brand deal with confidence.', duration_min: 30, price_cents: 9000, questions: ['Which brand / deliverables?'], location: 'https://zoom.example/j/ava', buffer_min: 15, notice_hours: 24, active: 1 },
  ];
  const B = (id, sid, days, hour, name, answers, status = 'confirmed') => { const d = now(); d.setDate(d.getDate() + days); d.setUTCHours(hour, 0, 0, 0); S.bookings.push({ id, service_id: sid, start_at: iso(d), end_at: iso(new Date(d.getTime() + 45 * 60e3)), name, email: `${name.split(' ')[0].toLowerCase()}@example.com`, answers, status, notes: '', created_at: daysAgo(3) }); };
  B(1, 1, 1, 17, 'Priya N.', { 'Channel link?': 'youtube.com/@priyabuilds', 'Biggest goal right now?': 'Get to 10k subs' });
  B(2, 2, 3, 19, 'Marcus T.', { 'Which brand / deliverables?': 'Squarespace, 1 integration' });
  B(3, 1, -5, 16, 'Dana F.', { 'Channel link?': 'youtube.com/@danacooks' }, 'completed');
  S.links = [
    { id: 1, title: 'Sony ZV-E10 II', slug: 'zv-e10', url: 'https://www.example.com/zv-e10?tag=avalee-20', network: 'Amazon Associates', commission: '3%', category: 'Camera', note: 'Best starter camera for YouTube', featured: 1, clicks: 1840, clicks_30d: 312 },
    { id: 2, title: 'Shure MV7+', slug: 'mv7', url: 'https://www.example.com/mv7?tag=avalee-20', network: 'Amazon Associates', commission: '3%', category: 'Audio', note: 'The mic I record every video with', featured: 1, clicks: 1325, clicks_30d: 201 },
    { id: 3, title: 'Elgato Key Light', slug: 'key-light', url: 'https://www.example.com/keylight?tag=avalee-20', network: 'Amazon Associates', commission: '3%', category: 'Lighting', note: 'Soft, even light on any desk', featured: 1, clicks: 960, clicks_30d: 148 },
    { id: 4, title: 'Northwind VPN', slug: 'northwind', url: 'https://northwind.example/?ref=ava', network: 'Impact', commission: '$20/sale', category: 'Software', note: '3 months free with my link', featured: 1, clicks: 702, clicks_30d: 96 },
  ];
  S.leads = [
    { id: 1, kind: 'brand', name: 'Kim Patel', email: 'kim@brandco.example', company: 'BrandCo', budget: '$5k–$15k', message: 'We would love a dedicated video for our new smart ring in January.', source: 'form', status: 'new', deal_id: null, created_at: daysAgo(0, 8) },
    { id: 2, kind: 'brand', name: 'Sam', email: 'sam@glowco.example', company: 'GlowCo', budget: '~$8k', message: 'Smart lamp launch in March — YouTube integration + 2 shorts.', source: 'twin', status: 'new', deal_id: null, created_at: daysAgo(1, 21) },
    { id: 3, kind: 'coaching', name: 'Lena', email: 'lena@example.com', company: '', budget: '', message: 'Do you do coaching for podcasters?', source: 'twin', status: 'contacted', deal_id: null, created_at: daysAgo(4) },
    { id: 4, kind: 'brand', name: 'Rae Kim', email: 'rae@acme.example', company: 'Acme Audio', budget: '$3–4k', message: 'Headphones launch, flexible on format.', source: 'email', status: 'converted', deal_id: 8, created_at: daysAgo(12) },
  ];
  S.knowledge = [
    { id: 1, question: 'What camera do you use?', answer: 'A Sony ZV-E10 II with the kit lens, plus a Sigma 16mm for talking-head shots.', public: 1 },
    { id: 2, question: 'Do you do sponsorships?', answer: "Yes — 1–2 per month, mostly tech and productivity. No gambling, crypto or vapes. Media kit has starting rates.", public: 1 },
    { id: 3, question: 'How often do you post?', answer: 'Long videos every Thursday, shorts 3x a week.', public: 1 },
  ];
  S.twin = [
    { id: 1, visitor: 'v1', lead_id: 2, created_at: daysAgo(1, 21), updated_at: daysAgo(1, 21), messages: [{ role: 'user', content: "Hi! We're GlowCo — would Ava be up for a sponsored video in March?" }, { role: 'assistant', content: "Love that! Ava does 1–2 sponsorships a month in tech and home office. Her media kit is here: the “See my media kit” link on this page. What's the product and rough budget?" }, { role: 'user', content: 'Smart lamp, YouTube integration + 2 shorts, ~$8k. sam@glowco.example' }, { role: 'assistant', content: "Perfect — I've passed this to Ava's team. Expect a proposal within 2 business days ✨" }] },
    { id: 2, visitor: 'v2', lead_id: null, created_at: daysAgo(2, 13), updated_at: daysAgo(2, 13), messages: [{ role: 'user', content: 'what mic do you use??' }, { role: 'assistant', content: 'Ava records every video with the Shure MV7+ → go/mv7 (affiliate link). For budget setups she likes a lav mic too.' }] },
  ];
  S.notifications = [{ id: 1, kind: 'lead', title: 'New brand inquiry from BrandCo', body: '', link: '#/leads', read: 0, created_at: daysAgo(0, 8) }];
  S.wallet = [{ id: 1, agent_id: 1, amount_cents: 10000, kind: 'topup', description: 'Manual credit', created_at: daysAgo(20) }, { id: 2, agent_id: 1, amount_cents: -2350, kind: 'purchase', description: 'USPS: return Brightpack sample', created_at: daysAgo(4) }];
  S.mailbox = [
    { id: 1, agent_id: 1, direction: 'in', channel: 'email', peer: 'rae@acme.example', subject: 'Headphones launch — creator partnership', body: "Hi! We're launching new headphones in November and would love Ava on board...", status: 'read', created_at: daysAgo(12) },
    { id: 2, agent_id: 1, direction: 'out', channel: 'email', peer: 'rae@acme.example', subject: 'Re: Headphones launch — creator partnership', body: 'Thanks Rae! Ava would love to take a look. Attached is her media kit...', status: 'sent', created_at: daysAgo(11) },
  ];
  S.commands = [{ id: 1, agent_id: 1, command: 'python3 summarize_q4.py', output: 'Q4 so far: $11,435 (deals 62%, products 24%, coaching 9%, affiliate 5%)\nwrote q4-summary.csv', exit_code: 0, created_at: daysAgo(2) }];
  for (const p of S.products) p.file_path = null; // 演示商品没有真实文件
  return S;
}
