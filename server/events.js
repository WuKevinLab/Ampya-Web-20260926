// 实时事件：每位创作者一组 SSE 连接，后台页面靠它刷新聊天、审批和业务数据
const clients = new Map(); // uid -> Set<res>

export function subscribe(uid, res) {
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache, no-transform', connection: 'keep-alive', 'x-accel-buffering': 'no' });
  res.write('retry: 3000\n\n');
  if (!clients.has(uid)) clients.set(uid, new Set());
  clients.get(uid).add(res);
  const ping = setInterval(() => res.write(': ping\n\n'), 25e3);
  res.on('close', () => { clearInterval(ping); clients.get(uid)?.delete(res); });
}

export function emit(uid, event) {
  const set = clients.get(uid);
  if (!set) return;
  const data = `data: ${JSON.stringify({ ...event, creator_id: uid })}\n\n`;
  for (const res of set) res.write(data);
}
