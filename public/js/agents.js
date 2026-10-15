// Creator Crew 后台 — 代理团队：列表、聊天、群聊、右侧面板（电脑/身份/钱包/渠道/自动化/记忆/设置）
'use strict';

async function loadAgents() { [S.agents, S.groups] = await Promise.all([api('/agents'), api('/groups')]); }
function renderSide() {
  const q = S.q.toLowerCase();
  const agents = S.agents.filter((a) => !q || a.name.toLowerCase().includes(q) || (a.role || '').toLowerCase().includes(q));
  const groups = S.groups.filter((g) => !q || g.title.toLowerCase().includes(q));
  const r = S.route;
  side.innerHTML = `
    <div class="side-top"><div class="logo" style="font-size:15px">Your crew</div><button class="ib" id="new" title="New">${I.plus}</button></div>
    <div class="search"><input id="q" placeholder="Search agents" value="${esc(S.q)}"/></div>
    <div class="side-list">
      ${agents.map((a) => `<div class="item ${r.name === 'agent' && +r.id === a.id ? 'on' : ''}" data-go="#/agent/${a.id}">${avatar(a, 40)}
        <div class="meta"><div class="top"><span class="name">${esc(a.name)}</span>${a.busy ? '<span class="dot-busy" title="Working"></span>' : ''}${a.pending ? `<span class="badge">${a.pending}</span>` : ''}<span class="time">${fmtTime(a.last?.created_at)}</span></div>
        <div class="last">${esc(a.last ? a.last.content.replace(/\s+/g, ' ').slice(0, 60) : a.role || 'Say hi')}</div></div></div>`).join('')}
      ${groups.length ? '<div class="side-sec">Team chats</div>' : ''}
      ${groups.map((g) => `<div class="item ${r.name === 'group' && +r.id === g.id ? 'on' : ''}" data-go="#/group/${g.id}"><div class="stack">${g.members.slice(0, 3).map((m) => avatar(m, 26)).join('')}</div>
        <div class="meta"><div class="top"><span class="name">${esc(g.title)}</span><span class="time">${fmtTime(g.last?.created_at)}</span></div><div class="last">${esc(g.last?.content?.replace(/\s+/g, ' ').slice(0, 50) || g.members.map((m) => m.name).join(', '))}</div></div></div>`).join('')}
    </div>`;
  $$('[data-go]', side).forEach((el) => (el.onclick = () => (location.hash = el.dataset.go)));
  $('#q').oninput = (e) => { S.q = e.target.value; renderSide(); const i = $('#q'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); };
  $('#new').onclick = newMenu;
}
function newMenu() {
  const { el, close } = modal(`<h2>Add to your crew</h2><div class="grid g2">
    <div class="card tpl" id="na"><b>New agent</b><div class="small muted">A teammate with its own inbox, phone, wallet and computer</div></div>
    <div class="card tpl" id="ng"><b>Team chat</b><div class="small muted">Several agents working on one goal together</div></div></div>
    <div class="foot"><button class="btn" data-close>Cancel</button></div>`);
  $('#na', el).onclick = () => { close(); pickAgentTemplate(); };
  $('#ng', el).onclick = () => { close(); createGroup(); };
}
async function pickAgentTemplate() {
  const t = await getTemplates();
  const have = new Set(S.agents.map((a) => a.role));
  const { el, close } = modal(`<h2>Hire an agent</h2><div class="grid g2">${t.agents.map((a, i) => `<div class="card tpl" data-t="${i}" style="${have.has(a.role) ? 'opacity:.55' : ''}"><div class="row">${avatar(a, 32)}<div><b>${esc(a.name)}</b> <span class="small muted">· ${esc(a.role)}</span></div></div><div class="small muted" style="margin-top:6px">${esc(a.desc)}</div></div>`).join('')}
    <div class="card tpl" id="blank"><b>${I.plus} Custom agent</b><div class="small muted" style="margin-top:6px">Define the role yourself</div></div></div><div class="foot"><button class="btn" data-close>Cancel</button></div>`, { wide: true });
  $$('[data-t]', el).forEach((c) => (c.onclick = async () => { close(); const tp = t.agents[+c.dataset.t]; const a = await post('/agents', { name: tp.name, template: tp.key }); await loadAgents(); location.hash = '#/agent/' + a.id; }));
  $('#blank', el).onclick = () => { close(); createAgent(); };
}
async function createAgent() {
  const shapes = Object.keys(SHAPE_PATH);
  const color = COLORS[S.agents.length % COLORS.length];
  const r = await formModal('Custom agent', [
    { name: 'name', label: 'Name', required: true, placeholder: 'e.g. Sky' },
    { name: 'role', label: 'Role', placeholder: 'e.g. YouTube SEO strategist' },
    { type: 'html', html: `<div class="f small muted">Look</div><div class="shape-pick" style="margin-bottom:10px">${shapes.map((s, i) => `<label><input type="radio" name="shape" value="${s}" ${i === 0 ? 'checked' : ''}/>${avatar({ name: 'A', color, shape: s }, 36)}</label>`).join('')}</div>
      <div class="shape-pick" style="margin-bottom:12px">${COLORS.map((c) => `<label><input type="radio" name="color" value="${c}" ${c === color ? 'checked' : ''}/><div class="av" style="width:22px;height:22px;border-radius:50%;background:${c}"></div></label>`).join('')}</div>` },
    { name: 'instructions', label: 'Instructions — what it owns, how it works', type: 'textarea', rows: 5 },
  ], 'Create');
  if (!r) return;
  const a = await post('/agents', r);
  await loadAgents();
  location.hash = '#/agent/' + a.id;
}
async function createGroup() {
  if (S.agents.length < 2) return toast('You need at least two agents for a team chat');
  const r = await formModal('New team chat', [
    { name: 'title', label: 'Name', required: true, placeholder: 'e.g. Q1 product launch' },
    { name: 'goal', label: 'Shared goal', type: 'textarea', rows: 2, placeholder: 'e.g. Launch my $49 editing course by March 1' },
    { type: 'html', html: `<div class="f small muted">Members (the first one coordinates)</div>${S.agents.map((a) => `<label class="row" style="padding:4px 0"><input type="checkbox" name="m_${a.id}"/>${avatar(a, 24)}<span>${esc(a.name)} <span class="small muted">${esc(a.role || '')}</span></span></label>`).join('')}` },
  ], 'Create');
  if (!r) return;
  const members = S.agents.filter((a) => r['m_' + a.id]).map((a) => ({ id: a.id }));
  if (members.length < 2) return toast('Pick at least two agents');
  const g = await post('/groups', { title: r.title, goal: r.goal, members });
  await loadAgents();
  location.hash = '#/group/' + g.id;
}

// ================= 聊天 =================
async function chatView(type, id) {
  app.classList.add('agents-mode');
  if (!S.agents.length) await loadAgents();
  renderSide();
  const agent = type === 'agent' ? await api('/agents/' + id) : null;
  const convId = type === 'agent' ? agent.conversation_id : +id;
  const c = await api('/conversations/' + convId);
  S.conv = { ...c, agent, type };
  const byId = Object.fromEntries(S.agents.map((a) => [a.id, a]));
  const title = type === 'agent' ? agent.name : c.title;
  const recsHidden = store.get('recsHidden_' + convId, false);
  const tpls = await getTemplates();
  main.innerHTML = `
    <div class="head"><button class="ib mobile-only" id="back">${I.back}</button>
      ${type === 'agent' ? avatar(agent, 30) : `<div class="stack">${c.members.slice(0, 4).map((m) => avatar(m, 26)).join('')}</div>`}
      <div><div class="title">${esc(title)}</div>${type === 'agent' && agent.role ? `<div class="small muted">${esc(agent.role)}</div>` : c.goal ? `<div class="small muted">${esc(c.goal)}</div>` : ''}</div>
      <span class="sp"></span>
      ${type === 'agent' ? `<button class="ib ${S.panelOpen && S.panelTab === 'computer' ? 'on' : ''}" data-pt="computer" title="Files">${I.pc}</button><button class="ib ${S.panelOpen && S.panelTab !== 'computer' ? 'on' : ''}" data-pt="identity" title="Agent details">${I.info}</button>`
        : `<button class="ib ${S.panelOpen ? 'on' : ''}" data-pt="group" title="Team info">${I.info}</button>`}
    </div>
    <div class="msgs" id="msgs"><div class="msgs-inner" id="mi">${c.messages.length ? c.messages.map((m) => msgHtml(m, byId)).join('') : emptyChat(type, agent, c)}</div></div>
    ${!recsHidden && type === 'agent' ? `<div class="recs"><div class="row" style="margin-bottom:6px"><b class="small">Try</b><span class="sp"></span><button class="ib" id="hide-recs">${I.x}</button></div>
      <div class="recs-grid">${tpls.prompts.slice(0, 3).map((p, i) => `<div class="rec" data-rec="${i}"><div class="ic">${p.icon}</div><div><b>${esc(p.title)}</b><span>${esc(p.text)}</span></div></div>`).join('')}</div></div>` : ''}
    <div class="composer-wrap"><div class="files-pending" id="fp"></div>
      <div class="composer"><button class="ib" id="att" title="Attach">${I.clip}</button><input type="file" id="file" multiple hidden/>
        <textarea id="inp" rows="1" placeholder="Message ${esc(title)}${type === 'group' ? ' (use @Name to assign)' : ''}"></textarea>
        <button class="ib mic" id="mic" title="Dictate">${I.mic}</button>
        <button class="send" id="send">${c.busy ? I.stop : I.up}</button></div></div>`;
  const msgs = $('#msgs');
  msgs.scrollTop = msgs.scrollHeight;
  if (c.busy) showWorking(convId);
  $('#back')?.addEventListener('click', () => { app.classList.remove('in-chat'); location.hash = '#/agents'; });
  app.classList.add('in-chat');
  $$('[data-pt]').forEach((b) => (b.onclick = () => { const t = b.dataset.pt; S.panelOpen = !(S.panelOpen && (t === 'computer' ? S.panelTab === 'computer' : S.panelTab !== 'computer')); if (t !== 'group') S.panelTab = t; S.panelForce = true; store.set('panelOpen', S.panelOpen); store.set('panelTab', S.panelTab); chatView(type, id); }));
  $('#hide-recs')?.addEventListener('click', () => { store.set('recsHidden_' + convId, true); $('.recs').remove(); });
  $$('[data-rec]').forEach((el) => (el.onclick = () => { inp.value = tpls.prompts[+el.dataset.rec].text; inp.focus(); autosize(); }));
  $$('[data-starter]').forEach((el) => (el.onclick = () => { inp.value = el.dataset.starter; send(); }));
  const inp = $('#inp');
  const autosize = () => { inp.style.height = 'auto'; inp.style.height = Math.min(inp.scrollHeight, 200) + 'px'; };
  inp.oninput = autosize;
  inp.onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); } };
  $('#send').onclick = () => (S.conv.busy ? post(`/conversations/${convId}/stop`) : send());
  $('#att').onclick = () => $('#file').click();
  $('#file').onchange = async (e) => {
    for (const f of e.target.files) { if (f.size > 20e6) { toast(`${f.name} is over 20 MB`); continue; } S.pendingFiles.push({ name: f.name, size: f.size, data: await fileToB64(f) }); }
    renderPending(); e.target.value = '';
  };
  makeMic($('#mic'), (t) => { inp.value += t; autosize(); });
  renderPending();
  async function send() {
    const text = inp.value.trim();
    if (!text && !S.pendingFiles.length) return;
    const attachments = S.pendingFiles;
    try { await post(`/conversations/${convId}/messages`, { text, attachments }); inp.value = ''; autosize(); S.pendingFiles = []; renderPending(); }
    catch (e) { if (e.status === 402) upgradePrompt(e.message); }
  }
  if (S.panelOpen && (innerWidth > 760 || S.panelForce)) renderPanel(); else panel.hidden = true;
  S.panelForce = false;
}
function renderPending() {
  const fp = $('#fp'); if (!fp) return;
  fp.innerHTML = S.pendingFiles.map((f, i) => `<span class="att">📎 ${esc(f.name)} <button class="ib" data-rm="${i}" style="padding:0">${I.x}</button></span>`).join('');
  $$('[data-rm]', fp).forEach((b) => (b.onclick = () => { S.pendingFiles.splice(+b.dataset.rm, 1); renderPending(); }));
}
function emptyChat(type, agent, c) {
  if (type === 'group') return `<div class="empty" style="margin-top:12vh"><div class="stack" style="justify-content:center;margin-bottom:12px">${c.members.map((m) => avatar(m, 44)).join('')}</div><b>${esc(c.title)}</b><div>Share the goal — ${esc(c.members[0]?.name || '')} will split the work. Use @Name to assign directly.</div></div>`;
  const starters = ['What can you do for my business?', 'Find 5 brands that sponsor creators in my niche right now', 'Give me a business overview'];
  return `<div class="empty" style="margin-top:9vh"><div style="display:flex;justify-content:center;margin-bottom:12px">${avatar(agent, 64)}</div><b style="font-size:16px;color:var(--ink)">${esc(agent.name)}</b><div class="small">${esc(agent.role || '')}</div>
    <div style="margin:8px auto 14px;max-width:440px">${esc((agent.instructions || '').slice(0, 160))}</div>
    <div class="row wrap" style="justify-content:center">${starters.map((s) => `<button class="btn sm" data-starter="${esc(s)}">${esc(s)}</button>`).join('')}</div></div>`;
}
const CH = { email: 'email', sms: 'SMS', call: 'phone', telegram: 'Telegram', slack: 'Slack', line: 'LINE', imessage: 'iMessage', automation: 'automation' };
function stepsHtml(steps) {
  if (!steps?.length) return '';
  const ic = { done: '✓', running: '◌', error: '✕', waiting: '⏸' };
  return `<div class="steps">${steps.map((s) => `<div class="step ${s.status}"><span class="s">${ic[s.status] || '·'}</span>${esc(s.text)}${s.status === 'waiting' ? ' · <a href="#/approvals">needs your approval</a>' : ''}</div>`).join('')}</div>`;
}
function msgHtml(m, agents) {
  const atts = (m.attachments || []).map((a) => `<div class="att">📎 ${esc(a.name)}</div>`).join('');
  if (m.sender === 'user') return `<div class="msg user"><div><div class="bubble">${esc(m.content)}</div>${atts}${m.channel !== 'app' ? `<div class="via">via ${CH[m.channel] || m.channel}</div>` : ''}</div></div>`;
  if (m.sender === 'system') return `<div class="msg system"><div class="sys">${esc(m.content.length > 400 ? m.content.slice(0, 400) + '…' : m.content)}</div></div>`;
  const a = agents[m.agent_id] || { name: 'Agent' };
  const showName = S.conv?.type === 'group' || (S.conv?.agent && S.conv.agent.id !== m.agent_id);
  return `<div class="msg agent">${avatar(a, 30)}<div style="min-width:0;flex:1">${showName ? `<div class="who">${esc(a.name)}</div>` : ''}${stepsHtml(m.steps)}<div class="bubble" style="display:inline-block">${md(m.content)}</div></div></div>`;
}
function showWorking(convId) {
  const mi = $('#mi'); if (!mi || S.conv?.id !== convId) return;
  let w = $('#working');
  if (!w) { mi.insertAdjacentHTML('beforeend', '<div id="working"></div>'); w = $('#working'); }
  const live = S.liveSteps[convId];
  const a = S.agents.find((x) => x.id === live?.agent_id) || S.conv.agent || S.agents[0];
  w.innerHTML = `<div class="msg agent">${avatar(a, 30)}<div>${stepsHtml(live?.steps)}<div class="working" style="padding:0"><span class="dot-busy"></span>${esc(a?.name || '')} is working…</div></div></div>`;
  const msgs = $('#msgs'); if (msgs && msgs.scrollHeight - msgs.scrollTop - msgs.clientHeight < 220) msgs.scrollTop = msgs.scrollHeight;
}
function makeMic(btn, onText) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { btn.title = 'Dictation is not supported in this browser'; btn.disabled = true; btn.style.opacity = .35; return; }
  let rec = null;
  btn.onclick = () => {
    if (rec) return rec.stop();
    rec = new SR(); rec.lang = navigator.language || 'en-US'; rec.interimResults = false; rec.continuous = true;
    rec.onresult = (e) => { for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) onText(e.results[i][0].transcript); };
    rec.onend = () => { rec = null; btn.classList.remove('on'); };
    rec.onerror = (e) => toast('Dictation: ' + e.error);
    rec.start(); btn.classList.add('on');
  };
}

// ================= 右侧面板 =================
const TABS = [['computer', 'Files'], ['identity', 'Identity'], ['wallet', 'Wallet'], ['channels', 'Channels'], ['automations', 'Automations'], ['memory', 'Memory'], ['config', 'Settings']];
async function renderPanel() {
  if (!S.conv) return;
  panel.hidden = false;
  if (S.conv.type === 'group') return groupPanel();
  const a = await api('/agents/' + S.conv.agent.id);
  S.conv.agent = a;
  const t = S.panelTab;
  panel.innerHTML = `<div class="panel-head"><b style="flex:1">${esc(a.name)} · ${TABS.find((x) => x[0] === t)?.[1] || ''}</b><button class="ib" id="pclose">${I.x}</button></div>
    <div class="panel-tabs">${TABS.map(([k, l]) => `<button data-tab="${k}" class="${k === t ? 'on' : ''}">${l}</button>`).join('')}</div><div class="panel-body" id="pb"><div class="empty">Loading…</div></div>`;
  $('#pclose').onclick = () => { S.panelOpen = false; store.set('panelOpen', false); panel.hidden = true; $$('[data-pt]').forEach((b) => b.classList.remove('on')); };
  $$('[data-tab]', panel).forEach((b) => (b.onclick = () => { S.panelTab = b.dataset.tab; store.set('panelTab', S.panelTab); renderPanel(); }));
  await ({ computer: pComputer, identity: pIdentity, wallet: pWallet, channels: pChannels, automations: pAutomations, memory: pMemory, config: pConfig }[t] || pComputer)(a, $('#pb'));
}
const refreshPanel = () => { if (S.panelOpen && S.conv && S.conv.type === 'agent') renderPanel(); };

async function pComputer(a, pb) {
  const files = await api(`/agents/${a.id}/files`);
  pb.innerHTML = `<h3 style="margin-top:0">Workspace files</h3>
    ${files.filter((f) => !f.dir).map((f) => `<div class="list-row"><span>📄</span><span class="grow" title="${esc(f.path)}">${esc(f.path)}</span><span class="small muted">${f.size > 1024 ? (f.size / 1024).toFixed(1) + 'K' : f.size + 'B'}</span>
      <a class="ib" href="/api/agents/${a.id}/files/raw?path=${encodeURIComponent(f.path)}" target="_blank" rel="noopener" title="Open">↗</a><a class="ib" href="/api/agents/${a.id}/files/raw?download=1&path=${encodeURIComponent(f.path)}" title="Download">⤓</a><button class="ib" data-delf="${esc(f.path)}" title="Delete">${I.x}</button></div>`).join('') || '<div class="small muted">Pitches, scripts and reports your agent creates show up here. Files you attach in chat go to uploads/.</div>'}`;
  $$('[data-delf]', pb).forEach((b) => (b.onclick = async () => { if (await confirmBox(`Delete ${b.dataset.delf}?`, 'Delete')) { await api(`/agents/${a.id}/files?path=${encodeURIComponent(b.dataset.delf)}`, { method: 'DELETE', body: {} }); renderPanel(); } }));
}
async function pIdentity(a, pb) {
  const box = await api(`/agents/${a.id}/mailbox`);
  const tab = pIdentity.tab || 'email';
  const rows = box.filter((m) => m.channel === tab);
  pb.innerHTML = `<div class="card"><div class="kv">
      <span class="k">Email</span><span><code>${esc(a.email || '')}</code></span>
      <span class="k">Phone</span><span>${a.phone ? `<code>${esc(a.phone)}</code>` : '<span class="muted">none</span>'}</span>
      <span class="k">Wallet</span><span>${usd(a.balance_cents)}</span></div>
    <div class="row wrap" style="margin-top:10px"><button class="btn sm" id="edmail">Change email</button><button class="btn sm" id="edphone">${a.phone ? 'Change number' : 'Get a number'}</button></div></div>
    <div class="panel-tabs" style="position:static;padding:10px 0;border:0">${[['email', 'Email'], ['sms', 'Texts'], ['call', 'Calls']].map(([k, l]) => `<button data-mt="${k}" class="${k === tab ? 'on' : ''}">${l}</button>`).join('')}</div>
    ${rows.map((m) => `<div class="list-row" style="align-items:flex-start"><span>${m.direction === 'in' ? '↘' : '↗'}</span><div class="grow"><div class="row"><b class="grow">${esc(m.peer)}</b><span class="small muted">${fmtTime(m.created_at)}</span></div>
      ${m.subject ? `<div>${esc(m.subject)}</div>` : ''}<div class="small muted" style="white-space:pre-wrap;max-height:80px;overflow:hidden">${esc(m.body.slice(0, 300))}</div>
      <span class="pill ${m.status === 'failed' ? 'err' : m.status === 'simulated' ? 'warn' : ''}">${{ sent: 'sent', simulated: 'simulated', received: 'unread', read: 'read', failed: 'failed' }[m.status] || m.status}</span></div></div>`).join('') || '<div class="empty">Nothing yet</div>'}`;
  $$('[data-mt]', pb).forEach((b) => (b.onclick = () => { pIdentity.tab = b.dataset.mt; renderPanel(); }));
  $('#edmail').onclick = async () => { const r = await formModal('Agent email', [{ name: 'email', label: 'Address (on a domain verified with your email provider)', value: a.email, required: true, type: 'email' }]); if (r) { await patch('/agents/' + a.id, r); renderPanel(); } };
  $('#edphone').onclick = () => phoneDialog(a);
}
async function phoneDialog(a) {
  const pro = S.me.plan_info.name === 'Pro';
  const { el, close } = modal(`<h2>Phone number for ${esc(a.name)}</h2>
    ${pro ? `<div class="row"><input id="area" placeholder="Area code, e.g. 415"/><button class="btn" id="srch">Search</button></div><div id="nums" style="margin:10px 0"></div><h3>Or enter a number you already own</h3>` : '<p class="small muted">Buying a number is a Pro feature. You can still enter an existing number for simulation.</p>'}
    <form class="row" id="manual"><input name="number" placeholder="+14155550100" value="${esc(a.phone || '')}"/><button class="btn primary">Save</button></form>
    <div class="foot"><button class="btn" data-close>Close</button></div>`);
  $('#manual', el).onsubmit = async (e) => { e.preventDefault(); await post(`/agents/${a.id}/phone`, { number: e.target.number.value.trim() }); close(); renderPanel(); };
  $('#srch', el)?.addEventListener('click', async () => {
    const nums = await api(`/phone/numbers?country=US&area=${encodeURIComponent($('#area', el).value)}`);
    $('#nums', el).innerHTML = nums.map((n) => `<div class="list-row"><b class="grow">${esc(n.number)}</b><span class="small muted">${esc(n.locality || '')} ${esc(n.region || '')}</span><button class="btn sm" data-buy="${esc(n.number)}">Buy & assign</button></div>`).join('') || '<div class="small muted">No numbers found (is the phone provider configured?)</div>';
    $$('[data-buy]', el).forEach((b) => (b.onclick = async () => { if (!(await confirmBox(`Buy ${b.dataset.buy}? It's billed monthly.`, 'Buy'))) return; await post(`/agents/${a.id}/phone`, { number: b.dataset.buy, buy: true }); toast('Number assigned'); renderPanel(); }));
  });
}
async function pWallet(a, pb) {
  const w = await api(`/agents/${a.id}/wallet`);
  pb.innerHTML = `<div class="card"><div class="small muted">Balance</div><div class="balance">${usd(w.balance_cents)}</div>
    <div class="small muted" style="margin:4px 0 10px">Per-payment cap: ${a.budget_cents ? usd(a.budget_cents) : 'none'} · every payment needs your approval</div>
    <div class="row"><button class="btn brand sm" id="top">Add funds</button><button class="btn sm" id="bud">Set cap</button></div>
    ${w.stripe ? '' : '<div class="small muted" style="margin-top:8px">Payments are in test mode on this server — funds are tracked but no card is charged.</div>'}</div>
    <p class="small muted">Use the wallet for small business expenses your agent handles for you (e.g. shipping a product sample, a stock asset, a domain). Purchases are recorded here.</p>
    <h3>Transactions</h3>${w.tx.map((t) => `<div class="list-row"><span class="grow">${esc(t.description || t.kind)}<div class="small muted">${fmtTime(t.created_at)}</div></span><b class="${t.amount_cents < 0 ? 'err-t' : 'ok-t'}">${t.amount_cents > 0 ? '+' : ''}${usd(t.amount_cents)}</b></div>`).join('') || '<div class="empty">No transactions</div>'}`;
  $('#top').onclick = async () => { const r = await formModal('Add funds', [{ name: 'amount', label: 'Amount (USD)', type: 'number', step: '0.01', value: '20', required: true }], 'Continue'); if (!r) return; const res = await post(`/agents/${a.id}/wallet/topup`, r); if (res.url) location.href = res.url; else { toast('Funds added'); renderPanel(); } };
  $('#bud').onclick = async () => { const r = await formModal('Per-payment cap', [{ name: 'b', label: 'USD (0 = no cap)', type: 'number', step: '0.01', value: (a.budget_cents / 100).toFixed(2) }]); if (r) { await patch('/agents/' + a.id, { budget_cents: Math.round(Number(r.b) * 100) }); renderPanel(); } };
}
async function pChannels(a, pb) {
  const c = a.channels, devices = await api('/devices');
  const on = (k) => (c[k]?.enabled ? '<span class="pill ok">on</span>' : '<span class="pill">off</span>');
  pb.innerHTML = `<div class="hint" style="margin-top:0">Coming soon: chatting with ${esc(a.name)} from Telegram, Slack, iMessage or LINE. You can save settings now; they aren't connected yet.</div>
    ${[['telegram', 'Telegram', 'Create a bot with @BotFather and paste the token. Works without a public URL.'], ['slack', 'Slack', 'Bot token (xoxb-) + channel ID. Scopes: channels:history, chat:write.'], ['imessage', 'iMessage', 'Through a connected Mac running the companion.'], ['line', 'LINE', `Webhook: <code>yourapp.com/webhooks/line/${a.id}</code>`]].map(([k, n, d]) => `<div class="card"><div class="row"><b>${n}</b>${on(k)}<span class="sp"></span><button class="btn sm" data-ch="${k}">Set up</button></div><div class="small muted">${d}</div></div>`).join('')}
    <h3>Connected apps</h3>
    <div class="card"><div class="row"><b>Notion</b>${a.connections.notion?.token ? '<span class="pill ok">connected</span>' : '<span class="pill">off</span>'}<span class="sp"></span><button class="btn sm" data-ch="notion">Set up</button></div><div class="small muted">Create an internal integration, paste its token, and share pages with it.</div></div>`;
  const F = {
    telegram: [{ name: 'token', label: 'Bot token', value: c.telegram?.token }, { name: 'allowed_user', label: 'Only respond to this username (recommended)', value: c.telegram?.allowed_user, placeholder: '@yourname' }],
    slack: [{ name: 'token', label: 'Bot token (xoxb-…)', value: c.slack?.token }, { name: 'channel', label: 'Channel ID', value: c.slack?.channel }, { name: 'mention_only', label: 'Only reply when @mentioned', type: 'checkbox', value: c.slack?.mention_only }],
    imessage: [{ name: 'device_id', label: 'Mac', type: 'select', value: c.imessage?.device_id, options: devices.map((d) => [d.id, d.name]) }, { name: 'handle', label: 'Only respond to (your number / Apple ID)', value: c.imessage?.handle }, { name: 'prefix', label: 'Trigger prefix (optional)', value: c.imessage?.prefix, placeholder: `@${a.name}` }],
    line: [{ name: 'token', label: 'Channel access token', value: c.line?.token }, { name: 'secret', label: 'Channel secret', value: c.line?.secret }],
    notion: [{ name: 'token', label: 'Integration token', value: a.connections.notion?.token }],
  };
  $$('[data-ch]', pb).forEach((b) => (b.onclick = async () => {
    const k = b.dataset.ch;
    if (k === 'imessage' && !devices.length) return toast('Connect a Mac in the Computer tab first');
    const fields = [...F[k], ...(k === 'notion' ? [] : [{ name: 'enabled', label: 'Enabled', type: 'checkbox', value: c[k]?.enabled ?? true }])];
    const r = await formModal(k === 'notion' ? 'Notion' : `Connect ${k}`, fields);
    if (!r) return;
    if (k === 'notion') await patch('/agents/' + a.id, { connections: { notion: { token: r.token } } });
    else await patch('/agents/' + a.id, { channels: { [k]: { ...c[k], ...r } } });
    if (r.token || k === 'imessage') { try { const t = await post(`/agents/${a.id}/channels/test`, { channel: k }); toast('Connected' + (t.info ? ': ' + t.info : '')); } catch { /* toast shown */ } }
    renderPanel();
  }));
}
async function pAutomations(a, pb) {
  const list = await api('/automations?agent_id=' + a.id);
  pb.innerHTML = `<p class="small muted" style="margin-top:0">${esc(a.name)} can start working on a schedule or when something happens — a new lead, sale, booking, email or text.</p>
    <button class="btn sm" id="newau">${I.plus} New automation</button><div style="margin-top:10px">${list.map((x) => autoCard(x)).join('') || '<div class="empty">No automations yet</div>'}</div>`;
  $('#newau').onclick = () => editAutomation({ agent_id: a.id });
  bindAutoCards(pb);
}
async function pMemory(a, pb) {
  const list = await api(`/agents/${a.id}/memories`);
  pb.innerHTML = `<p class="small muted" style="margin-top:0">What ${esc(a.name)} remembers about you and your business.</p>
    <form class="row" id="memf"><input name="c" placeholder="e.g. I never work with gambling or crypto brands"/><button class="btn sm">Add</button></form>
    <div style="margin-top:10px">${list.map((m) => `<div class="list-row"><span class="grow" style="white-space:normal">${esc(m.content)}</span><button class="ib" data-delm="${m.id}">${I.x}</button></div>`).join('') || '<div class="empty">Nothing yet</div>'}</div>`;
  $('#memf').onsubmit = async (e) => { e.preventDefault(); const v = e.target.c.value.trim(); if (v) { await post(`/agents/${a.id}/memories`, { content: v }); renderPanel(); } };
  $$('[data-delm]', pb).forEach((b) => (b.onclick = async () => { await del('/memories/' + b.dataset.delm); renderPanel(); }));
}
async function pConfig(a, pb) {
  const ap = a.approval;
  const L = { email: 'Sending email', sms: 'Sending texts', call: 'Making calls', exec: 'Running commands on its cloud computer' };
  pb.innerHTML = `<form id="cf"><label class="f">Name<input name="name" value="${esc(a.name)}"/></label><label class="f">Role<input name="role" value="${esc(a.role || '')}"/></label>
    <label class="f">Instructions<textarea name="instructions" rows="8">${esc(a.instructions)}</textarea></label>
    <h3>Ask me before…</h3>
    ${Object.entries(L).map(([k, l]) => `<div class="list-row"><span class="grow">${l}</span><label class="switch"><input type="checkbox" name="ap_${k}" ${ap[k] !== false ? 'checked' : ''}/><i></i></label></div>`).join('')}
    <div class="list-row"><span class="grow">Payments & commands on your computer</span><span class="small muted">always</span></div>
    <button class="btn primary" style="margin-top:12px">Save</button></form>
    <h3>Danger zone</h3><button class="btn danger sm" id="clr">Clear chat</button> <button class="btn danger sm" id="delag">Remove agent</button>`;
  $('#cf').onsubmit = async (e) => {
    e.preventDefault(); const f = new FormData(e.target);
    await patch('/agents/' + a.id, { name: f.get('name'), role: f.get('role'), instructions: f.get('instructions'), approval: Object.fromEntries(Object.keys(L).map((k) => [k, !!f.get('ap_' + k)])) });
    toast('Saved'); await loadAgents(); route();
  };
  $('#clr').onclick = async () => { if (await confirmBox('Clear this chat history?', 'Clear')) { await del(`/conversations/${a.conversation_id}/messages`); route(); } };
  $('#delag').onclick = async () => { if (await confirmBox(`Remove ${a.name}? Its memory, automations and files will be deleted.`, 'Remove')) { await del('/agents/' + a.id); await loadAgents(); location.hash = '#/agents'; } };
}
function groupPanel() {
  const c = S.conv;
  panel.innerHTML = `<div class="panel-head"><b style="flex:1">Team chat</b><button class="ib" id="pclose">${I.x}</button></div><div class="panel-body">
    <h3 style="margin-top:0">Goal</h3><div>${esc(c.goal || 'Not set')}</div>
    <h3>Members</h3>${c.members.map((m, i) => `<div class="list-row">${avatar(m, 30)}<span class="grow"><b>${esc(m.name)}</b>${i === 0 ? ' <span class="pill">lead</span>' : ''}<div class="small muted">${esc(m.role || '')}</div></span><a class="btn sm" href="#/agent/${m.id}">1:1</a></div>`).join('')}
    <h3>How it works</h3><div class="small muted">The lead replies first and hands work to teammates with @Name. Teammates can keep handing off (up to 8 turns per message). You make the final call.</div>
    <button class="btn danger sm" id="delg" style="margin-top:16px">Delete team chat</button></div>`;
  $('#pclose').onclick = () => { S.panelOpen = false; store.set('panelOpen', false); panel.hidden = true; };
  $('#delg').onclick = async () => { if (await confirmBox('Delete this team chat?', 'Delete')) { await del('/groups/' + c.id); await loadAgents(); location.hash = '#/agents'; } };
}

// 自动化卡片（面板和自动化页共用）
const TRIG = { cron: 'Schedule', lead: 'New lead', order: 'New sale', booking: 'New booking', email: 'Email received', sms: 'Text received', webhook: 'Webhook' };
function cronText(c) {
  const p = String(c || '').split(' ');
  if (p.length !== 5) return c;
  const t = /^\d+$/.test(p[0]) && /^\d+$/.test(p[1]) ? new Date(2000, 0, 1, +p[1], +p[0]).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : null;
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  if (t && p[2] === '*' && p[3] === '*') return ({ '*': 'Every day', '1-5': 'Weekdays', '0,6': 'Weekends' }[p[4]] || `Every ${p[4].split(',').map((d) => days[d] || d).join(', ')}`) + ' at ' + t;
  return c;
}
function autoCard(x, showAgent) {
  const r = x.runs?.[0];
  return `<div class="card"><div class="row">${showAgent ? avatar({ name: x.agent_name, color: x.color, shape: x.shape }, 26) : ''}<b style="flex:1">${esc(x.name)}</b>
    <label class="switch"><input type="checkbox" data-en="${x.id}" ${x.enabled ? 'checked' : ''}/><i></i></label></div>
    <div class="small muted" style="margin:4px 0">${TRIG[x.trigger] || x.trigger}${x.trigger === 'cron' ? ' · ' + esc(cronText(x.cron)) : ''}${x.filter ? ` · contains “${esc(x.filter)}”` : ''}${showAgent ? ' · ' + esc(x.agent_name) : ''}</div>
    <div class="small">${esc(x.prompt.slice(0, 160))}</div>
    ${x.webhook_url ? `<div class="small" style="margin-top:4px">POST <code>${esc(x.webhook_url)}</code></div>` : ''}
    <div class="row" style="margin-top:8px"><span class="small muted" style="flex:1">${r ? `Last run ${fmtTime(r.started_at)} · <span class="${r.status === 'error' ? 'err-t' : r.status === 'done' ? 'ok-t' : ''}">${r.status}</span>` : 'Never run'}</span>
      <button class="btn sm" data-runau="${x.id}">Run now</button><button class="btn sm" data-edau="${x.id}">Edit</button><button class="ib" data-delau="${x.id}">${I.x}</button></div></div>`;
}
function bindAutoCards(root) {
  $$('[data-en]', root).forEach((b) => (b.onchange = () => patch('/automations/' + b.dataset.en, { enabled: b.checked ? 1 : 0 })));
  $$('[data-runau]', root).forEach((b) => (b.onclick = async () => { await post(`/automations/${b.dataset.runau}/run`); toast('Started'); }));
  $$('[data-delau]', root).forEach((b) => (b.onclick = async () => { if (await confirmBox('Delete this automation?', 'Delete')) { await del('/automations/' + b.dataset.delau); route(); } }));
  $$('[data-edau]', root).forEach((b) => (b.onclick = async () => { const all = await api('/automations'); editAutomation(all.find((x) => x.id === +b.dataset.edau)); }));
}
async function editAutomation(x) {
  if (!S.agents.length) await loadAgents();
  const r = await formModal(x.id ? 'Edit automation' : 'New automation', [
    ...(x.agent_id ? [] : [{ name: 'agent_id', label: 'Agent', type: 'select', options: S.agents.map((a) => [a.id, `${a.name} — ${a.role || ''}`]) }]),
    { name: 'name', label: 'Name', value: x.name, required: true, placeholder: 'Weekly business summary' },
    { name: 'trigger', label: 'When', type: 'select', value: x.trigger || 'cron', options: Object.entries(TRIG) },
    { name: 'cron', label: 'Schedule (cron: min hour day month weekday)', value: x.cron || '0 9 * * 1', help: '“0 9 * * 1” = Mondays 9:00 · “0 8 * * 1-5” = weekdays 8:00 (server time)' },
    { name: 'filter', label: 'Only if it contains (optional)', value: x.filter },
    { name: 'prompt', label: 'What should the agent do?', type: 'textarea', value: x.prompt, rows: 4 },
  ]);
  if (!r) return;
  if (!r.prompt) return toast('Tell the agent what to do');
  if (x.id) await patch('/automations/' + x.id, r); else await post('/automations', { ...r, agent_id: x.agent_id || r.agent_id });
  toast('Saved'); route();
}
