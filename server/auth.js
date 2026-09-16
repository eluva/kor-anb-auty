'use strict';
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const config = require('./config');
const db = require('./db');

const SESSION_COOKIE = 'kb_admin';
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14; // 14 дней
const SECRET_SETTING = 'session_secret';

/* ---------- ключ подписи сессий ----------
   Откуда берётся, по порядку:
   1. KB_SECRET из окружения — основной способ на сервере;
   2. локально — файл data/.session-secret;
   3. на удалённой базе без KB_SECRET — сохраняется в самой базе.
      Без этого на Render ключ создавался бы заново при каждом перезапуске,
      и администратора выкидывало бы из панели. */
let SECRET = config.secret || null;

async function initSecret() {
  if (SECRET) return 'env';

  if (!db.isRemote) {
    const file = path.join(db.DATA_DIR, '.session-secret');
    try {
      SECRET = fs.readFileSync(file, 'utf8').trim();
    } catch {
      SECRET = crypto.randomBytes(48).toString('hex');
      fs.writeFileSync(file, SECRET, { mode: 0o600 });
    }
    return 'file';
  }

  const stored = await db.get('SELECT value FROM settings WHERE key = ?', SECRET_SETTING);
  if (stored?.value) {
    SECRET = stored.value;
  } else {
    SECRET = crypto.randomBytes(48).toString('hex');
    /* INSERT OR IGNORE: если два экземпляра стартуют одновременно, побеждает первый */
    await db.run('INSERT OR IGNORE INTO settings(key, value) VALUES(?, ?)', SECRET_SETTING, SECRET);
    SECRET = (await db.get('SELECT value FROM settings WHERE key = ?', SECRET_SETTING)).value;
  }
  return 'database';
}

const requireSecret = () => {
  if (!SECRET) throw new Error('Ключ сессий не загружен: вызовите initSecret() при запуске');
  return SECRET;
};

/* ---------- пароли: scrypt ---------- */
function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(String(password), salt, 64);
  return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`;
}

function verifyPassword(password, stored) {
  try {
    const [scheme, saltHex, keyHex] = String(stored).split('$');
    if (scheme !== 'scrypt') return false;
    const key = crypto.scryptSync(String(password), Buffer.from(saltHex, 'hex'), 64);
    const expected = Buffer.from(keyHex, 'hex');
    return key.length === expected.length && crypto.timingSafeEqual(key, expected);
  } catch { return false; }
}

/* ---------- сессии: HMAC-подписанный токен в httpOnly cookie ---------- */
function signSession(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', requireSecret()).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function readSession(token) {
  if (!token || typeof token !== 'string') return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expected = crypto.createHmac('sha256', requireSecret()).update(body).digest('base64url');
  const a = Buffer.from(sig); const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!data.exp || Date.now() > data.exp) return null;
    return data;
  } catch { return null; }
}

function parseCookies(req) {
  const out = {};
  const raw = req.headers.cookie;
  if (!raw) return out;
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    try { out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); }
    catch { /* битая cookie — пропускаем, а не роняем запрос */ }
  }
  return out;
}

/* Только req.secure: Express учитывает X-Forwarded-Proto лишь от доверенного
   прокси (trust proxy). Раньше заголовок читался напрямую — его мог подставить кто угодно. */
const isSecure = (req) => req.secure;

function issueSession(req, res, admin) {
  const token = signSession({ id: admin.id, u: admin.username, exp: Date.now() + SESSION_TTL_MS });
  /* Secure — только на HTTPS: иначе на localhost по http войти будет нельзя */
  const secure = isSecure(req) ? '; Secure' : '';
  res.setHeader('Set-Cookie',
    `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax${secure}; Max-Age=${SESSION_TTL_MS / 1000}`);
}

function clearSession(res) {
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

async function currentAdmin(req) {
  const s = readSession(parseCookies(req)[SESSION_COOKIE]);
  if (!s) return null;
  return (await db.get('SELECT id, username FROM admins WHERE id = ?', s.id)) || null;
}

/* Middleware для /api/admin/* */
async function requireAdmin(req, res, next) {
  const admin = await currentAdmin(req);
  if (!admin) return res.status(401).json({ error: 'Требуется вход в админ-панель' });
  req.admin = admin;
  next();
}

/* ---------- защита от подбора пароля ----------
   После 5 неудачных попыток подряд — пауза, растущая с каждой следующей.
   Счётчики в памяти: перезапуск их сбрасывает. На Render это значит, что
   после засыпания счёт начинается заново, — но во время атаки запросы идут
   непрерывно, сервер не засыпает, и защита держит. */
const MAX_ATTEMPTS = 5;
const BASE_LOCK_MS = 60 * 1000;
const attempts = new Map(); // ip -> { count, until }

/* req.ip учитывает X-Forwarded-For только от доверенного прокси.
   Раньше здесь читался сам заголовок — атакующий менял его на каждой
   попытке и перебирал пароль без ограничений. */
const clientIp = (req) => req.ip || req.socket?.remoteAddress || 'unknown';

/** Сколько секунд осталось ждать этому адресу (0 — можно пробовать). */
function loginLockedFor(req) {
  const rec = attempts.get(clientIp(req));
  if (!rec?.until) return 0;
  const left = rec.until - Date.now();
  return left > 0 ? Math.ceil(left / 1000) : 0;
}

function registerFailedLogin(req) {
  const ip = clientIp(req);
  const rec = attempts.get(ip) || { count: 0, until: 0 };
  rec.count += 1;
  if (rec.count >= MAX_ATTEMPTS) {
    const over = rec.count - MAX_ATTEMPTS;                  // 1 мин, 2, 4, 8… не больше часа
    rec.until = Date.now() + Math.min(BASE_LOCK_MS * 2 ** over, 60 * 60 * 1000);
  }
  attempts.set(ip, rec);
}

function resetLoginAttempts(req) { attempts.delete(clientIp(req)); }

setInterval(() => {
  const now = Date.now();
  for (const [ip, rec] of attempts) {
    if (!rec.until || rec.until < now - 60 * 60 * 1000) attempts.delete(ip);
  }
}, 60 * 60 * 1000).unref();

/* ---------- первый запуск ----------
   Пароль случайный и печатается один раз. Раньше был фиксированный korean2017,
   опубликованный в README: на свежем сервере в админку мог войти кто угодно. */
function randomPassword(len = 16) {
  const abc = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // без 0/O и 1/l/I
  return Array.from(crypto.randomBytes(len), (b) => abc[b % abc.length]).join('');
}

async function ensureDefaultAdmin() {
  const row = await db.get('SELECT COUNT(*) AS n FROM admins');
  if (row.n > 0) return null;
  const username = process.env.KB_ADMIN_USER || 'admin';
  const password = process.env.KB_ADMIN_PASS || randomPassword();
  await db.run('INSERT INTO admins(username, password_hash) VALUES(?, ?)', username, hashPassword(password));
  return { username, password, generated: !process.env.KB_ADMIN_PASS };
}

module.exports = {
  initSecret, SECRET_SETTING,
  hashPassword, verifyPassword, randomPassword, issueSession, clearSession,
  currentAdmin, requireAdmin, ensureDefaultAdmin, parseCookies,
  isSecure, loginLockedFor, registerFailedLogin, resetLoginAttempts,
};
