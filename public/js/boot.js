// Creator Crew 后台 — 登录注册、导航、路由、实时事件
'use strict';

function showAuth(mode = location.hash.includes('signup') ? 'signup' : 'login') {
  app.hidden = true;
  const box = $('#auth'); box.hidden = false;
  box.innerHTML = `<div class="auth"><div class="box">
    <div class="row" style="margin-bottom:18px"><img src="/logo.svg" width="30" height="30" alt=""/><b style="font-size:17px">Creator Crew</b></div>
    <h1 style="margin-bottom:4px">${mode === 'signup' ? 'Start your creator business crew' : 'Welcome back'}</h1>
    <p class="muted small" style="margin-top:0">${mode === 'signup' ? 'AI agents for brand deals, products, coaching and affiliate income — plus an AI twin on your link-in-bio.' : 'Log in to your crew.'}</p>
    <form id="af">
      ${mode === 'signup' ? `<label class="f">Your name<input name="name" required autocomplete="name"/></label>
      <label class="f">Page handle<div class="row"><span class="muted small">/c/</span><input name="handle" required pattern="[A-Za-z0-9][A-Za-z0-9_-]{1,29}" placeholder="yourname"/></div></label>` : ''}
      <label class="f">Email<input name="email" type="email" required autocomplete="email"/></label>
      <label class="f">Password<input name="password" type="password" required minlength="8" autocomplete="${mode === 'signup' ? 'new-password' : 'current-password'}"/></label>
      <button class="btn primary" style="width:100%;justify-content:center;padding:10px">${mode === 'signup' ? 'Create account' : 'Log in'}</button>
    </form>
    <p class="small muted" style="text-align:center;margin-bottom:0">${mode === 'signup' ? 'Already have an account? <a href="#login" id="sw">Log in</a>' : 'New here? <a href="#signup" id="sw">Create an account</a>'}</p>
    ${mode === 'signup' ? '<p class="small muted" style="text-align:center">By signing up you agree to the Terms and Privacy Policy.</p>' : ''}
  </div></div>`;
  $('#sw').onclick = (e) => { e.preventDefault(); history.replaceState(null, '', mode === 'signup' ? '#login' : '#signup'); showAuth(mode === 'signup' ? 'login' : 'signup'); };
  $('#af').onsubmit = async (e) => {
    e.preventDefault();
    const btn = $('button', e.target); btn.disabled = true;
    try { await api(`/auth/${mode}`, { method: 'POST', body: Object.fromEntries(new FormData(e.target)), quiet401: true }); location.hash = mode === 'signup' ? '#/onboarding' : '#/home'; location.reload(); }
    catch { btn.disabled = false; }
  };
}

const NAV = [
  ['home', '◎', 'Home'], ['agents', '✦', 'Crew'], ['sec', 'Earn'], ['deals', '🤝', 'Brand deals'], ['products', '🛍', 'Products'], ['booking', '🗓', 'Booking'], ['links', '🔗', 'Affiliate links'],
  ['sec', 'Grow'], ['leads', '📨', 'Leads & AI twin'], ['page', '🪪', 'My page'], ['sec', 'Run'], ['automations', '⏱', 'Automations'], ['approvals', '✋', 'Approvals'], ['settings', '⚙', 'Settings'],
];
function renderNav() {
  const r = S.route.name === 'agent' || S.route.name === 'group' ? 'agents' : S.route.name;
  const badge = { approvals: S.overview.approvals, leads: (S.overview.new_leads || []).length };
  nav.innerHTML = `<div class="brand"><img src="/logo.svg" width="24" height="24" alt=""/>Creator Crew</div>
    ${NAV.map(([k, ic, l]) => (k === 'sec' ? `<div class="sec">${ic}</div>` : `<a href="#/${k}" class="${r === k ? 'on' : ''}"><span class="ic">${ic}</span>${l}${badge[k] ? `<span class="badge">${badge[k]}</span>` : ''}</a>`)).join('')}
    <div class="me"><a href="${esc(S.me.public_url)}" target="_blank"><span class="ic">${avatar(S.me, 20)}</span><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(S.me.name)}</span></a></div>`;
}
async function refreshCounts() {
  try { S.overview = await api('/overview'); renderNav(); } catch { /* ignore */ }
}

async function route() {
  const [, name = 'home', a, b] = location.hash.split('/');
  S.route = { name, id: a, sub: b };
  const md = $('#modal'); md.hidden = true; md.innerHTML = ''; // 切换页面时关闭弹窗
  if (name !== 'agent' && name !== 'group') { S.conv = null; app.classList.remove('in-chat'); }
  renderNav();
  try {
    if (name === 'agent') return await chatView('agent', +a);
    if (name === 'group') return await chatView('group', +a);
    if (name === 'agents') {
      await loadAgents();
      if (S.agents.length && innerWidth > 760) { location.hash = '#/agent/' + S.agents[0].id; return; }
      app.classList.add('agents-mode'); renderSide(); main.innerHTML = '<div class="empty" style="margin-top:20vh">Pick an agent or hire one with +</div>'; panel.hidden = true; return;
    }
    const views = { home: homeView, onboarding: onboardingView, deals: dealsView, products: productsView, booking: bookingView, links: linksView, leads: leadsView, page: pageView, automations: automationsView, approvals: approvalsView, settings: settingsView };
    await (views[name] || homeView)(a);
  } catch (e) { if (e.message !== 'Please log in') { console.error(e); main.innerHTML = `<div class="empty">Couldn't load this page: ${esc(e.message)}</div>`; } }
}

let refreshTimer;
function connect() {
  const es = new EventSource('/api/stream');
  es.onmessage = (ev) => {
    const e = JSON.parse(ev.data);
    const cur = S.conv?.id;
    if (e.type === 'step') { S.liveSteps[e.conversation_id] = { steps: e.steps, agent_id: e.agent_id }; if (e.conversation_id === cur) showWorking(cur); }
    if (e.type === 'message' && e.conversation_id === cur && e.message) {
      const mi = $('#mi'); if (!mi) return;
      if (!mi.querySelector('.msg')) mi.innerHTML = '';
      $('#working')?.remove();
      mi.insertAdjacentHTML('beforeend', msgHtml(e.message, Object.fromEntries(S.agents.map((x) => [x.id, x]))));
      delete S.liveSteps[cur];
      if (S.conv.busy) showWorking(cur);
      const msgs = $('#msgs'); msgs.scrollTop = msgs.scrollHeight;
    }
    if (e.type === 'job' && e.conversation_id === cur) {
      S.conv.busy = e.status !== 'idle';
      const b = $('#send'); if (b) b.innerHTML = S.conv.busy ? I.stop : I.up;
      if (S.conv.busy) showWorking(cur); else { $('#working')?.remove(); delete S.liveSteps[cur]; }
    }
    if (['message', 'job', 'approval', 'agents'].includes(e.type) && app.classList.contains('agents-mode')) { clearTimeout(refreshTimer); refreshTimer = setTimeout(async () => { await loadAgents(); renderSide(); }, 300); }
    if (['approval', 'notification', 'business'].includes(e.type)) refreshCounts();
    if (e.type === 'approval' && e.approval) toast(`Approval needed: ${e.approval.summary}`);
    if (e.type === 'notification' && e.notification) toast(e.notification.title);
    if (e.type === 'approval' && S.route.name === 'approvals') approvalsView();
    if (e.type === 'business' && ['deals', 'products', 'leads', 'home'].includes(S.route.name) && !$('#modal').innerHTML) { clearTimeout(refreshTimer); refreshTimer = setTimeout(route, 400); }
    if (['files', 'wallet', 'mailbox', 'automations'].includes(e.type) && S.conv?.agent?.id === e.agent_id) refreshPanel();
    if (e.type === 'channel_error' && S.conv?.agent?.id === e.agent_id) toast(`${e.channel}: ${e.error}`);
  };
}

window.addEventListener('hashchange', () => { if (!app.hidden) route(); });
(async () => {
  try { S.me = await api('/me', { quiet401: true, silent: true }); }
  catch { return showAuth(); }
  app.hidden = false;
  S.overview = await api('/overview').catch(() => ({}));
  await loadAgents().catch(() => {});
  connect();
  if (!location.hash || location.hash === '#' || location.hash === '#signup' || location.hash === '#login') location.hash = S.me.onboarded ? '#/home' : '#/onboarding';
  else route();
})();
