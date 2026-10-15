// 创作者公开主页：link-in-bio、产品、预约、精选链接、合作表单、AI 分身、Media Kit
'use strict';
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const usd = (c) => '$' + (Number(c || 0) / 100).toLocaleString('en-US', { minimumFractionDigits: c % 100 ? 2 : 0, maximumFractionDigits: 2 });
const compact = (n) => Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(n || 0);
// 地址形如 /c/:handle、/c/:handle/kit、/c/:handle/p/:id、/c/:handle/book/:id
const parts = location.pathname.split('/').filter(Boolean).map(decodeURIComponent);
const handle = parts[1];
const root = $('#root'), sheet = $('#sheet');
let D;
const SHAPES = { circle: '<circle cx="50" cy="50" r="48"/>', square: '<rect x="4" y="4" width="92" height="92" rx="26"/>', hex: '<path d="M50 2 92 26v48L50 98 8 74V26z"/>', diamond: '<rect x="15" y="15" width="70" height="70" rx="16" transform="rotate(45 50 50)"/>', blob: '<path d="M50 4c20 0 38 10 42 30s-2 42-20 54-46 10-60-6S2 38 12 22 30 4 50 4z"/>' };
const ICON = { digital: '⬇️', template: '🧩', ebook: '📘', course: '🎓', membership: '⭐', coaching_pack: '🎯' };
const PL = { youtube: 'YouTube', instagram: 'Instagram', tiktok: 'TikTok', x: 'X', twitch: 'Twitch', linkedin: 'LinkedIn', newsletter: 'Newsletter', podcast: 'Podcast' };
async function api(p, body) {
  const r = await fetch('/api/public' + p, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {});
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'Something went wrong');
  return j;
}
function md(s) {
  return esc(s).split(/\n{2,}/).map((b) => (/^\s*[-*] /.test(b) ? `<ul>${b.split('\n').map((l) => `<li>${l.replace(/^\s*[-*] /, '')}</li>`).join('')}</ul>` : `<p>${b.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>')}</p>`)).join('');
}
const linkify = (s) => esc(s).replace(/(https?:\/\/[^\s<]+|\/(?:c|go)\/[\w/-]+)/g, (u) => `<a href="${u}" target="_blank" rel="noopener">${u.replace(/^https?:\/\//, '')}</a>`);
function openSheet(html) {
  sheet.innerHTML = `<div class="in">${html}</div>`; sheet.hidden = false;
  sheet.onclick = (e) => { if (e.target === sheet || e.target.closest('[data-close]')) closeSheet(); };
  return $('.in', sheet);
}
function closeSheet() { sheet.hidden = true; sheet.innerHTML = ''; if (parts[2]) history.replaceState(null, '', `/c/${encodeURIComponent(handle)}`); }

async function load() {
  try { D = await api('/' + encodeURIComponent(handle)); }
  catch { root.innerHTML = '<div class="muted" style="text-align:center;margin-top:30vh">This page doesn\'t exist.</div>'; return; }
  const c = D.creator;
  document.documentElement.style.setProperty('--accent', c.color || '#6366f1');
  document.title = `${c.name} (@${c.handle})`;
  if (parts[2] === 'kit') return renderKit();
  render();
  const q = new URLSearchParams(location.search);
  if (q.get('order')) showOrder(q.get('order'));
  else if (parts[2] === 'p' && parts[3]) openProduct(+parts[3]);
  else if (parts[2] === 'book' && parts[3]) openBooking(+parts[3]);
  if (D.twin.enabled) mountTwin();
}

function avatarHtml(c) { return `<div class="av"><svg viewBox="0 0 100 100" fill="${esc(c.color)}">${SHAPES[c.shape] || SHAPES.blob}</svg><span>${esc(c.name.slice(0, 1).toUpperCase())}</span></div>`; }
function render() {
  const c = D.creator, show = c.show || {};
  root.innerHTML = `
    <div class="hero">${avatarHtml(c)}<h1>${esc(c.name)}</h1><div class="handle">@${esc(c.handle)}${c.niche ? ' · ' + esc(c.niche) : ''}${c.location ? ' · ' + esc(c.location) : ''}</div>
      ${c.bio ? `<p class="bio">${esc(c.bio)}</p>` : ''}
      <div class="socials">${D.socials.map((s) => `<a class="chip" href="${esc(s.url || '#')}" target="_blank" rel="noopener">${PL[s.platform] || esc(s.platform)} <b>${compact(s.followers)}</b></a>`).join('')}</div></div>
    ${(c.links || []).map((l) => `<a class="card link" href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.title)}</a>`).join('')}
    ${D.products.length ? `<h2>Shop</h2>${D.products.map((p) => `<div class="card prod" data-p="${p.id}"><div class="ic">${ICON[p.type] || '⬇️'}</div><div><div class="t">${esc(p.title)}</div><div class="s">${esc(p.tagline || '')}</div></div><div class="price">${p.price_cents ? usd(p.price_cents) + (p.interval ? `<span class="muted small">/${p.interval === 'month' ? 'mo' : 'yr'}</span>` : '') : 'Free'}</div></div>`).join('')}` : ''}
    ${D.services.length ? `<h2>Book a call</h2>${D.services.map((s) => `<div class="card prod" data-s="${s.id}"><div class="ic">🗓</div><div><div class="t">${esc(s.title)}</div><div class="s">${s.duration_min} min${s.description ? ' · ' + esc(s.description.slice(0, 80)) : ''}</div></div><div class="price">${s.price_cents ? usd(s.price_cents) : 'Free'}</div></div>`).join('')}` : ''}
    ${D.picks.length ? `<h2>My picks</h2><div class="picks">${D.picks.map((p) => `<a class="card pick" href="${esc(p.url)}" target="_blank" rel="noopener sponsored"><div class="t">${esc(p.title)}</div><div class="s">${esc(p.note || p.category || '')}</div></a>`).join('')}</div><p class="small muted" style="margin:4px">Some links are affiliate links — I may earn a commission at no extra cost to you.</p>` : ''}
    ${show.show_collab !== false ? `<h2>Work with me</h2><div class="card"><p style="margin-top:0">Brands & agencies — tell me about your campaign. <a href="/c/${encodeURIComponent(handle)}/kit">See my media kit →</a></p><button class="btn" id="collab">Start a collab inquiry</button></div>` : ''}
    <footer>Powered by <a href="/">Creator Crew</a></footer>`;
  $$('[data-p]').forEach((el) => (el.onclick = () => openProduct(+el.dataset.p)));
  $$('[data-s]').forEach((el) => (el.onclick = () => openBooking(+el.dataset.s)));
  $('#collab')?.addEventListener('click', openCollab);
}
const demoBanner = () => (D.payments === 'demo' ? '<div class="banner">Test checkout — payments aren’t enabled on this server yet, so no card will be charged.</div>' : '');

function openProduct(id) {
  const p = D.products.find((x) => x.id === id); if (!p) return;
  history.replaceState(null, '', `/c/${encodeURIComponent(handle)}/p/${id}`);
  const el = openSheet(`<div style="font-size:40px">${ICON[p.type] || '⬇️'}</div><h1 style="font-size:22px">${esc(p.title)}</h1><div class="muted">${esc(p.tagline || '')}</div>
    <div class="desc">${md(p.description || '')}</div>${demoBanner()}
    <form id="bf"><label>Email (we'll send your purchase here)<input name="email" type="email" required autocomplete="email"/></label><label>Name<input name="name" autocomplete="name"/></label>
    <button class="btn" style="width:100%">${p.price_cents ? `Buy for ${usd(p.price_cents)}${p.interval ? '/' + p.interval : ''}` : 'Get it free'}</button></form>
    <p class="small muted" style="text-align:center"><a href="#" data-close>Back</a></p>`);
  $('#bf', el).onsubmit = async (e) => {
    e.preventDefault(); const b = $('button', e.target); b.disabled = true;
    try { const r = await api(`/${handle}/buy`, { product_id: id, ...Object.fromEntries(new FormData(e.target)) }); if (r.url) location.href = r.url; else showOrder(r.order_ref); }
    catch (err) { alert(err.message); b.disabled = false; }
  };
}

async function openBooking(id) {
  const s = D.services.find((x) => x.id === id); if (!s) return;
  history.replaceState(null, '', `/c/${encodeURIComponent(handle)}/book/${id}`);
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const days = Array.from({ length: 21 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() + i); return d; });
  const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const el = openSheet(`<h1 style="font-size:22px">${esc(s.title)}</h1><div class="muted">${s.duration_min} min · ${s.price_cents ? usd(s.price_cents) : 'Free'}</div><div class="desc">${md(s.description || '')}</div>
    <div class="days">${days.map((d, i) => `<button class="day ${i === 0 ? 'on' : ''}" data-d="${ymd(d)}">${d.toLocaleDateString('en-US', { weekday: 'short' })}<b>${d.getDate()}</b></button>`).join('')}</div>
    <div class="small muted" style="margin-top:8px">Times shown in your timezone (${esc(tz)})</div><div id="sl" class="slots"></div>
    <form id="bk" hidden>${demoBanner()}<label>Name<input name="name" required autocomplete="name"/></label><label>Email<input name="email" type="email" required autocomplete="email"/></label>
      ${(s.questions || []).map((q, i) => `<label>${esc(q)}<textarea name="q${i}" rows="2"></textarea></label>`).join('')}
      <button class="btn" style="width:100%" id="bkb">Book</button></form><p class="small muted" style="text-align:center"><a href="#" data-close>Back</a></p>`);
  let chosen = null;
  // 查询创作者时区下某天的时段（前后各取一天以覆盖时差）
  async function loadDay(dateStr) {
    $('#sl', el).innerHTML = '<span class="muted small">Loading…</span>';
    const ds = [-1, 0, 1].map((o) => { const d = new Date(dateStr + 'T12:00:00'); d.setDate(d.getDate() + o); return ymd(d); });
    const all = (await Promise.all(ds.map((d) => api(`/${handle}/slots?service_id=${id}&date=${d}`).catch(() => ({ slots: [] }))))).flatMap((r) => r.slots);
    const mine = [...new Set(all)].filter((iso) => ymd(new Date(iso)) === dateStr).sort();
    $('#sl', el).innerHTML = mine.map((iso) => `<button class="slot" data-t="${iso}">${new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</button>`).join('') || '<span class="muted small" style="grid-column:1/-1">No times available — try another day.</span>';
    $$('.slot', el).forEach((b) => (b.onclick = () => { $$('.slot', el).forEach((x) => x.classList.remove('on')); b.classList.add('on'); chosen = b.dataset.t; $('#bk', el).hidden = false; $('#bkb', el).textContent = `Book ${new Date(chosen).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}${s.price_cents ? ' · ' + usd(s.price_cents) : ''}`; }));
  }
  $$('.day', el).forEach((b) => (b.onclick = () => { $$('.day', el).forEach((x) => x.classList.remove('on')); b.classList.add('on'); chosen = null; $('#bk', el).hidden = true; loadDay(b.dataset.d); }));
  loadDay(ymd(days[0]));
  $('#bk', el).onsubmit = async (e) => {
    e.preventDefault(); const b = $('#bkb', el); b.disabled = true;
    const f = Object.fromEntries(new FormData(e.target));
    const answers = Object.fromEntries((s.questions || []).map((q, i) => [q, f['q' + i] || '']));
    try { const r = await api(`/${handle}/book`, { service_id: id, start_at: chosen, name: f.name, email: f.email, answers }); if (r.url) location.href = r.url; else showOrder(r.order_ref); }
    catch (err) { alert(err.message); b.disabled = false; loadDay($('.day.on', el).dataset.d); }
  };
}

function openCollab() {
  const el = openSheet(`<h1 style="font-size:22px">Let's work together</h1><p class="muted" style="margin-top:4px">Share a few details and ${esc(D.creator.name.split(' ')[0])}'s team will get back to you.</p>
    <form id="cf"><input name="website" tabindex="-1" autocomplete="off" style="position:absolute;left:-9999px" aria-hidden="true"/>
    <label>I'm reaching out about<select name="kind"><option value="brand">A brand partnership</option><option value="coaching">Coaching / consulting</option><option value="press">Press / podcast</option><option value="other">Something else</option></select></label>
    <label>Your name<input name="name" required autocomplete="name"/></label><label>Work email<input name="email" type="email" required autocomplete="email"/></label>
    <label>Company / brand<input name="company"/></label><label>Budget (optional)<select name="budget"><option value="">Prefer not to say</option><option>Under $1k</option><option>$1k–$5k</option><option>$5k–$15k</option><option>$15k+</option></select></label>
    <label>Tell us about the campaign — goals, deliverables, timeline<textarea name="message" rows="4" required></textarea></label>
    <button class="btn" style="width:100%">Send inquiry</button></form><p class="small muted" style="text-align:center"><a href="#" data-close>Back</a></p>`);
  $('#cf', el).onsubmit = async (e) => {
    e.preventDefault(); const b = $('button', e.target); b.disabled = true;
    try { await api(`/${handle}/inquiry`, Object.fromEntries(new FormData(e.target))); el.innerHTML = '<div style="text-align:center;padding:30px 0"><div style="font-size:44px">📬</div><h1 style="font-size:22px">Thanks — got it!</h1><p class="muted">You\'ll hear back soon.</p><button class="btn ghost" data-close>Close</button></div>'; }
    catch (err) { alert(err.message); b.disabled = false; }
  };
}

async function showOrder(ref) {
  history.replaceState(null, '', location.pathname);
  let o; try { o = await api('/order/' + encodeURIComponent(ref)); } catch { return; }
  if (o.status !== 'paid') { openSheet('<div style="text-align:center;padding:24px 0"><h1 style="font-size:20px">Finishing up your payment…</h1><p class="muted">Refresh in a moment, or check your email.</p><button class="btn ghost" data-close>Close</button></div>'); return; }
  const el = openSheet(`<div style="text-align:center;padding:10px 0"><div style="font-size:44px">🎉</div><h1 style="font-size:22px">${o.kind === 'booking' ? "You're booked!" : 'Thank you!'}</h1><p class="muted">${esc(o.title)} — a confirmation is on its way to your inbox.</p>
    ${o.download ? `<a class="btn" style="display:inline-block;text-decoration:none" href="${esc(o.download)}">Download</a>` : ''}
    ${o.delivery_note ? `<div class="card" style="text-align:left;margin-top:12px">${linkify(o.delivery_note)}</div>` : ''}
    ${o.booking ? `<p>${new Date(o.booking.start_at).toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short' })}</p><a class="btn ghost" style="display:inline-block;text-decoration:none" href="${esc(o.booking.ics)}">Add to calendar</a>` : ''}
    <p><a href="#" data-close class="small muted">Back to page</a></p></div>`);
  void el;
}

// ---------- AI 分身 ----------
function mountTwin() {
  const t = D.twin;
  let vid = ''; try { vid = localStorage.getItem('cc_visitor') || ''; if (!vid) { vid = Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem('cc_visitor', vid); } } catch { vid = 'anon-' + Math.random().toString(36).slice(2); }
  const fab = document.createElement('button'); fab.className = 'fab'; fab.innerHTML = `💬 Ask ${esc(t.name || 'my AI')}`; document.body.appendChild(fab);
  const box = document.createElement('div'); box.className = 'twin'; box.hidden = true;
  box.innerHTML = `<div class="hd">${avatarHtml(D.creator).replace('class="av"', 'class="av" style="width:32px;height:32px;font-size:14px;margin:0"')}<div><b>${esc(t.name || 'AI assistant')}</b><div class="small muted">AI assistant · replies instantly</div></div><button class="x" aria-label="Close">×</button></div>
    <div class="log"><div class="m a">${linkify(t.greeting || 'Hi! How can I help?')}</div></div>
    <form><input placeholder="Ask about products, booking, collabs…" maxlength="2000" required/><button class="btn" style="padding:9px 14px">↑</button></form><div class="note">AI-generated replies may be inaccurate.</div>`;
  document.body.appendChild(box);
  fab.onclick = () => { box.hidden = false; fab.hidden = true; $('input', box).focus(); };
  $('.x', box).onclick = () => { box.hidden = true; fab.hidden = false; };
  $('form', box).onsubmit = async (e) => {
    e.preventDefault();
    const inp = $('input', box); const text = inp.value.trim(); if (!text) return; inp.value = '';
    const log = $('.log', box);
    log.insertAdjacentHTML('beforeend', `<div class="m u">${esc(text)}</div><div class="m a muted typing">…</div>`); log.scrollTop = log.scrollHeight;
    try { const r = await api(`/${handle}/chat`, { visitor: vid, message: text }); $('.typing', box).outerHTML = `<div class="m a">${linkify(r.reply)}</div>`; }
    catch (err) { $('.typing', box).outerHTML = `<div class="m a">${esc(err.message)}</div>`; }
    log.scrollTop = log.scrollHeight;
  };
}

// ---------- Media Kit ----------
function renderKit() {
  const k = D.kit, c = D.creator;
  document.title = `${c.name} — Media kit`;
  root.innerHTML = `<div class="hero">${avatarHtml(c)}<h1>${esc(k.name)}</h1><div class="handle">@${esc(k.handle)}${k.niche ? ' · ' + esc(k.niche) : ''}${k.location ? ' · ' + esc(k.location) : ''}</div>${k.bio ? `<p class="bio">${esc(k.bio)}</p>` : ''}</div>
    <div class="kit-stats"><div class="card"><div class="muted small">Total audience</div><div class="big">${compact(k.total_followers)}</div></div><div class="card"><div class="muted small">Platforms</div><div class="big">${k.socials.length}</div></div></div>
    <h2>Audience by platform</h2>${k.socials.map((s) => `<div class="card"><div style="display:flex;align-items:baseline;gap:8px"><b>${PL[s.platform] || esc(s.platform)}</b><span class="muted small">${esc(s.handle)}</span><span style="margin-left:auto;font-weight:700">${compact(s.followers)}</span></div>
      <div class="small muted">${s.avg_views ? `~${compact(s.avg_views)} avg views · ` : ''}${s.engagement_rate ? `${s.engagement_rate}% engagement` : ''}</div>${s.audience ? `<div class="small" style="margin-top:4px">${esc(s.audience)}</div>` : ''}</div>`).join('') || '<p class="muted">Stats coming soon.</p>'}
    ${k.past_brands.length ? `<h2>Brands I've worked with</h2><div class="brands">${k.past_brands.map((b) => `<span class="chip">${esc(b)}</span>`).join('')}</div>` : ''}
    ${k.show_rates && k.rates.length ? `<h2>Starting rates</h2><div class="card">${k.rates.map((r) => `<div style="display:flex;padding:6px 0;border-bottom:1px solid var(--line)"><span>${esc(r.label)}</span><b style="margin-left:auto">from ${esc(r.from)}</b></div>`).join('')}<p class="small muted" style="margin-bottom:0">Packages, usage rights and exclusivity quoted per campaign.</p></div>` : ''}
    <div style="text-align:center;margin-top:20px"><button class="btn" id="collab">Start a collab inquiry</button></div>
    <footer><a href="/c/${encodeURIComponent(handle)}">← ${esc(c.name)}'s page</a> · Powered by <a href="/">Creator Crew</a></footer>`;
  $('#collab').onclick = openCollab;
}
load();
