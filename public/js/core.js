// Creator Crew 后台 — 公共工具：请求、弹窗、Markdown、头像、格式化
'use strict';
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const app = $('#app'), nav = $('#nav'), side = $('#side'), main = $('#main'), panel = $('#panel');
const store = { get: (k, d) => { try { return JSON.parse(localStorage.getItem('cc_' + k)) ?? d; } catch { return d; } }, set: (k, v) => { try { localStorage.setItem('cc_' + k, JSON.stringify(v)); } catch { /* ignore */ } } };

async function api(path, opts = {}) {
  const r = await fetch('/api' + path, { method: opts.method || (opts.body ? 'POST' : 'GET'), headers: { 'content-type': 'application/json' }, body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && !opts.quiet401) { showAuth(); throw new Error('Please log in'); }
  if (!r.ok) { if (!opts.silent) toast(j.error || 'Request failed'); throw Object.assign(new Error(j.error), { status: r.status }); }
  return j;
}
const post = (p, b = {}) => api(p, { method: 'POST', body: b });
const patch = (p, b) => api(p, { method: 'PATCH', body: b });
const put = (p, b) => api(p, { method: 'PUT', body: b });
const del = (p) => api(p, { method: 'DELETE', body: {} });
function toast(m) { const t = $('#toast'); t.textContent = m; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), 3200); }

const usd = (c, dec = true) => '$' + (Number(c || 0) / 100).toLocaleString('en-US', { minimumFractionDigits: dec ? 2 : 0, maximumFractionDigits: dec ? 2 : 0 });
const usdShort = (c) => { const v = Number(c || 0) / 100; return v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : v >= 1e4 ? `$${(v / 1e3).toFixed(1)}k` : usd(c, v % 1 !== 0); };
const num = (n) => Number(n || 0).toLocaleString('en-US');
const compact = (n) => Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(n || 0);
const toDate = (s) => (s ? new Date(String(s).includes('T') ? s : s.replace(' ', 'T')) : null);
const fmtTime = (s) => { const d = toDate(s); if (!d) return ''; const n = new Date(); return d.toDateString() === n.toDateString() ? d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); };
const fmtDate = (s) => { const d = toDate(s && s.length === 10 ? s + 'T12:00:00' : s); return d ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: d.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined }) : '—'; };
const fmtWhen = (iso, tz) => new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
const daysUntil = (d) => (d ? Math.round((new Date(d + 'T12:00:00') - new Date()) / 864e5) : null);
const dueLabel = (d) => { const n = daysUntil(d); if (n === null) return ''; if (n < 0) return `<span class="err-t">${-n}d overdue</span>`; if (n === 0) return '<span class="warn-t">due today</span>'; return n <= 3 ? `<span class="warn-t">in ${n}d</span>` : `in ${n}d`; };

// Markdown（标题/列表/表格/代码/链接/加粗）
function md(src) { return String(src || '').split(/```/).map((b, i) => (i % 2 ? `<pre>${esc(b.replace(/^\w*\n/, ''))}</pre>` : mdText(b))).join(''); }
function inline(s) {
  return esc(s).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, '$1<a href="$2" target="_blank" rel="noopener">$2</a>');
}
function mdText(src) {
  const lines = src.split('\n'); let out = '', list = null, table = [];
  const flushList = () => { if (list) { out += `</${list}>`; list = null; } };
  const flushTable = () => {
    if (!table.length) return;
    const rows = table.filter((r) => !/^\s*\|?\s*:?-{2,}/.test(r)).map((r) => r.replace(/^\s*\||\|\s*$/g, '').split('|'));
    out += '<table>' + rows.map((r, i) => `<tr>${r.map((c) => `<${i ? 'td' : 'th'}>${inline(c.trim())}</${i ? 'td' : 'th'}>`).join('')}</tr>`).join('') + '</table>';
    table = [];
  };
  for (const l of lines) {
    if (/^\s*\|.*\|\s*$/.test(l)) { flushList(); table.push(l); continue; } else flushTable();
    let m;
    if ((m = l.match(/^\s*[-*•]\s+(.*)/))) { if (list !== 'ul') { flushList(); out += '<ul>'; list = 'ul'; } out += `<li>${inline(m[1])}</li>`; continue; }
    if ((m = l.match(/^\s*\d+[.)]\s+(.*)/))) { if (list !== 'ol') { flushList(); out += '<ol>'; list = 'ol'; } out += `<li>${inline(m[1])}</li>`; continue; }
    flushList();
    if ((m = l.match(/^#{1,4}\s+(.*)/))) out += `<h4>${inline(m[1])}</h4>`;
    else if (l.trim()) out += `<p>${inline(l)}</p>`;
  }
  flushList(); flushTable();
  return out;
}

// 原创几何头像
const SHAPE_PATH = {
  circle: '<circle cx="50" cy="50" r="48"/>', square: '<rect x="4" y="4" width="92" height="92" rx="26"/>',
  hex: '<path d="M50 2 92 26v48L50 98 8 74V26z"/>', diamond: '<rect x="15" y="15" width="70" height="70" rx="16" transform="rotate(45 50 50)"/>',
  blob: '<path d="M50 4c20 0 38 10 42 30s-2 42-20 54-46 10-60-6S2 38 12 22 30 4 50 4z"/>',
};
function avatar(a, size = 36) {
  const initial = esc((a?.name || '?').trim().slice(0, 1).toUpperCase());
  return `<div class="av" style="width:${size}px;height:${size}px;font-size:${size}px"><svg viewBox="0 0 100 100" width="${size}" height="${size}" fill="${esc(a?.color || '#6366f1')}">${SHAPE_PATH[a?.shape] || SHAPE_PATH.circle}</svg><span>${initial}</span></div>`;
}
const COLORS = ['#6366f1', '#ec4899', '#f59e0b', '#14b8a6', '#22c55e', '#0ea5e9', '#ef4444', '#8b5cf6'];
const I = {
  plus: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  pc: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/></svg>',
  info: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="3" width="16" height="18" rx="3"/><circle cx="12" cy="10" r="2.5"/><path d="M8 17c1-2 2.5-3 4-3s3 1 4 3"/></svg>',
  clip: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M21 11.5 12.5 20a5 5 0 0 1-7-7L14 4.5a3.3 3.3 0 0 1 4.7 4.7L10.2 17.7a1.7 1.7 0 0 1-2.4-2.4L15.5 7.6"/></svg>',
  mic: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>',
  up: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>',
  stop: '<svg width="12" height="12" viewBox="0 0 12 12"><rect width="12" height="12" rx="2" fill="currentColor"/></svg>',
  x: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  back: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M15 6l-6 6 6 6"/></svg>',
  ext: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>',
  copy: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/></svg>',
};
const copyText = (t) => { navigator.clipboard?.writeText(t); toast('Copied'); };

// 弹窗
function modal(html, { wide } = {}) {
  const m = $('#modal');
  m.innerHTML = `<div class="box ${wide ? 'wide' : ''}">${html}</div>`;
  m.hidden = false;
  const close = () => { m.hidden = true; m.innerHTML = ''; };
  m.onclick = (e) => { if (e.target === m || e.target.closest('[data-close]')) close(); };
  document.onkeydown = (e) => { if (e.key === 'Escape' && !m.hidden) close(); };
  setTimeout(() => $('input:not([type=hidden]),textarea', m)?.focus(), 20);
  return { el: $('.box', m), close };
}
// fields: {name,label,type,value,options,placeholder,required,rows,step,help}
function fieldHtml(f) {
  const v = esc(f.value ?? '');
  const help = f.help ? `<div class="small muted" style="margin-top:3px">${f.help}</div>` : '';
  if (f.type === 'textarea') return `<label class="f">${f.label}<textarea name="${f.name}" rows="${f.rows || 4}" placeholder="${esc(f.placeholder || '')}">${v}</textarea>${help}</label>`;
  if (f.type === 'select') return `<label class="f">${f.label}<select name="${f.name}">${f.options.map(([k, l]) => `<option value="${esc(k)}" ${String(k) === String(f.value ?? '') ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>${help}</label>`;
  if (f.type === 'checkbox') return `<label class="row small" style="margin-bottom:10px"><input type="checkbox" name="${f.name}" ${f.value ? 'checked' : ''}/> ${f.label}</label>`;
  if (f.type === 'html') return f.html;
  return `<label class="f">${f.label}<input name="${f.name}" type="${f.type || 'text'}" value="${v}" placeholder="${esc(f.placeholder || '')}" ${f.required ? 'required' : ''} ${f.step ? `step="${f.step}"` : ''} ${f.min !== undefined ? `min="${f.min}"` : ''}/>${help}</label>`;
}
function formModal(title, fields, submit = 'Save', { wide, extra = '' } = {}) {
  return new Promise((resolve) => {
    const { el, close } = modal(`<h2>${esc(title)}</h2><form>${fields.map(fieldHtml).join('')}${extra}<div class="foot"><button type="button" class="btn" data-close>Cancel</button><button class="btn primary">${submit}</button></div></form>`, { wide });
    $('[data-close]', el).addEventListener('click', () => resolve(null));
    $('form', el).onsubmit = (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const out = Object.fromEntries(fd);
      for (const f of fields) if (f.type === 'checkbox') out[f.name] = fd.get(f.name) === 'on';
      close(); resolve(out);
    };
    formModal.el = el;
  });
}
const confirmBox = (msg, ok = 'Confirm') => new Promise((res) => { const { el, close } = modal(`<h2>${esc(msg)}</h2><div class="foot"><button class="btn" data-close>Cancel</button><button class="btn primary" id="cy">${ok}</button></div>`); $('[data-close]', el).onclick = () => res(false); $('#cy', el).onclick = () => { close(); res(true); }; });
const fileToB64 = (f) => new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(String(fr.result).split(',')[1]); fr.readAsDataURL(f); });

// 全局状态
const S = { me: null, overview: {}, agents: [], groups: [], route: {}, conv: null, liveSteps: {}, pendingFiles: [], q: '', panelOpen: store.get('panelOpen', true), panelTab: store.get('panelTab', 'computer') };

// 页面骨架
function page(title, body, actions = '') {
  app.classList.remove('agents-mode'); panel.hidden = true;
  main.innerHTML = `<div class="page"><div class="page-inner" style="max-width:1100px">${title ? `<div class="section-head"><h1>${title}</h1>${actions}</div>` : ''}${body}</div></div>`;
  return $('.page-inner');
}
function tabs(items, current, attr = 'data-tab') { return `<div class="tabs2">${items.map(([k, l]) => `<button ${attr}="${k}" class="${k === current ? 'on' : ''}">${l}</button>`).join('')}</div>`; }
