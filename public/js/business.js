// Creator Crew 后台 — 商业页面：总览、合作、产品、预约、链接、线索与分身、主页、自动化、审批、设置
'use strict';
let tplCache;
const getTemplates = async () => (tplCache ||= await api('/templates'));
const STAGES = [['lead', 'Lead'], ['pitched', 'Pitched'], ['negotiating', 'Negotiating'], ['contracted', 'Contracted'], ['in_production', 'In production'], ['delivered', 'Delivered'], ['invoiced', 'Invoiced'], ['paid', 'Paid'], ['lost', 'Lost']];
const STAGE = Object.fromEntries(STAGES);
const STREAMS = [['deals', 'Brand deals', 'var(--s1)'], ['products', 'Products', 'var(--s2)'], ['bookings', 'Coaching', 'var(--s3)'], ['affiliate', 'Affiliate', 'var(--s4)']];
function upgradePrompt(msg) {
  const { el, close } = modal(`<h2>Time to upgrade</h2><p>${esc(msg)}</p><div class="foot"><button class="btn" data-close>Not now</button><button class="btn brand" id="up">See plans</button></div>`);
  $('#up', el).onclick = () => { close(); location.hash = '#/settings/billing'; };
}

// ================= 总览 =================
function revenueChart(months) {
  const W = 640, H = 200, pad = { l: 44, r: 8, t: 10, b: 24 };
  const max = Math.max(1, ...months.map((m) => STREAMS.reduce((a, [k]) => a + m[k], 0)));
  const nice = (v) => { const p = 10 ** Math.floor(Math.log10(v)); return Math.ceil(v / p) * p; };
  const top = nice(max);
  const bw = Math.min(46, (W - pad.l - pad.r) / months.length - 18);
  const y = (v) => pad.t + (H - pad.t - pad.b) * (1 - v / top);
  const step = (W - pad.l - pad.r) / months.length;
  let bars = '';
  months.forEach((m, i) => {
    const x = pad.l + i * step + (step - bw) / 2;
    let acc = 0;
    const segs = STREAMS.filter(([k]) => m[k] > 0);
    segs.forEach(([k, , color], j) => {
      const y0 = y(acc), y1 = y(acc + m[k]);
      const h = Math.max(1, y0 - y1 - (j < segs.length - 1 ? 2 : 0)); // 段间 2px 间隙
      const isTop = j === segs.length - 1;
      const r = isTop ? Math.min(4, h) : 0;
      bars += isTop
        ? `<path d="M${x},${y0} V${y0 - h + r} Q${x},${y0 - h} ${x + r},${y0 - h} H${x + bw - r} Q${x + bw},${y0 - h} ${x + bw},${y0 - h + r} V${y0} Z" fill="${color}"/>`
        : `<rect x="${x}" y="${y0 - h}" width="${bw}" height="${h}" fill="${color}"/>`;
      acc += m[k];
    });
    const label = new Date(m.month + '-15').toLocaleDateString('en-US', { month: 'short' });
    bars += `<text x="${x + bw / 2}" y="${H - 6}" text-anchor="middle" font-size="11" fill="var(--muted)">${label}</text>`;
    bars += `<rect x="${pad.l + i * step}" y="${pad.t}" width="${step}" height="${H - pad.t - pad.b}" fill="transparent" data-i="${i}"/>`;
  });
  const grid = [0, 0.5, 1].map((f) => `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y(top * f)}" y2="${y(top * f)}" stroke="var(--line)" stroke-width="1"/><text x="${pad.l - 6}" y="${y(top * f) + 4}" text-anchor="end" font-size="11" fill="var(--muted)">${usdShort(top * f)}</text>`).join('');
  return `<div class="legend">${STREAMS.map(([, l, c]) => `<span><i style="background:${c}"></i>${l}</span>`).join('')}</div>
    <div class="chart" id="rev"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Monthly revenue by stream">${grid}${bars}</svg><div class="tip" hidden></div></div>
    <details class="small muted" style="margin-top:6px"><summary>View as table</summary><table class="table"><tr><th>Month</th>${STREAMS.map(([, l]) => `<th class="num">${l}</th>`).join('')}<th class="num">Total</th></tr>${months.map((m) => `<tr><td>${m.month}</td>${STREAMS.map(([k]) => `<td class="num">${usd(m[k])}</td>`).join('')}<td class="num">${usd(STREAMS.reduce((a, [k]) => a + m[k], 0))}</td></tr>`).join('')}</table></details>`;
}
function bindChart(months) {
  const ch = $('#rev'); if (!ch) return;
  const tip = $('.tip', ch);
  $$('[data-i]', ch).forEach((r) => {
    r.onmouseenter = r.onmousemove = (e) => {
      const m = months[+r.dataset.i];
      tip.hidden = false;
      tip.innerHTML = `<b>${new Date(m.month + '-15').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</b>${STREAMS.map(([k, l, c]) => `<div class="row" style="gap:6px"><i style="width:8px;height:8px;border-radius:2px;background:${c};display:inline-block"></i><span style="flex:1">${l}</span><b>${usd(m[k])}</b></div>`).join('')}<div class="row" style="border-top:1px solid var(--line);margin-top:4px;padding-top:4px"><span style="flex:1">Total</span><b>${usd(STREAMS.reduce((a, [k]) => a + m[k], 0))}</b></div>`;
      const b = ch.getBoundingClientRect();
      tip.style.left = Math.min(b.width - 170, e.clientX - b.left + 12) + 'px'; tip.style.top = (e.clientY - b.top - 10) + 'px';
    };
    r.onmouseleave = () => (tip.hidden = true);
  });
}
async function homeView() {
  const [o, me] = await Promise.all([api('/overview'), api('/me')]);
  S.me = me; S.overview = o;
  const m = o.this_month;
  const greet = new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 18 ? 'Good afternoon' : 'Good evening';
  const setup = onboardingSteps(me, o);
  const left = setup.filter((s) => !s.done).length;
  const root = page('', `
    <div class="hero-card"><div style="flex:1;min-width:240px"><span class="sticker">✦ ${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}</span><h1>${greet}, ${esc(me.name.split(' ')[0])} 👋</h1>
      <p>${o.this_month.total ? `You've earned <b>${usd(o.this_month.total, false)}</b> this month across ${STREAMS.filter(([k]) => m[k]).length} stream${STREAMS.filter(([k]) => m[k]).length === 1 ? '' : 's'}.` : "Let's land your first win this month."} ${o.approvals ? `Your crew has <b>${o.approvals}</b> thing${o.approvals > 1 ? 's' : ''} waiting for you.` : 'Your crew is on it.'}</p>
      <div class="row wrap"><a class="btn brand" href="#/agents">Ask your crew</a><a class="btn" href="${esc(S.me.public_url)}" target="_blank">${I.ext} Your page</a></div></div>
      <div class="hero-art" aria-hidden="true"><i></i><i></i><i></i></div></div>
    ${!me.ai_ready ? '<div class="hint">⚠️ AI is not configured on this server yet (ANTHROPIC_API_KEY). Agents and the AI twin will be offline until the operator adds it.</div>' : ''}
    ${left ? `<div class="card" style="margin-bottom:14px"><div class="row"><b style="flex:1">Get set up · ${setup.length - left}/${setup.length}</b><a href="#/onboarding" class="small">Open checklist →</a></div>
      <div class="bar-line" style="height:6px;background:var(--soft2);border-radius:99px;margin-top:8px;overflow:hidden"><i style="display:block;height:100%;width:${((setup.length - left) / setup.length) * 100}%;background:var(--ok)"></i></div></div>` : ''}
    <div class="stats">
      <div class="stat"><div class="l">Earned this month</div><div class="v">${usd(m.total)}</div><div class="l">${STREAMS.map(([k, l, c]) => m[k] ? `<span style="white-space:nowrap"><i class="k" style="background:${c}"></i>${usdShort(m[k])}</span>` : '').join(' ')}</div></div>
      <div class="stat"><div class="l">Open pipeline</div><div class="v">${usd(o.pipeline_cents, false)}</div><div class="l">${o.counts.deals_open} active deals</div></div>
      <div class="stat"><div class="l">Unpaid invoices</div><div class="v ${o.unpaid_invoices.length ? 'warn-t' : ''}">${usd(o.unpaid_invoices.reduce((a, d) => a + d.amount_cents, 0), false)}</div><div class="l">${o.unpaid_invoices.length} outstanding</div></div>
      <div class="stat"><div class="l">AI twin · last 30 days</div><div class="v">${num(o.counts.twin_chats_30d)}</div><div class="l">conversations · ${num(o.counts.link_clicks_30d)} link clicks</div></div>
    </div>
    <div class="grid" style="grid-template-columns:1.5fr 1fr;margin-top:14px">
      <div class="card"><h2>Revenue by stream</h2>${revenueChart(o.months)}</div>
      <div class="card"><div class="row"><h2 style="flex:1">Needs you</h2></div>
        ${o.approvals ? `<div class="list-row"><span class="grow">✋ ${o.approvals} agent request${o.approvals > 1 ? 's' : ''} waiting</span><a class="btn sm" href="#/approvals">Review</a></div>` : ''}
        ${o.new_leads.map((l) => `<div class="list-row"><span class="grow">📨 <b>${esc(l.company || l.name || l.email)}</b> <span class="muted small">${esc(l.kind)} · ${esc(l.source)}</span><div class="small muted">${esc(l.message.slice(0, 90))}</div></span><a class="btn sm" href="#/leads">Open</a></div>`).join('')}
        ${o.unpaid_invoices.map((d) => `<div class="list-row"><span class="grow">🧾 ${esc(d.brand_name || d.title)} · ${usd(d.amount_cents)}<div class="small muted">invoiced ${fmtDate(d.updated_at)}</div></span><button class="btn sm" data-copy="${esc(d.invoice_url)}">${I.copy} Link</button></div>`).join('')}
        ${!o.approvals && !o.new_leads.length && !o.unpaid_invoices.length ? '<div class="empty">All clear ✓</div>' : ''}
      </div>
    </div>
    <div class="grid g3" style="margin-top:14px">
      <div class="card"><div class="row"><h2 style="flex:1">Deliverables due</h2><a class="small" href="#/deals">All deals →</a></div>
        ${o.upcoming_deliverables.map((x) => `<div class="list-row"><span class="grow">${esc(x.title)}<div class="small muted">${esc(x.brand_name || x.deal_title)} · ${esc(x.platform || '')}</div></span><span class="small">${x.due_date ? dueLabel(x.due_date) : '<span class="muted">no date</span>'}</span></div>`).join('') || '<div class="empty">Nothing due</div>'}</div>
      <div class="card"><div class="row"><h2 style="flex:1">Upcoming calls</h2><a class="small" href="#/booking">Booking →</a></div>
        ${o.upcoming_bookings.map((b) => `<div class="list-row"><span class="grow">${esc(b.title)}<div class="small muted">${esc(b.name)}</div></span><span class="small">${fmtWhen(b.start_at, me.timezone)}</span></div>`).join('') || '<div class="empty">No calls booked</div>'}</div>
      <div class="card"><div class="row"><h2 style="flex:1">Recent sales</h2><a class="small" href="#/products">Products →</a></div>
        ${o.recent_orders.map((x) => `<div class="list-row"><span class="grow">${esc(x.product_title || ({ deal: 'Brand deal', booking: 'Coaching call' }[x.kind] || x.kind))}<div class="small muted">${esc(x.buyer_name || x.buyer_email || '')}</div></span><b>${usd(x.amount_cents)}</b></div>`).join('') || '<div class="empty">No sales yet</div>'}</div>
    </div>`);
  bindChart(o.months);
  $$('[data-copy]', root).forEach((b) => (b.onclick = () => copyText(b.dataset.copy)));
}
function onboardingSteps(me, o) {
  return [
    { done: !!me.bio && !!me.niche, label: 'Add your bio and niche', href: '#/page' },
    { done: (o.counts?.socials || 0) > 0, label: 'Add your platform stats (for rates & media kit)', href: '#/page/audience' },
    { done: Object.keys(me.rate_card || {}).length > 0, label: 'Set your starting rates', href: '#/page/rates' },
    { done: o.counts?.products > 0, label: 'Create your first product', href: '#/products' },
    { done: !!me.stripe_charges_enabled, label: 'Connect Stripe to get paid', href: '#/settings/payments' },
    { done: !!me.onboarded, label: 'Share your page link in bio', href: '#/onboarding' },
  ];
}
async function onboardingView() {
  const [me, o, socials] = await Promise.all([api('/me'), api('/overview'), api('/socials')]);
  me._socials = socials.length;
  const steps = onboardingSteps(me, o);
  const root = page('Get set up', `<div class="card">${steps.map((s) => `<a class="check ${s.done ? 'done' : ''}" href="${s.href}" style="color:inherit"><span class="dot">${s.done ? '✓' : ''}</span><span class="lbl" style="flex:1">${s.label}</span><span class="muted">→</span></a>`).join('')}</div>
    <div class="card" style="margin-top:14px"><h2>Your link-in-bio</h2><div class="row"><input readonly value="${esc(me.public_url)}"/><button class="btn" id="cp">${I.copy} Copy</button><a class="btn" href="${esc(me.public_url)}" target="_blank">${I.ext} Open</a></div>
      <p class="small muted">Put this in your Instagram, TikTok and YouTube bios. Fans can buy, book and chat with your AI twin; brands get your media kit and a contact form.</p>
      <button class="btn primary" id="done">I've added it to my bio</button></div>`);
  $('#cp', root).onclick = () => copyText(me.public_url);
  $('#done', root).onclick = async () => { await patch('/me', { onboarded: 1 }); toast('Nice! 🎉'); onboardingView(); };
}

// ================= 品牌合作 =================
async function dealsView(tab = 'board') {
  const [deals, brands] = await Promise.all([api('/deals'), api('/brands')]);
  let body;
  if (tab === 'board') {
    body = `<div class="kanban">${STAGES.map(([k, l]) => {
      const ds = deals.filter((d) => d.stage === k);
      return `<div class="col" data-stage="${k}"><h4>${l} <span class="pill">${ds.length}</span><span class="sum">${ds.length ? usdShort(ds.reduce((a, d) => a + d.amount_cents, 0)) : ''}</span></h4>
        ${ds.map((d) => `<div class="deal" draggable="true" data-deal="${d.id}"><div class="t">${esc(d.brand_name || '—')}</div><div class="small">${esc(d.title)}</div>
          <div class="m">${d.amount_cents ? `<b>${usd(d.amount_cents, false)}</b>` : ''}${d.deliverable_count ? `<span>☑ ${d.deliverable_done}/${d.deliverable_count}</span>` : ''}${d.next_due ? `<span>${dueLabel(d.next_due)}</span>` : ''}${d.source !== 'manual' ? `<span>${esc(d.source)}</span>` : ''}</div></div>`).join('')}</div>`;
    }).join('')}</div>`;
  } else {
    body = `<div class="card" style="padding:0;overflow:auto"><table class="table"><tr><th>Brand</th><th>Category</th><th>Contact</th><th class="num">Deals</th><th></th></tr>
      ${brands.map((b) => `<tr><td><b>${esc(b.name)}</b>${b.website ? `<div class="small"><a href="${esc(b.website)}" target="_blank" rel="noopener">${esc(b.website.replace(/^https?:\/\//, ''))}</a></div>` : ''}</td><td>${esc(b.category)}</td><td>${esc(b.contact_name)}<div class="small muted">${esc(b.contact_email)}</div></td><td class="num">${b.deals}</td><td><button class="btn sm" data-eb="${b.id}">Edit</button></td></tr>`).join('') || '<tr><td colspan="5" class="empty">No brands yet</td></tr>'}</table></div>`;
  }
  const root = page('Brand deals', body, `${tabs([['board', 'Pipeline'], ['brands', 'Brands']], tab)}<button class="btn" id="rate">💵 Rate calculator</button><button class="btn" id="ftc">FTC check</button><button class="btn primary" id="nd">${I.plus} New deal</button>`);
  $$('[data-tab]', root).forEach((b) => (b.onclick = () => (location.hash = '#/deals/' + b.dataset.tab)));
  $('#nd', root).onclick = () => editDeal();
  $('#rate', root).onclick = rateCalculator;
  $('#ftc', root).onclick = ftcCheck;
  $$('[data-deal]', root).forEach((el) => {
    el.onclick = () => openDeal(+el.dataset.deal);
    el.ondragstart = (e) => e.dataTransfer.setData('text/plain', el.dataset.deal);
  });
  $$('.col', root).forEach((col) => {
    col.ondragover = (e) => { e.preventDefault(); col.classList.add('drop'); };
    col.ondragleave = () => col.classList.remove('drop');
    col.ondrop = async (e) => { e.preventDefault(); col.classList.remove('drop'); await patch('/deals/' + e.dataTransfer.getData('text/plain'), { stage: col.dataset.stage }); dealsView(tab); };
  });
  $$('[data-eb]', root).forEach((b) => (b.onclick = async () => {
    const br = brands.find((x) => x.id === +b.dataset.eb);
    const r = await formModal('Brand', [{ name: 'name', label: 'Name', value: br.name }, { name: 'website', label: 'Website', value: br.website }, { name: 'category', label: 'Category', value: br.category }, { name: 'contact_name', label: 'Contact name', value: br.contact_name }, { name: 'contact_email', label: 'Contact email', value: br.contact_email }, { name: 'notes', label: 'Notes', type: 'textarea', value: br.notes }]);
    if (r) { await patch('/brands/' + br.id, r); dealsView(tab); }
  }));
}
async function editDeal(d = {}) {
  const r = await formModal(d.id ? 'Edit deal' : 'New deal', [
    { name: 'brand_name', label: 'Brand', value: d.brand_name, required: true, placeholder: 'e.g. Acme Audio' },
    { name: 'title', label: 'Campaign', value: d.title, placeholder: 'e.g. Holiday headphones launch' },
    ...(d.id ? [] : [{ name: 'contact_email', label: 'Brand contact email', type: 'email' }]),
    { name: 'amount', label: 'Fee (USD)', type: 'number', step: '0.01', value: d.amount_cents ? d.amount_cents / 100 : '' },
    { name: 'stage', label: 'Stage', type: 'select', value: d.stage || 'lead', options: STAGES },
    { name: 'platforms', label: 'Platforms', value: d.platforms, placeholder: 'YouTube, Instagram' },
    { name: 'usage_rights', label: 'Usage rights', value: d.usage_rights, placeholder: 'e.g. 30 days paid social' },
    { name: 'exclusivity', label: 'Exclusivity', value: d.exclusivity, placeholder: 'e.g. No competing audio brands for 60 days' },
    { name: 'due_date', label: 'Go-live date', type: 'date', value: d.due_date },
    { name: 'contract_url', label: 'Contract link', value: d.contract_url },
    { name: 'notes', label: 'Notes', type: 'textarea', value: d.notes, rows: 3 },
  ], d.id ? 'Save' : 'Create', { wide: true });
  if (!r) return null;
  const out = d.id ? await patch('/deals/' + d.id, r) : await post('/deals', r);
  route();
  return out;
}
async function openDeal(id) {
  const d = await api('/deals/' + id);
  const { el, close } = modal(`<div class="row"><h2 style="flex:1;margin:0">${esc(d.brand_name || '')} · ${esc(d.title)}</h2><span class="pill">${STAGE[d.stage]}</span></div>
    <div class="kv" style="margin:14px 0"><span class="k">Fee</span><b>${usd(d.amount_cents)}</b><span class="k">Contact</span><span>${esc(d.contact_name || '')} ${d.contact_email ? `<a href="mailto:${esc(d.contact_email)}">${esc(d.contact_email)}</a>` : ''}</span>
      <span class="k">Platforms</span><span>${esc(d.platforms || '—')}</span><span class="k">Usage</span><span>${esc(d.usage_rights || '—')}</span><span class="k">Exclusivity</span><span>${esc(d.exclusivity || '—')}</span><span class="k">Go-live</span><span>${fmtDate(d.due_date)}</span>
      ${d.contract_url ? `<span class="k">Contract</span><a href="${esc(d.contract_url)}" target="_blank" rel="noopener">Open</a>` : ''}${d.invoice_url ? `<span class="k">Invoice</span><span><a href="${esc(d.invoice_url)}" target="_blank" rel="noopener">Payment link</a> <button class="ib" id="cpinv">${I.copy}</button></span>` : ''}</div>
    ${d.notes ? `<div class="small" style="white-space:pre-wrap;background:var(--soft);padding:10px;border-radius:10px">${esc(d.notes)}</div>` : ''}
    <h3>Deliverables</h3>
    ${d.deliverables.map((x) => `<div class="list-row"><select data-ds="${x.id}" style="width:auto">${['todo', 'draft', 'in_review', 'approved', 'posted'].map((s) => `<option ${s === x.status ? 'selected' : ''} value="${s}">${s.replace('_', ' ')}</option>`).join('')}</select><span class="grow">${esc(x.title)}<div class="small muted">${esc(x.platform)} · ${fmtDate(x.due_date)} ${x.status !== 'posted' && x.due_date ? dueLabel(x.due_date) : ''}${x.link ? ` · <a href="${esc(x.link)}" target="_blank" rel="noopener">live</a>` : ''}</div></span><button class="ib" data-dl="${x.id}">${I.x}</button></div>`).join('') || '<div class="small muted">No deliverables yet</div>'}
    <form class="row" id="addx" style="margin-top:8px"><input name="title" placeholder="e.g. 60s YouTube integration" required/><input name="platform" placeholder="Platform" style="max-width:120px"/><input name="due_date" type="date" style="max-width:150px"/><button class="btn sm">Add</button></form>
    <div class="foot" style="flex-wrap:wrap"><button class="btn danger" id="deld">Delete</button><span class="sp"></span><button class="btn" id="ask">Ask Max to follow up</button><button class="btn" id="edit">Edit</button>${d.stage !== 'paid' ? `<button class="btn" id="paid">Mark paid</button><button class="btn brand" id="inv">${d.invoice_url ? 'Refresh invoice' : 'Create invoice'}</button>` : ''}</div>`, { wide: true });
  $('#cpinv', el)?.addEventListener('click', () => copyText(d.invoice_url));
  $$('[data-ds]', el).forEach((s) => (s.onchange = () => patch('/deliverables/' + s.dataset.ds, { status: s.value })));
  $$('[data-dl]', el).forEach((b) => (b.onclick = async () => { await del('/deliverables/' + b.dataset.dl); close(); openDeal(id); }));
  $('#addx', el).onsubmit = async (e) => { e.preventDefault(); await post(`/deals/${id}/deliverables`, Object.fromEntries(new FormData(e.target))); close(); openDeal(id); };
  $('#edit', el).onclick = async () => { close(); await editDeal(d); };
  $('#deld', el).onclick = async () => { if (await confirmBox('Delete this deal?', 'Delete')) { await del('/deals/' + id); route(); } };
  $('#paid', el)?.addEventListener('click', async () => { await patch('/deals/' + id, { stage: 'paid' }); close(); toast('Marked as paid 💸'); route(); });
  $('#inv', el)?.addEventListener('click', async () => { const r = await post(`/deals/${id}/invoice`); close(); const m = modal(`<h2>Invoice ready</h2><p>Send this payment link to ${esc(d.brand_name || 'the brand')} — they can pay ${esc(r.amount)} by card and the money goes straight to your Stripe account.</p><div class="row"><input readonly value="${esc(r.url)}"/><button class="btn" id="c2">${I.copy}</button></div><div class="foot"><button class="btn primary" data-close>Done</button></div>`); $('#c2', m.el).onclick = () => copyText(r.url); route(); });
  $('#ask', el).onclick = async () => {
    close();
    const mgr = S.agents.find((a) => /business manager/i.test(a.role || '')) || S.agents[0];
    if (!mgr) return toast('Add an agent first');
    try { await post(`/conversations/${mgr.conversation_id}/messages`, { text: `Please look at deal #${id} (${d.brand_name} — ${d.title}, stage: ${STAGE[d.stage]}). Figure out the next step and draft whatever follow-up is needed for my approval.` }); location.hash = '#/agent/' + mgr.id; }
    catch (e) { if (e.status === 402) upgradePrompt(e.message); }
  };
}
async function rateCalculator() {
  const types = await api('/rates/types');
  const { el } = modal(`<h2>Rate calculator</h2><p class="small muted">Rule-of-thumb ranges from your stats (CPM-based). Your own rate card always wins.</p>
    <div class="grid g3"><label class="f">Deliverable<select id="rt">${types.map((t) => `<option value="${t.key}">${esc(t.label)}</option>`).join('')}</select></label>
    <label class="f">Paid usage (months)<input id="ru" type="number" min="0" value="0"/></label><label class="f">Exclusivity (days)<input id="rx" type="number" min="0" value="0"/></label></div>
    <div id="rout" class="card"></div><div class="foot"><button class="btn primary" data-close>Done</button></div>`, { wide: true });
  const calc = async () => {
    const r = await api(`/rates/estimate?type=${$('#rt', el).value}&usage_months=${$('#ru', el).value}&exclusivity_days=${$('#rx', el).value}`);
    $('#rout', el).innerHTML = `<div class="small muted">${esc(r.deliverable)}</div><div class="balance">${esc(r.suggested_range)}</div>
      ${typeof r.platform_stats === 'object' ? `<div class="small muted">Based on ${compact(r.platform_stats.avg_views)} avg views · ${compact(r.platform_stats.followers)} followers · ${r.platform_stats.engagement_rate}% ER</div>` : `<div class="small warn-t">${esc(r.platform_stats)}</div>`}
      ${r.your_rate_card ? `<div class="small">Your rate card: <b>${esc(r.your_rate_card)}</b></div>` : ''}${r.adjustments.map((a) => `<div class="small">+ ${esc(a)}</div>`).join('')}<div class="small muted" style="margin-top:6px">${esc(r.note)}</div>`;
  };
  $$('select,input', el).forEach((x) => (x.oninput = calc));
  calc();
}
function ftcCheck() {
  const { el } = modal(`<h2>FTC disclosure check</h2><label class="f">Caption or script<textarea id="cap" rows="5" placeholder="Paste your sponsored caption…"></textarea></label>
    <label class="f">Platform<select id="pf"><option>instagram</option><option>tiktok</option><option>youtube</option><option>x</option><option>podcast</option></select></label>
    <div id="fout"></div><div class="foot"><button class="btn" data-close>Close</button><button class="btn primary" id="go">Check</button></div>`);
  $('#go', el).onclick = async () => {
    const r = await post('/disclosure', { caption: $('#cap', el).value, platform: $('#pf', el).value });
    $('#fout', el).innerHTML = `<div class="card" style="border-color:${r.compliant ? 'var(--ok)' : 'var(--warn)'}"><b class="${r.compliant ? 'ok-t' : 'warn-t'}">${r.compliant ? '✓ Looks compliant' : '⚠ Needs attention'}</b>${r.found.length ? `<div class="small">Found: ${r.found.map(esc).join(', ')}</div>` : ''}<ul class="small">${r.issues.map((i) => `<li>${esc(i)}</li>`).join('')}</ul><div class="small muted">${esc(r.reference)} Not legal advice.</div></div>`;
  };
}

// ================= 产品 =================
const PTYPES = [['digital', 'Digital download'], ['template', 'Template'], ['ebook', 'E-book / guide'], ['course', 'Course'], ['membership', 'Membership'], ['coaching_pack', 'Coaching pack']];
async function productsView(tab = 'products') {
  const me = S.me || (S.me = await api('/me'));
  let body;
  if (tab === 'products') {
    const ps = await api('/products');
    body = `<div class="grid g3">${ps.map((p) => `<div class="card"><div class="row"><span class="pill ${p.active ? 'ok' : ''}">${p.active ? 'Live' : 'Draft'}</span><span class="small muted">${esc(PTYPES.find((t) => t[0] === p.type)?.[1] || p.type)}</span><span class="sp"></span>${p.featured ? '⭐' : ''}</div>
      <h2 style="margin:8px 0 2px">${esc(p.title)}</h2><div class="small muted">${esc(p.tagline || '')}</div>
      <div class="row" style="margin:10px 0"><b style="font-size:18px">${usd(p.price_cents, p.price_cents % 100 !== 0)}${p.interval ? `<span class="small muted">/${p.interval}</span>` : ''}</b><span class="sp"></span><span class="small muted">${p.sales} sales · ${usd(p.revenue_cents, false)}</span></div>
      <div class="small">${p.file_path ? `📎 ${esc(p.file_path.replace(/^\d+-/, ''))}` : '<span class="muted">No file attached</span>'}</div>
      <div class="row" style="margin-top:10px"><button class="btn sm" data-ep="${p.id}">Edit</button><button class="btn sm" data-fp="${p.id}">Upload file</button><button class="btn sm" data-lp="${p.id}">${I.copy} Link</button><span class="sp"></span><button class="btn sm ${p.active ? '' : 'brand'}" data-tp="${p.id}" data-a="${p.active}">${p.active ? 'Unpublish' : 'Publish'}</button></div></div>`).join('')}
      <div class="card tpl" id="np" style="display:grid;place-items:center;min-height:180px;text-align:center"><div><b>${I.plus} New product</b><div class="small muted">Templates, guides, courses, memberships</div></div></div></div>
      <input type="file" id="pfile" hidden/>`;
  } else {
    const os = await api('/orders');
    body = `<div class="card" style="padding:0;overflow:auto"><table class="table"><tr><th>Date</th><th>Type</th><th>Item</th><th>Customer</th><th class="num">Amount</th><th class="num">Fee</th><th>Status</th></tr>
      ${os.map((o) => `<tr><td>${fmtDate(o.paid_at || o.created_at)}</td><td>${esc(o.kind)}</td><td>${esc(o.product_title || o.service_title || o.deal_title || '')}</td><td>${esc(o.buyer_name)}<div class="small muted">${esc(o.buyer_email)}</div></td><td class="num">${usd(o.amount_cents)}</td><td class="num muted">${o.fee_cents ? usd(o.fee_cents) : '—'}</td><td><span class="pill ${o.status === 'paid' ? 'ok' : o.status === 'refunded' ? 'err' : ''}">${esc(o.status)}</span>${o.simulated ? ' <span class="pill warn">demo</span>' : ''}</td></tr>`).join('') || '<tr><td colspan="7" class="empty">No orders yet</td></tr>'}</table></div>`;
  }
  const root = page('Products', body, `${tabs([['products', 'Products'], ['orders', 'Orders']], tab)}${tab === 'products' ? `<button class="btn primary" id="np2">${I.plus} New product</button>` : ''}`);
  $$('[data-tab]', root).forEach((b) => (b.onclick = () => (location.hash = '#/products/' + b.dataset.tab)));
  const pnew = () => editProduct();
  $('#np', root)?.addEventListener('click', pnew); $('#np2', root)?.addEventListener('click', pnew);
  const ps = tab === 'products' ? await api('/products') : [];
  $$('[data-ep]', root).forEach((b) => (b.onclick = () => editProduct(ps.find((p) => p.id === +b.dataset.ep))));
  $$('[data-lp]', root).forEach((b) => (b.onclick = () => copyText(S.me.public_url + '/p/' + b.dataset.lp)));
  $$('[data-tp]', root).forEach((b) => (b.onclick = async () => { await patch('/products/' + b.dataset.tp, { active: b.dataset.a === '1' ? 0 : 1 }); productsView(tab); }));
  $$('[data-fp]', root).forEach((b) => (b.onclick = () => {
    const inp = $('#pfile'); inp.onchange = async () => { const f = inp.files[0]; if (!f) return; toast('Uploading…'); await post(`/products/${b.dataset.fp}/file`, { name: f.name, data: await fileToB64(f) }); toast('File attached'); productsView(tab); }; inp.click();
  }));
}
async function editProduct(p = {}) {
  const r = await formModal(p.id ? 'Edit product' : 'New product', [
    { name: 'title', label: 'Title', value: p.title, required: true, placeholder: 'e.g. YouTube Script Template Pack' },
    { name: 'tagline', label: 'Tagline', value: p.tagline, placeholder: 'One line on the outcome' },
    { name: 'type', label: 'Type', type: 'select', value: p.type || 'digital', options: PTYPES },
    { name: 'price', label: 'Price (USD, 0 = free lead magnet)', type: 'number', step: '0.01', min: 0, value: p.id ? p.price_cents / 100 : '' , required: true },
    { name: 'interval', label: 'Billing', type: 'select', value: p.interval || '', options: [['', 'One-time'], ['month', 'Monthly'], ['year', 'Yearly']] },
    { name: 'description', label: 'Description (sales copy, markdown ok)', type: 'textarea', value: p.description, rows: 6 },
    { name: 'delivery_note', label: 'After purchase (shown + emailed) — e.g. course or community link', type: 'textarea', value: p.delivery_note, rows: 2 },
    { name: 'featured', label: 'Feature at the top of my page', type: 'checkbox', value: !!p.featured },
    ...(p.id ? [] : [{ name: 'active', label: 'Publish now', type: 'checkbox', value: true }]),
  ], p.id ? 'Save' : 'Create', { wide: true });
  if (!r) return;
  r.featured = r.featured ? 1 : 0;
  if (!p.id) r.active = r.active ? 1 : 0;
  p.id ? await patch('/products/' + p.id, r) : await post('/products', r);
  route();
}

// ================= 预约 =================
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
async function bookingView(tab = 'bookings') {
  const me = S.me = await api('/me');
  let body;
  if (tab === 'bookings') {
    const bs = await api('/bookings');
    const up = bs.filter((b) => b.status === 'confirmed' && new Date(b.start_at) > new Date()).reverse();
    const past = bs.filter((b) => !up.includes(b));
    const row = (b) => `<tr><td>${fmtWhen(b.start_at, me.timezone)}</td><td>${esc(b.service_title || '')}</td><td>${esc(b.name)}<div class="small muted">${esc(b.email)}</div></td><td class="small">${Object.entries(b.answers || {}).map(([q, a]) => `<div><span class="muted">${esc(q)}</span> ${esc(a)}</div>`).join('')}</td>
      <td><select data-bs="${b.id}" style="width:auto">${['confirmed', 'completed', 'cancelled'].map((s) => `<option ${s === b.status ? 'selected' : ''}>${s}</option>`).join('')}</select></td></tr>`;
    body = `<h3 style="margin-top:0">Upcoming</h3><div class="card" style="padding:0;overflow:auto"><table class="table"><tr><th>When (${esc(me.timezone)})</th><th>Service</th><th>Client</th><th>Intake</th><th>Status</th></tr>${up.map(row).join('') || '<tr><td colspan="5" class="empty">No upcoming calls</td></tr>'}</table></div>
      ${past.length ? `<h3>Past & cancelled</h3><div class="card" style="padding:0;overflow:auto"><table class="table">${past.map(row).join('')}</table></div>` : ''}`;
  } else if (tab === 'services') {
    const ss = await api('/services');
    body = `<div class="grid g3">${ss.map((s) => `<div class="card"><div class="row"><span class="pill ${s.active ? 'ok' : ''}">${s.active ? 'Bookable' : 'Hidden'}</span></div><h2 style="margin:8px 0 2px">${esc(s.title)}</h2>
      <div class="small muted">${s.duration_min} min · ${s.price_cents ? usd(s.price_cents, false) : 'Free'}</div><div class="small" style="margin:8px 0">${esc((s.description || '').slice(0, 120))}</div>
      <div class="row"><button class="btn sm" data-es="${s.id}">Edit</button><button class="btn sm" data-ls="${s.id}">${I.copy} Link</button></div></div>`).join('')}
      <div class="card tpl" id="ns" style="display:grid;place-items:center;min-height:150px;text-align:center"><div><b>${I.plus} New service</b><div class="small muted">1:1 calls, audits, consulting</div></div></div></div>`;
  } else {
    const av = me.availability || {};
    body = `<div class="card" style="max-width:620px"><p class="small muted" style="margin-top:0">Weekly hours people can book, in your timezone (<b>${esc(me.timezone)}</b> — change it under My page).</p>
      <form id="avf">${[1, 2, 3, 4, 5, 6, 0].map((d) => { const r = (av[d] || [])[0] || []; return `<div class="avail-row"><label class="row small"><input type="checkbox" name="on_${d}" ${r.length ? 'checked' : ''}/> ${DAYS[d]}</label><input type="time" name="from_${d}" value="${r[0] || '10:00'}"/><input type="time" name="to_${d}" value="${r[1] || '16:00'}"/><span></span></div>`; }).join('')}
      <button class="btn primary" style="margin-top:8px">Save hours</button></form></div>`;
  }
  const root = page('Booking', body, `${tabs([['bookings', 'Calls'], ['services', 'Services'], ['hours', 'Availability']], tab)}`);
  $$('[data-tab]', root).forEach((b) => (b.onclick = () => (location.hash = '#/booking/' + b.dataset.tab)));
  $$('[data-bs]', root).forEach((s) => (s.onchange = () => patch('/bookings/' + s.dataset.bs, { status: s.value })));
  $('#ns', root)?.addEventListener('click', () => editService());
  if (tab === 'services') { const ss = await api('/services'); $$('[data-es]', root).forEach((b) => (b.onclick = () => editService(ss.find((s) => s.id === +b.dataset.es)))); }
  $$('[data-ls]', root).forEach((b) => (b.onclick = () => copyText(S.me.public_url + '/book/' + b.dataset.ls)));
  $('#avf', root)?.addEventListener('submit', async (e) => {
    e.preventDefault(); const f = new FormData(e.target); const av = {};
    for (const d of [0, 1, 2, 3, 4, 5, 6]) if (f.get('on_' + d)) { if (f.get('from_' + d) >= f.get('to_' + d)) return toast(`${DAYS[d]}: end must be after start`); av[d] = [[f.get('from_' + d), f.get('to_' + d)]]; }
    await patch('/me', { availability: av }); toast('Hours saved');
  });
}
async function editService(s = {}) {
  const r = await formModal(s.id ? 'Edit service' : 'New service', [
    { name: 'title', label: 'Title', value: s.title, required: true, placeholder: 'e.g. 45-min channel audit' },
    { name: 'description', label: 'What they get', type: 'textarea', value: s.description, rows: 3 },
    { name: 'duration_min', label: 'Length (minutes)', type: 'number', value: s.duration_min || 30, min: 15 },
    { name: 'price', label: 'Price (USD, 0 = free)', type: 'number', step: '0.01', value: s.id ? s.price_cents / 100 : '' },
    { name: 'location', label: 'Meeting link (sent after booking)', value: s.location, placeholder: 'https://zoom.us/j/…' },
    { name: 'questions', label: 'Intake questions (one per line)', type: 'textarea', value: (s.questions || []).join('\n'), rows: 3 },
    { name: 'notice_hours', label: 'Minimum notice (hours)', type: 'number', value: s.notice_hours ?? 24, min: 0 },
    { name: 'buffer_min', label: 'Buffer between calls (minutes)', type: 'number', value: s.buffer_min ?? 15, min: 0 },
    ...(s.id ? [{ name: 'active', label: 'Bookable', type: 'checkbox', value: !!s.active }] : []),
  ], s.id ? 'Save' : 'Create', { wide: true });
  if (!r) return;
  const body = { ...r, duration_min: +r.duration_min, notice_hours: +r.notice_hours, buffer_min: +r.buffer_min, questions: r.questions.split('\n').map((q) => q.trim()).filter(Boolean) };
  if (s.id) body.active = r.active ? 1 : 0;
  s.id ? await patch('/services/' + s.id, body) : await post('/services', body);
  route();
}

// ================= 联盟链接 =================
async function linksView(tab = 'links') {
  const [links, earnings] = await Promise.all([api('/links'), api('/earnings')]);
  let body;
  if (tab === 'links') {
    body = `<div class="hint">Every link gets a short tracked URL on your domain. Featured links show up as “My picks” on your page and your AI twin can recommend them.</div>
      <div class="card" style="padding:0;overflow:auto"><table class="table"><tr><th>Link</th><th>Network</th><th class="num">Clicks (30d)</th><th class="num">Total</th><th class="num">Earned</th><th></th></tr>
      ${links.map((l) => `<tr><td><b>${esc(l.title)}</b> ${l.featured ? '⭐' : ''}<div class="small"><button class="ib" style="padding:0 4px" data-cp="${esc(l.short_url)}">${I.copy}</button><code>${esc(l.short_url.replace(/^https?:\/\//, ''))}</code></div></td><td>${esc(l.network)}<div class="small muted">${esc(l.commission)}</div></td><td class="num">${num(l.clicks_30d)}</td><td class="num">${num(l.clicks)}</td><td class="num">${usd(l.earned_cents)}</td><td><button class="btn sm" data-el="${l.id}">Edit</button></td></tr>`).join('') || '<tr><td colspan="6" class="empty">No links yet</td></tr>'}</table></div>`;
  } else {
    const total = earnings.reduce((a, e) => a + e.amount_cents, 0);
    body = `<div class="hint">Affiliate networks pay out on their own schedule — log payouts here so they count in your revenue dashboard.</div>
      <div class="card" style="padding:0;overflow:auto"><table class="table"><tr><th>Period</th><th>Network / link</th><th>Note</th><th class="num">Amount</th><th></th></tr>
      ${earnings.map((e) => `<tr><td>${esc(e.period)}</td><td>${esc(e.network || '')} ${e.link_title ? `<span class="muted">· ${esc(e.link_title)}</span>` : ''}</td><td class="small">${esc(e.note)}</td><td class="num">${usd(e.amount_cents)}</td><td><button class="ib" data-de="${e.id}">${I.x}</button></td></tr>`).join('') || '<tr><td colspan="5" class="empty">No payouts logged</td></tr>'}
      ${earnings.length ? `<tr><td colspan="3"><b>Total</b></td><td class="num"><b>${usd(total)}</b></td><td></td></tr>` : ''}</table></div>`;
  }
  const root = page('Affiliate links', body, `${tabs([['links', 'Links'], ['earnings', 'Payouts']], tab)}${tab === 'links' ? `<button class="btn primary" id="nl">${I.plus} New link</button>` : `<button class="btn primary" id="ne">${I.plus} Log payout</button>`}`);
  $$('[data-tab]', root).forEach((b) => (b.onclick = () => (location.hash = '#/links/' + b.dataset.tab)));
  $$('[data-cp]', root).forEach((b) => (b.onclick = () => copyText(b.dataset.cp)));
  const form = (l = {}) => formModal(l.id ? 'Edit link' : 'New link', [
    { name: 'title', label: 'Product / title', value: l.title, required: true, placeholder: 'e.g. My camera (Sony ZV-E10)' },
    { name: 'url', label: 'Destination URL (with your affiliate tag)', value: l.url, required: true, placeholder: 'https://…' },
    { name: 'network', label: 'Network', value: l.network, placeholder: 'Amazon Associates, Impact, LTK…' },
    { name: 'commission', label: 'Commission', value: l.commission, placeholder: 'e.g. 4% or $20/sale' },
    { name: 'category', label: 'Category', value: l.category, placeholder: 'Camera gear' },
    { name: 'note', label: 'Why you recommend it (shown publicly)', value: l.note },
    { name: 'featured', label: 'Show in “My picks”', type: 'checkbox', value: l.id ? !!l.featured : true },
  ]);
  $('#nl', root)?.addEventListener('click', async () => { const r = await form(); if (r) { await post('/links', r); linksView(tab); } });
  $$('[data-el]', root).forEach((b) => (b.onclick = async () => {
    const l = links.find((x) => x.id === +b.dataset.el);
    const r = await form(l);
    if (r) { await patch('/links/' + l.id, { ...r, featured: r.featured ? 1 : 0 }); linksView(tab); }
  }));
  $('#ne', root)?.addEventListener('click', async () => {
    const r = await formModal('Log a payout', [{ name: 'period', label: 'Month', type: 'month', value: new Date().toISOString().slice(0, 7), required: true }, { name: 'network', label: 'Network', placeholder: 'Amazon Associates' }, { name: 'link_id', label: 'Link (optional)', type: 'select', options: [['', '—'], ...links.map((l) => [l.id, l.title])] }, { name: 'amount', label: 'Amount (USD)', type: 'number', step: '0.01', required: true }, { name: 'note', label: 'Note' }]);
    if (r) { await post('/earnings', r); linksView(tab); }
  });
  $$('[data-de]', root).forEach((b) => (b.onclick = async () => { await del('/earnings/' + b.dataset.de); linksView(tab); }));
}

// ================= 线索 & AI 分身 =================
async function leadsView(tab = 'inbox') {
  const me = S.me = await api('/me');
  let body;
  if (tab === 'inbox') {
    const leads = await api('/leads');
    body = `<div class="card" style="padding:0;overflow:auto"><table class="table"><tr><th>When</th><th>From</th><th>Type</th><th>Message</th><th>Source</th><th>Status</th><th></th></tr>
      ${leads.map((l) => `<tr><td>${fmtTime(l.created_at)}</td><td><b>${esc(l.company || l.name)}</b><div class="small muted">${esc(l.name && l.company ? l.name + ' · ' : '')}<a href="mailto:${esc(l.email)}">${esc(l.email)}</a></div>${l.budget ? `<div class="small">Budget: ${esc(l.budget)}</div>` : ''}</td><td>${esc(l.kind)}</td><td class="small" style="max-width:340px">${esc(l.message)}</td><td><span class="pill">${l.source === 'twin' ? 'AI twin' : esc(l.source)}</span></td>
        <td><select data-ls="${l.id}" style="width:auto">${['new', 'contacted', 'converted', 'archived'].map((s) => `<option ${s === l.status ? 'selected' : ''}>${s}</option>`).join('')}</select></td>
        <td style="white-space:nowrap">${l.kind === 'brand' && !l.deal_id ? `<button class="btn sm" data-cv="${l.id}">→ Deal</button>` : l.deal_id ? `<a class="small" href="#/deals">Deal #${l.deal_id}</a>` : ''}</td></tr>`).join('') || '<tr><td colspan="7" class="empty">No inquiries yet. Share your page — the contact form and AI twin collect them here.</td></tr>'}</table></div>`;
  } else if (tab === 'twin') {
    const t = me.twin || {};
    body = `<div class="grid g2" style="align-items:start"><form class="card" id="tf"><h2>Your AI twin</h2><p class="small muted" style="margin-top:0">A public assistant on your page that answers fans and brands 24/7, recommends your products and picks, books calls, and sends you qualified leads. It always says it's an AI.</p>
      <label class="row" style="margin-bottom:10px"><label class="switch"><input type="checkbox" name="enabled" ${t.enabled ? 'checked' : ''}/><i></i></label> Show on my page</label>
      <label class="f">Name<input name="name" value="${esc(t.name || '')}"/></label>
      <label class="f">Greeting<textarea name="greeting" rows="2">${esc(t.greeting || '')}</textarea></label>
      <label class="f">Extra instructions<textarea name="instructions" rows="5" placeholder="e.g. Always mention my free starter guide. I don't do gambling or crypto sponsorships. Coaching is only for creators under 100k subs.">${esc(t.instructions || '')}</textarea></label>
      <button class="btn primary">Save</button></form>
      <div class="card"><h2>Test it</h2><div class="chat-test"><div class="log" id="tlog"><div class="a">${esc(t.greeting || 'Hi!')}</div></div><form class="composer" id="tchat" style="border-radius:0 0 14px 14px;box-shadow:none;border:0;border-top:1px solid var(--line)"><textarea id="tin" rows="1" placeholder="Ask like a fan or a brand would…"></textarea><button class="send">${I.up}</button></form></div>
      <p class="small muted">Test chats count toward your monthly AI twin replies.</p></div></div>`;
  } else if (tab === 'faq') {
    const ks = await api('/knowledge');
    body = `<div class="hint">Your AI twin and agents use these answers. Add the questions you get asked all the time — gear, schedule, collab policy, coaching fit.</div>
      ${ks.map((k) => `<div class="card"><div class="row"><b style="flex:1">${esc(k.question)}</b>${k.public ? '' : '<span class="pill">private</span>'}<button class="btn sm" data-ek="${k.id}">Edit</button><button class="ib" data-dk="${k.id}">${I.x}</button></div><div class="small" style="white-space:pre-wrap;margin-top:4px">${esc(k.answer)}</div></div>`).join('') || '<div class="empty">No FAQs yet</div>'}`;
  } else {
    const ss = await api('/twin/sessions');
    body = ss.map((s) => `<details class="card"><summary class="row" style="cursor:pointer"><b style="flex:1">${esc(s.preview || '(empty)')}</b>${s.lead_id ? '<span class="pill ok">lead</span>' : ''}<span class="small muted">${s.count} msgs · ${fmtTime(s.updated_at)}</span></summary>
      <div style="margin-top:10px;display:flex;flex-direction:column;gap:6px">${s.messages.map((m) => `<div class="small" style="align-self:${m.role === 'user' ? 'flex-end' : 'flex-start'};background:${m.role === 'user' ? 'var(--soft2)' : 'var(--soft)'};padding:6px 10px;border-radius:10px;max-width:80%;white-space:pre-wrap">${esc(m.content)}</div>`).join('')}</div></details>`).join('') || '<div class="empty">No conversations yet</div>';
  }
  const root = page('Leads & AI twin', body, `${tabs([['inbox', 'Inquiries'], ['twin', 'AI twin'], ['faq', 'FAQs'], ['chats', 'Twin chats']], tab)}${tab === 'faq' ? `<button class="btn primary" id="nk">${I.plus} Add FAQ</button>` : ''}`);
  $$('[data-tab]', root).forEach((b) => (b.onclick = () => (location.hash = '#/leads/' + b.dataset.tab)));
  $$('[data-ls]', root).forEach((s) => (s.onchange = () => patch('/leads/' + s.dataset.ls, { status: s.value })));
  $$('[data-cv]', root).forEach((b) => (b.onclick = async () => { const d = await post(`/leads/${b.dataset.cv}/convert`); toast(`Deal #${d.id} created`); leadsView(tab); }));
  $('#tf', root)?.addEventListener('submit', async (e) => { e.preventDefault(); const f = new FormData(e.target); await patch('/me', { twin: { enabled: !!f.get('enabled'), name: f.get('name'), greeting: f.get('greeting'), instructions: f.get('instructions') } }); toast('Saved'); });
  $('#tchat', root)?.addEventListener('submit', async (e) => {
    e.preventDefault(); const v = $('#tin').value.trim(); if (!v) return; $('#tin').value = '';
    const log = $('#tlog'); log.insertAdjacentHTML('beforeend', `<div class="u">${esc(v)}</div><div class="a muted" id="ttyping">…</div>`); log.scrollTop = log.scrollHeight;
    try { const r = await post('/twin/test', { message: v }); $('#ttyping').outerHTML = `<div class="a">${esc(r.reply)}</div>`; }
    catch (err) { $('#ttyping')?.remove(); if (err.status === 402) upgradePrompt(err.message); }
    log.scrollTop = log.scrollHeight;
  });
  $('#tin', root)?.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('#tchat').requestSubmit(); } });
  const kform = (k = {}) => formModal(k.id ? 'Edit FAQ' : 'New FAQ', [{ name: 'question', label: 'Question', value: k.question, required: true }, { name: 'answer', label: 'Answer', type: 'textarea', value: k.answer, rows: 4 }, { name: 'public', label: 'AI twin can share this publicly', type: 'checkbox', value: k.id ? !!k.public : true }]);
  $('#nk', root)?.addEventListener('click', async () => { const r = await kform(); if (r) { await post('/knowledge', r); leadsView(tab); } });
  if (tab === 'faq') { const ks = await api('/knowledge'); $$('[data-ek]', root).forEach((b) => (b.onclick = async () => { const k = ks.find((x) => x.id === +b.dataset.ek); const r = await kform(k); if (r) { await patch('/knowledge/' + k.id, { ...r, public: r.public ? 1 : 0 }); leadsView(tab); } })); }
  $$('[data-dk]', root).forEach((b) => (b.onclick = async () => { await del('/knowledge/' + b.dataset.dk); leadsView(tab); }));
}

// ================= 我的主页 =================
const PLATFORMS = [['youtube', 'YouTube'], ['instagram', 'Instagram'], ['tiktok', 'TikTok'], ['x', 'X'], ['twitch', 'Twitch'], ['linkedin', 'LinkedIn'], ['newsletter', 'Newsletter'], ['podcast', 'Podcast']];
const TZS = ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Phoenix', 'America/Los_Angeles', 'America/Anchorage', 'Pacific/Honolulu', 'Europe/London', 'Europe/Berlin', 'Asia/Tokyo', 'Asia/Shanghai', 'Asia/Taipei', 'Australia/Sydney'];
async function pageView(tab = 'profile') {
  const me = S.me = await api('/me');
  let body;
  if (tab === 'profile') {
    const pg = me.page || {};
    body = `<div class="grid g2" style="align-items:start"><form class="card" id="pf"><h2>Profile</h2>
      <label class="f">Display name<input name="name" value="${esc(me.name)}"/></label>
      <label class="f">Page URL<div class="row"><span class="muted small">yourapp.com/c/</span><input name="handle" value="${esc(me.handle)}"/></div></label>
      <label class="f">Bio<textarea name="bio" rows="3" placeholder="What you make and who it's for">${esc(me.bio)}</textarea></label>
      <div class="grid g2"><label class="f">Niche<input name="niche" value="${esc(me.niche)}" placeholder="e.g. Budget travel"/></label><label class="f">Location<input name="location" value="${esc(me.location)}" placeholder="e.g. Austin, TX"/></label></div>
      <label class="f">Timezone<select name="timezone">${[...new Set([me.timezone, ...TZS])].map((t) => `<option ${t === me.timezone ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
      <label class="f">Your voice (agents & AI twin write like this)<textarea name="voice" rows="3" placeholder="e.g. Casual, funny, short sentences, lots of energy, no corporate jargon">${esc(me.voice)}</textarea></label>
      <div class="f small muted">Page color</div><div class="shape-pick" style="margin-bottom:12px">${COLORS.map((c) => `<label><input type="radio" name="color" value="${c}" ${c === me.color ? 'checked' : ''}/><div class="av" style="width:24px;height:24px;border-radius:50%;background:${c}"></div></label>`).join('')}</div>
      <button class="btn primary">Save profile</button></form>
      <form class="card" id="sf"><h2>Page sections</h2>
      ${[['show_products', 'Products'], ['show_booking', 'Book a call'], ['show_links', 'My picks (affiliate links)'], ['show_collab', 'Work with me (brand form)'], ['show_rates', 'Starting rates on media kit']].map(([k, l]) => `<div class="list-row"><span class="grow">${l}</span><label class="switch"><input type="checkbox" name="${k}" ${pg[k] !== false ? 'checked' : ''}/><i></i></label></div>`).join('')}
      <h3>Extra links</h3><div id="lks">${(pg.links || []).map((l) => `<div class="row" style="margin-bottom:6px"><input name="lt" value="${esc(l.title)}" placeholder="Title"/><input name="lu" value="${esc(l.url)}" placeholder="https://"/></div>`).join('')}</div>
      <button type="button" class="btn sm" id="addl">${I.plus} Link</button>
      <div style="margin-top:12px"><button class="btn primary">Save sections</button> <a class="btn" href="${esc(S.me.public_url)}" target="_blank">${I.ext} Preview</a></div></form></div>`;
  } else if (tab === 'audience') {
    const ss = await api('/socials');
    body = `<div class="hint">Your stats power the rate calculator, your media kit and pitches. YouTube can refresh automatically; update other platforms every month or so.</div>
      <div class="card" style="padding:0;overflow:auto"><table class="table"><tr><th>Platform</th><th class="num">Followers</th><th class="num">Avg views</th><th class="num">Engagement</th><th>Audience</th><th>Updated</th><th></th></tr>
      ${ss.map((s) => `<tr><td><b>${esc(PLATFORMS.find((p) => p[0] === s.platform)?.[1] || s.platform)}</b><div class="small muted">${esc(s.handle)}</div></td><td class="num">${num(s.followers)}</td><td class="num">${num(s.avg_views)}</td><td class="num">${s.engagement_rate}%</td><td class="small">${esc(s.audience)}</td><td class="small">${fmtDate(s.updated_at)}</td>
        <td style="white-space:nowrap">${s.platform === 'youtube' ? `<button class="btn sm" data-rf="${s.id}">Refresh</button>` : ''}<button class="btn sm" data-es="${s.id}">Edit</button><button class="ib" data-ds="${s.id}">${I.x}</button></td></tr>`).join('') || '<tr><td colspan="7" class="empty">Add your platforms</td></tr>'}</table></div>`;
  } else if (tab === 'rates') {
    const types = await api('/rates/types');
    body = `<form class="card" id="rf" style="max-width:640px"><h2>Starting rates</h2><p class="small muted" style="margin-top:0">Shown as “from” prices on your media kit (if enabled) and used by agents as your floor when negotiating. Leave blank to keep a rate private.</p>
      ${types.map((t) => `<div class="row" style="margin-bottom:8px"><span style="flex:1">${esc(t.label)}</span><span class="muted">$</span><input name="${t.key}" type="number" min="0" step="1" style="max-width:140px" value="${me.rate_card?.[t.key] ? me.rate_card[t.key] / 100 : ''}"/><button type="button" class="btn sm" data-est="${t.key}">Suggest</button></div>`).join('')}
      <button class="btn primary" style="margin-top:8px">Save rates</button> <a class="btn" href="${esc(S.me.public_url)}/kit" target="_blank">${I.ext} Media kit</a></form>`;
  }
  const root = page('My page', body, `${tabs([['profile', 'Profile'], ['audience', 'Audience'], ['rates', 'Rates & media kit']], tab)}${tab === 'audience' ? `<button class="btn primary" id="nsoc">${I.plus} Add platform</button>` : ''}`);
  $$('[data-tab]', root).forEach((b) => (b.onclick = () => (location.hash = '#/page/' + b.dataset.tab)));
  $('#pf', root)?.addEventListener('submit', async (e) => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)); await patch('/me', f); toast('Profile saved'); S.me = await api('/me'); renderNav(); });
  $('#addl', root)?.addEventListener('click', () => $('#lks').insertAdjacentHTML('beforeend', '<div class="row" style="margin-bottom:6px"><input name="lt" placeholder="Title"/><input name="lu" placeholder="https://"/></div>'));
  $('#sf', root)?.addEventListener('submit', async (e) => {
    e.preventDefault(); const f = new FormData(e.target);
    const titles = f.getAll('lt'), urls = f.getAll('lu');
    const links = titles.map((t, i) => ({ title: t.trim(), url: urls[i].trim() })).filter((l) => l.title && /^https?:\/\//.test(l.url));
    await patch('/me', { page: { ...Object.fromEntries(['show_products', 'show_booking', 'show_links', 'show_collab', 'show_rates'].map((k) => [k, !!f.get(k)])), links } });
    toast('Page updated');
  });
  const sform = (s = {}) => formModal(s.id ? 'Edit platform' : 'Add platform', [
    { name: 'platform', label: 'Platform', type: 'select', value: s.platform || 'youtube', options: PLATFORMS }, { name: 'handle', label: 'Handle', value: s.handle, required: true, placeholder: '@you' },
    { name: 'url', label: 'Profile URL', value: s.url }, { name: 'followers', label: 'Followers / subscribers', type: 'number', value: s.followers }, { name: 'avg_views', label: 'Average views per post/video (last ~10)', type: 'number', value: s.avg_views },
    { name: 'engagement_rate', label: 'Engagement rate %', type: 'number', step: '0.1', value: s.engagement_rate }, { name: 'audience', label: 'Audience (age, gender, top countries)', value: s.audience, placeholder: '25–34 · 60% US · 55% male' },
  ]);
  $('#nsoc', root)?.addEventListener('click', async () => { const r = await sform(); if (r) { await post('/socials', { ...r, followers: +r.followers || 0, avg_views: +r.avg_views || 0, engagement_rate: +r.engagement_rate || 0 }); pageView(tab); } });
  if (tab === 'audience') {
    const ss = await api('/socials');
    $$('[data-es]', root).forEach((b) => (b.onclick = async () => { const s = ss.find((x) => x.id === +b.dataset.es); const r = await sform(s); if (r) { await patch('/socials/' + s.id, { ...r, followers: +r.followers || 0, avg_views: +r.avg_views || 0, engagement_rate: +r.engagement_rate || 0 }); pageView(tab); } }));
    $$('[data-ds]', root).forEach((b) => (b.onclick = async () => { await del('/socials/' + b.dataset.ds); pageView(tab); }));
    $$('[data-rf]', root).forEach((b) => (b.onclick = async () => { b.disabled = true; await post(`/socials/${b.dataset.rf}/refresh`).catch(() => {}); pageView(tab); }));
  }
  $('#rf', root)?.addEventListener('submit', async (e) => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)); const rc = Object.fromEntries(Object.entries(f).filter(([, v]) => v !== '').map(([k, v]) => [k, Math.round(Number(v) * 100)])); await patch('/me', { rate_card: rc }); toast('Rates saved'); });
  $$('[data-est]', root).forEach((b) => (b.onclick = async () => { const r = await api('/rates/estimate?type=' + b.dataset.est); const inp = $(`input[name="${b.dataset.est}"]`); inp.value = Math.round((r.low_cents + r.high_cents) / 200); toast(`Suggested ${r.suggested_range}`); }));
}

// ================= 自动化 / 审批 =================
async function automationsView() {
  if (!S.agents.length) await loadAgents();
  const [list, tpl] = await Promise.all([api('/automations'), getTemplates()]);
  const root = page('Automations', `<p class="muted" style="margin-top:-6px">Your crew works on a schedule or when something happens — a new lead, sale, booking, email or text. Results show up in the agent's chat.</p>
    ${list.map((x) => autoCard(x, true)).join('') || '<div class="empty">No automations yet</div>'}
    <h3>Ideas</h3><div class="grid g2">${tpl.automations.map((a, i) => `<div class="card tpl" data-ta="${i}"><b>${esc(a.name)}</b><div class="small muted">${TRIG[a.trigger]}${a.cron ? ' · ' + esc(cronText(a.cron)) : ''}</div><div class="small" style="margin-top:4px">${esc(a.prompt.slice(0, 110))}…</div></div>`).join('')}</div>`, `<button class="btn primary" id="newau">${I.plus} New automation</button>`);
  $('#newau', root).onclick = () => (S.agents.length ? editAutomation({}) : toast('Add an agent first'));
  $$('[data-ta]', root).forEach((el) => (el.onclick = () => { const a = tpl.automations[+el.dataset.ta]; editAutomation({ ...a, agent_id: undefined, prompt: a.prompt }); }));
  bindAutoCards(root);
}
async function approvalsView() {
  const [pending, all] = await Promise.all([api('/approvals'), api('/approvals?all=1')]);
  const done = all.filter((x) => x.status !== 'pending').slice(0, 30);
  const K = { email: '✉️', sms: '💬', call: '📞', payment: '💳', exec: '⌨️', local: '💻' };
  const detail = (x) => {
    const p = x.payload;
    if (x.kind === 'email') return `<label class="f">To<input data-f="to" value="${esc(p.to)}"/></label><label class="f">Subject<input data-f="subject" value="${esc(p.subject)}"/></label><label class="f">Body<textarea data-f="body" rows="8">${esc(p.body)}</textarea></label>`;
    if (x.kind === 'sms') return `<label class="f">Message<textarea data-f="body" rows="3">${esc(p.body)}</textarea></label>`;
    if (x.kind === 'call') return `<div class="small">Opening line: ${esc(p.message)}</div>`;
    if (x.kind === 'payment') return `<div class="small">${esc(p.reason)}${p.url ? ` · <a href="${esc(p.url)}" target="_blank" rel="noopener">link</a>` : ''}</div>`;
    return `<pre>${esc(p.command)}</pre>`;
  };
  const root = page('Approvals', `<p class="muted" style="margin-top:-6px">Agents ask before they send, call, pay or run anything sensitive. You can edit emails and texts before approving.</p>
    ${pending.map((x) => `<div class="card ap" data-ap="${x.id}">${avatar({ name: x.agent_name, color: x.color, shape: x.shape }, 36)}<div style="flex:1;min-width:0">
      <b>${K[x.kind] || ''} ${esc(x.summary)}</b><div class="small muted" style="margin-bottom:8px">${esc(x.agent_name)} · ${fmtTime(x.created_at)}</div>${detail(x)}
      <div class="row" style="margin-top:8px"><button class="btn primary sm" data-ok="${x.id}">Approve</button><button class="btn sm" data-no="${x.id}">Decline</button></div></div></div>`).join('') || '<div class="empty">Nothing waiting for you ✓</div>'}
    ${done.length ? `<h3>History</h3>${done.map((x) => `<div class="list-row"><span>${K[x.kind] || ''}</span><span class="grow">${esc(x.summary)}<div class="small muted">${esc(x.agent_name)} · ${fmtTime(x.decided_at || x.created_at)}${x.result ? ' · ' + esc(x.result.slice(0, 80)) : ''}</div></span><span class="pill ${x.status === 'done' ? 'ok' : x.status === 'failed' ? 'err' : ''}">${x.status}</span></div>`).join('')}` : ''}`);
  $$('[data-ok]', root).forEach((b) => (b.onclick = async () => {
    b.disabled = true;
    const card = b.closest('[data-ap]'); const edits = {}; $$('[data-f]', card).forEach((i) => (edits[i.dataset.f] = i.value));
    const r = await post('/approvals/' + b.dataset.ok, { approve: true, payload: Object.keys(edits).length ? edits : undefined });
    toast(r.status === 'done' ? 'Approved' : 'Failed: ' + (r.result || '')); approvalsView(); refreshCounts();
  }));
  $$('[data-no]', root).forEach((b) => (b.onclick = async () => { await post('/approvals/' + b.dataset.no, { approve: false }); approvalsView(); refreshCounts(); }));
}

// ================= 设置 =================
async function settingsView(tab = 'account') {
  const me = S.me = await api('/me');
  let body;
  if (tab === 'account') {
    body = `<div class="grid g2" style="align-items:start"><div class="card"><h2>Account</h2><div class="kv"><span class="k">Email</span><span>${esc(me.email)}</span><span class="k">Plan</span><span>${esc(me.plan_info.name)}</span><span class="k">Member since</span><span>${fmtDate(me.created_at)}</span></div>
      <button class="btn" id="lo" style="margin-top:12px">Log out</button></div>
      <form class="card" id="pw"><h2>Password</h2><label class="f">Current password<input type="password" name="old_password" required/></label><label class="f">New password<input type="password" name="new_password" minlength="8" required/></label><button class="btn primary">Change password</button></form></div>`;
  } else if (tab === 'billing') {
    const b = await api('/billing');
    const u = b.usage;
    body = `<div class="grid g2">${Object.entries(b.plans).map(([k, p]) => `<div class="card" style="${k === b.current ? 'border-color:var(--brand);border-width:2px' : ''}"><div class="row"><h2 style="flex:1;margin:0">${esc(p.name)}</h2>${k === b.current ? '<span class="pill ok">current</span>' : ''}</div>
      <div class="balance">${p.price ? `$${p.price}<span class="small muted">/mo</span>` : 'Free'}</div><ul class="small">${p.features.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>
      ${k === 'pro' && b.current !== 'pro' ? `<button class="btn brand" id="upg">Upgrade to Pro</button>` : ''}${k === 'pro' && b.current === 'pro' && me.stripe_customer_id ? '<button class="btn" id="portal">Manage billing</button>' : ''}</div>`).join('')}</div>
      <div class="card" style="margin-top:14px"><h2>This month's usage</h2>
      ${[['Agent tasks', u.agent_runs || 0, me.plan_info.agent_runs], ['AI twin replies', u.twin_messages || 0, me.plan_info.twin_messages]].map(([l, v, max]) => `<div style="margin-bottom:10px"><div class="row small"><span style="flex:1">${l}</span><span>${num(v)} / ${num(max)}</span></div><div style="height:6px;background:var(--soft2);border-radius:99px;overflow:hidden"><i style="display:block;height:100%;width:${Math.min(100, (v / max) * 100)}%;background:${v / max > 0.9 ? 'var(--danger)' : 'var(--brand)'}"></i></div></div>`).join('')}</div>`;
  } else if (tab === 'payments') {
    const st = await api('/stripe/status').catch(() => ({}));
    body = `<div class="card" style="max-width:640px"><h2>Get paid with Stripe</h2>
      <p class="small muted" style="margin-top:0">Sales, bookings and brand invoices are paid by card and deposited straight into your own Stripe account. ${me.plan_info.fee_pct ? `The ${esc(me.plan_info.name)} plan includes a ${me.plan_info.fee_pct}% platform fee on sales (brand invoices are fee-free).` : 'No platform fee on your plan.'}</p>
      ${st.demo ? '<div class="hint">Payments are in <b>demo mode</b> on this server — checkout works end-to-end without charging real cards. The operator needs to add STRIPE_SECRET_KEY to accept real payments.</div>' : ''}
      <div class="kv" style="margin:12px 0"><span class="k">Status</span><span>${st.charges_enabled ? '<span class="pill ok">Ready to accept payments</span>' : st.connected ? '<span class="pill warn">Finish onboarding</span>' : '<span class="pill">Not connected</span>'}</span>
        ${st.connected ? `<span class="k">Payouts</span><span>${st.payouts_enabled ? 'enabled' : 'pending'}</span>` : ''}</div>
      <div class="row">${!st.demo ? `<button class="btn brand" id="conn">${st.connected ? 'Continue Stripe setup' : 'Connect Stripe'}</button>` : ''}${st.connected ? '<button class="btn" id="sdash">Open Stripe dashboard</button>' : ''}</div></div>`;
  } else if (tab === 'admin' && me.admin) {
    const [cs, ps] = await Promise.all([api('/admin/creators'), api('/admin/settings')]);
    body = `<div class="card" style="padding:0;overflow:auto;margin-bottom:14px"><table class="table"><tr><th>Creator</th><th>Plan</th><th class="num">GMV</th><th class="num">Fees</th><th class="num">Tasks (mo)</th><th class="num">Twin (mo)</th><th>Joined</th></tr>
      ${cs.map((c) => `<tr><td><b>${esc(c.name)}</b> <a class="small" href="/c/${esc(c.handle)}" target="_blank">@${esc(c.handle)}</a><div class="small muted">${esc(c.email)}</div></td><td>${esc(c.plan)}</td><td class="num">${usd(c.gmv_cents)}</td><td class="num">${usd(c.fees_cents)}</td><td class="num">${num(c.agent_runs)}</td><td class="num">${num(c.twin_messages)}</td><td>${fmtDate(c.created_at)}</td></tr>`).join('')}</table></div>
      <form class="card" id="adm"><h2>Platform settings</h2><p class="small muted" style="margin-top:0">Environment variables override these.</p>
      ${Object.entries(ps).map(([k, v]) => `<label class="f">${k}<input name="${k}" value="${esc(v)}" ${/KEY|TOKEN|SECRET|SID/.test(k) ? 'type="password" autocomplete="off"' : ''}/></label>`).join('')}<button class="btn primary">Save</button></form>`;
  }
  const items = [['account', 'Account'], ['billing', 'Plan & usage'], ['payments', 'Payments'], ...(me.admin ? [['admin', 'Admin']] : [])];
  const root = page('Settings', body, tabs(items, tab));
  $$('[data-tab]', root).forEach((b) => (b.onclick = () => (location.hash = '#/settings/' + b.dataset.tab)));
  $('#lo', root)?.addEventListener('click', async () => { await post('/auth/logout'); location.reload(); });
  $('#pw', root)?.addEventListener('submit', async (e) => { e.preventDefault(); await post('/me/password', Object.fromEntries(new FormData(e.target))); toast('Password changed — please log in again'); setTimeout(() => location.reload(), 1200); });
  $('#upg', root)?.addEventListener('click', async () => { const r = await post('/billing/upgrade'); if (r.url) location.href = r.url; else { toast('You are on Pro 🎉'); settingsView(tab); } });
  $('#portal', root)?.addEventListener('click', async () => { const r = await post('/billing/portal'); location.href = r.url; });
  $('#conn', root)?.addEventListener('click', async () => { const r = await post('/stripe/connect'); location.href = r.url; });
  $('#sdash', root)?.addEventListener('click', async () => { const r = await post('/stripe/dashboard'); window.open(r.url, '_blank'); });
  $('#adm', root)?.addEventListener('submit', async (e) => { e.preventDefault(); const d = Object.fromEntries(new FormData(e.target)); for (const k of Object.keys(d)) if (d[k].startsWith('••••')) d[k] = '__keep__'; await put('/admin/settings', d); toast('Saved'); });
}
