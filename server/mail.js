// 发信：配置了 RESEND_API_KEY 就通过 Resend 真实发出，否则只记录（返回 sent: false，界面会如实提示）
import { setting } from './db.js';

export const mailReady = () => !!(setting('RESEND_API_KEY') && setting('MAIL_FROM'));

// fromName 例如 "Max (for Ava Lee)"；replyTo 通常是创作者自己的邮箱
export async function sendMail({ to, subject, text, fromName, replyTo }) {
  if (!mailReady()) return { sent: false, info: 'Email delivery is not configured on this server (RESEND_API_KEY + MAIL_FROM), so the message was logged but not sent.' };
  const fromAddr = setting('MAIL_FROM');
  const from = fromName ? `${fromName.replace(/[<>"]/g, '')} <${fromAddr.replace(/^.*<|>.*$/g, '')}>` : fromAddr;
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${setting('RESEND_API_KEY')}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from, to: [to], subject, text, ...(replyTo ? { reply_to: replyTo } : {}) }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Email failed: ${j.message || r.status}`);
  return { sent: true, id: j.id, info: `Email sent to ${to}` };
}
