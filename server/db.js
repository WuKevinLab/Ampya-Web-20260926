// 持久化：SQLite 保存账号、会话、平台设置；每位创作者的业务数据存成一份 JSON 文档（读写都在内存缓存里，修改后写回）
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const DATA_DIR = path.resolve(process.env.DATA_DIR || 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

export const db = new DatabaseSync(path.join(DATA_DIR, 'app.db'));
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA busy_timeout = 5000;
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password TEXT NOT NULL,
    handle TEXT NOT NULL UNIQUE COLLATE NOCASE,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS states (
    user_id INTEGER PRIMARY KEY,
    json TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS refs (
    ref TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    kind TEXT NOT NULL,
    target_id INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

// ---------- 密码 ----------
export function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(pw), salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}
export function verifyPassword(pw, stored) {
  const [, salt, hash] = String(stored).split('$');
  if (!salt || !hash) return false;
  const a = crypto.scryptSync(String(pw), Buffer.from(salt, 'hex'), 64);
  const b = Buffer.from(hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// ---------- 会话 ----------
const SESSION_DAYS = 30;
export function createSession(userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(token, userId, Date.now() + SESSION_DAYS * 864e5);
  return token;
}
export function sessionUser(token) {
  if (!token) return null;
  const row = db.prepare('SELECT user_id, expires_at FROM sessions WHERE token = ?').get(token);
  if (!row || row.expires_at < Date.now()) return null;
  return db.prepare('SELECT * FROM users WHERE id = ?').get(row.user_id) || null;
}
export const deleteSession = (token) => db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
export const deleteUserSessions = (uid) => db.prepare('DELETE FROM sessions WHERE user_id = ?').run(uid);
setInterval(() => db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now()), 3600e3).unref();

// ---------- 用户 ----------
export const userById = (id) => db.prepare('SELECT * FROM users WHERE id = ?').get(id);
export const userByEmail = (email) => db.prepare('SELECT * FROM users WHERE email = ?').get(String(email).trim());
export const userByHandle = (h) => db.prepare('SELECT * FROM users WHERE handle = ?').get(String(h).trim());
export const allUsers = () => db.prepare('SELECT * FROM users ORDER BY id').all();
export function insertUser({ email, password, handle }) {
  const r = db.prepare('INSERT INTO users (email, password, handle, created_at) VALUES (?, ?, ?, ?)').run(String(email).trim().toLowerCase(), hashPassword(password), handle, new Date().toISOString());
  return Number(r.lastInsertRowid);
}
export const setUserPassword = (id, pw) => db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hashPassword(pw), id);
export const setUserHandle = (id, h) => db.prepare('UPDATE users SET handle = ? WHERE id = ?').run(h, id);

// ---------- 创作者业务数据 ----------
const cache = new Map();
export function loadState(uid) {
  if (cache.has(uid)) return cache.get(uid);
  const row = db.prepare('SELECT json FROM states WHERE user_id = ?').get(uid);
  const S = row ? JSON.parse(row.json) : null;
  if (S) cache.set(uid, S);
  return S;
}
export function saveState(uid, S) {
  cache.set(uid, S);
  db.prepare('INSERT INTO states (user_id, json, updated_at) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at')
    .run(uid, JSON.stringify(S), new Date().toISOString());
}

// ---------- 公开引用（订单号、发票号、下载令牌） ----------
export function newRef(uid, kind, targetId) {
  const ref = crypto.randomBytes(12).toString('base64url');
  db.prepare('INSERT INTO refs (ref, user_id, kind, target_id) VALUES (?, ?, ?, ?)').run(ref, uid, kind, targetId);
  return ref;
}
export const getRef = (ref) => db.prepare('SELECT * FROM refs WHERE ref = ?').get(String(ref));

// ---------- 平台设置（环境变量优先） ----------
export const SETTING_KEYS = ['ANTHROPIC_API_KEY', 'ANTHROPIC_MODEL', 'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'STRIPE_PRO_PRICE_ID', 'RESEND_API_KEY', 'MAIL_FROM'];
export function setting(key) {
  if (process.env[key]) return process.env[key];
  return db.prepare('SELECT value FROM settings WHERE key = ?').get(key)?.value || '';
}
export function setSetting(key, value) {
  if (!value) db.prepare('DELETE FROM settings WHERE key = ?').run(key);
  else db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);
}
