'use strict';
/**
 * Настройки запуска — в одном месте.
 *
 * Значения берутся из переменных окружения или из файла .env в корне проекта
 * (образец — .env.example). На хостинге их обычно задают в панели управления.
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

/* .env читаем встроенными средствами Node — без лишних зависимостей.
   Переменные, уже заданные в окружении, файл не перезаписывает. */
const envFile = path.join(ROOT, '.env');
if (fs.existsSync(envFile) && typeof process.loadEnvFile === 'function') {
  try { process.loadEnvFile(envFile); }
  catch (e) { console.error(`[config] не удалось прочитать .env: ${e.message}`); }
}

const env = process.env;
const isProd = env.NODE_ENV === 'production';

/**
 * Кому доверять заголовки X-Forwarded-*.
 *
 * Это вопрос безопасности, а не удобства. Если доверять всем, любой посетитель
 * подставит себе чужой IP и обойдёт ограничение попыток входа.
 *
 *   loopback (по умолчанию) — только прокси на этой же машине: nginx,
 *                             Caddy, cloudflared. Подходит для VPS.
 *   cloudflare               — внутренняя сеть хостинга и узлы Cloudflare.
 *                             Для Render: там перед магазином стоят сразу
 *                             Cloudflare и балансировщик (подробно в proxy.js).
 *   1                        — ровно один прокси перед приложением: Railway, Fly.
 *   false                    — прокси нет, приложение смотрит в интернет напрямую.
 */
function parseTrustProxy(raw) {
  const value = String(raw ?? '').trim();
  if (value === '') return 'loopback';
  if (value === 'cloudflare' || value === 'render') return require('./proxy').trustCloudflare;
  if (value === 'true') {
    console.warn('[config] KB_TRUST_PROXY=true небезопасно: заголовкам поверят от любого клиента. На Render используйте cloudflare, на VPS — loopback.');
    return true;
  }
  if (value === 'false') return false;
  if (/^\d+$/.test(value)) return Number(value);
  return value;                                   // loopback, uniquelocal, список адресов
}

const config = {
  root: ROOT,
  isProd,
  port: Number(env.PORT) || 3000,
  host: env.HOST || '0.0.0.0',

  /* Папка с базой и фотографиями. На хостинге ОБЯЗАТЕЛЬНО укажите постоянный
     диск (volume): иначе при каждом обновлении все заказы и товары пропадут. */
  dataDir: path.resolve(env.KB_DATA_DIR || path.join(ROOT, 'data')),

  /* База данных. Пусто — локальный файл data/shop.db.
     На Render — адрес базы Turso (libsql://…) и токен доступа. */
  dbUrl: (env.KB_DB_URL || '').trim(),
  dbToken: (env.KB_DB_TOKEN || '').trim(),

  /* Ключ подписи сессий админки. На хостинге без постоянного диска (Render)
     задаётся обязательно: иначе при каждом перезапуске он создаётся заново
     и администратора выкидывает из панели. */
  secret: (env.KB_SECRET || '').trim(),

  /* Публичный адрес магазина — для карты сайта, robots.txt и ссылок в соцсетях */
  publicUrl: (env.KB_PUBLIC_URL || '').replace(/\/+$/, ''),

  trustProxy: parseTrustProxy(env.KB_TRUST_PROXY),
  trustProxyLabel: String(env.KB_TRUST_PROXY || '').trim() || 'loopback',

  backupDir: path.resolve(env.KB_BACKUP_DIR || path.join(env.KB_DATA_DIR || path.join(ROOT, 'data'), 'backups')),
  backupKeep: Math.max(Number(env.KB_BACKUP_KEEP) || 14, 1),
};

module.exports = config;
