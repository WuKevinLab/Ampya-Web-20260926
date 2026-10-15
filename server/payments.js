// Stripe：Connect（创作者自己的收款账户）、Checkout（商品/预约/品牌发票/代理钱包）、订阅升级、Webhook 验签
// 没配 STRIPE_SECRET_KEY 时整个平台处于测试模式：结账直接记为已付，不扣任何卡。
import crypto from 'node:crypto';
import { setting } from './db.js';

export const stripeReady = () => !!setting('STRIPE_SECRET_KEY');

// Stripe 要求 application/x-www-form-urlencoded，嵌套对象展开成 a[b][c]=v
function form(obj, prefix = '', out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === 'object') form(v, key, out);
    else out.append(key, String(v));
  }
  return out;
}

export async function stripe(method, path, params) {
  const key = setting('STRIPE_SECRET_KEY');
  if (!key) throw Object.assign(new Error('Stripe is not configured on this server'), { status: 400 });
  const url = `https://api.stripe.com/v1${path}`;
  const r = await fetch(method === 'GET' && params ? `${url}?${form(params)}` : url, {
    method,
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/x-www-form-urlencoded' },
    body: method === 'GET' || !params ? undefined : form(params),
  });
  const j = await r.json();
  if (!r.ok) throw Object.assign(new Error(j.error?.message || 'Stripe request failed'), { status: 400 });
  return j;
}

// Webhook 验签：Stripe-Signature: t=...,v1=...
export function verifyWebhook(raw, header) {
  const secret = setting('STRIPE_WEBHOOK_SECRET');
  if (!secret) throw new Error('STRIPE_WEBHOOK_SECRET is not set');
  const parts = Object.fromEntries(String(header || '').split(',').map((p) => p.split('=')));
  const t = parts.t, sigs = String(header || '').split(',').filter((p) => p.startsWith('v1=')).map((p) => p.slice(3));
  if (!t || !sigs.length) throw new Error('Bad signature header');
  if (Math.abs(Date.now() / 1000 - Number(t)) > 300) throw new Error('Signature too old');
  const expected = crypto.createHmac('sha256', secret).update(`${t}.${raw}`).digest('hex');
  const ok = sigs.some((s) => s.length === expected.length && crypto.timingSafeEqual(Buffer.from(s), Buffer.from(expected)));
  if (!ok) throw new Error('Signature mismatch');
  return JSON.parse(raw);
}

// 一次性付款的 Checkout；destination 为创作者 Connect 账户时钱直接进创作者账户，平台抽 fee
export async function checkout({ title, amountCents, email, successUrl, cancelUrl, metadata, destination, feeCents, recurring }) {
  const lineItem = { quantity: 1, price_data: { currency: 'usd', unit_amount: amountCents, product_data: { name: title }, ...(recurring ? { recurring: { interval: recurring } } : {}) } };
  const params = {
    mode: recurring ? 'subscription' : 'payment',
    line_items: { 0: lineItem },
    success_url: successUrl, cancel_url: cancelUrl,
    metadata,
    ...(email ? { customer_email: email } : {}),
  };
  if (recurring) {
    params.subscription_data = { metadata, ...(destination ? { transfer_data: { destination }, ...(feeCents ? { application_fee_percent: Math.round((feeCents / amountCents) * 100) } : {}) } : {}) };
  } else {
    params.payment_intent_data = { metadata, ...(destination ? { transfer_data: { destination }, ...(feeCents ? { application_fee_amount: feeCents } : {}) } : {}) };
  }
  const s = await stripe('POST', '/checkout/sessions', params);
  return s.url;
}
