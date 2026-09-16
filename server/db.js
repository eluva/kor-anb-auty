'use strict';
/**
 * Хранилище магазина.
 *
 * Один и тот же код работает в двух режимах:
 *   • локально — файл SQLite data/shop.db;
 *   • на сервере — база Turso (адрес в KB_DB_URL, токен в KB_DB_TOKEN).
 *
 * Зачем Turso: на бесплатном Render диск стирается при каждом перезапуске.
 * Всё, что должно пережить перезапуск — товары, заказы, настройки, фото, —
 * хранится в базе, а не в файлах сервера.
 *
 * Все функции асинхронные: запрос к Turso идёт по сети.
 */
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { createClient } = require('@libsql/client');
const config = require('./config');

const DATA_DIR = config.dataDir;
const isRemote = Boolean(config.dbUrl) && !config.dbUrl.startsWith('file:');

function resolveUrl() {
  if (!config.dbUrl) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    return pathToFileURL(path.join(DATA_DIR, 'shop.db')).href;
  }
  /* libsql:// по умолчанию держит постоянное WebSocket-соединение. На сервере,
     который засыпает и просыпается, такое соединение успевает «протухнуть»,
     и первый запрос после простоя падает. HTTPS — запрос на каждый вызов,
     без состояния: медленнее на миллисекунды, зато без внезапных ошибок. */
  return config.dbUrl.replace(/^libsql:\/\//, 'https://');
}

const url = resolveUrl();
const client = createClient({
  url,
  authToken: config.dbToken || undefined,
  intMode: 'number',          // целые числа — обычные number, а не bigint
});

/** Где лежит база — для журнала запуска, без токена */
const describe = () => (isRemote ? `Turso (${url.replace(/^https:\/\//, '')})` : path.join(DATA_DIR, 'shop.db'));

/* ---------- схема ---------- */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS brands (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL UNIQUE,
  slug        TEXT NOT NULL UNIQUE,
  description TEXT DEFAULT '',
  logo        TEXT DEFAULT '',
  sort_order  INTEGER DEFAULT 100,
  name_lc     TEXT
);

CREATE TABLE IF NOT EXISTS categories (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL UNIQUE,
  slug        TEXT NOT NULL UNIQUE,
  description TEXT DEFAULT '',
  icon        TEXT DEFAULT '',
  sort_order  INTEGER DEFAULT 100,
  name_lc     TEXT
);

CREATE TABLE IF NOT EXISTS products (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  brand_id    INTEGER REFERENCES brands(id) ON DELETE SET NULL,
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  short_desc  TEXT DEFAULT '',
  description TEXT DEFAULT '',
  ingredients TEXT DEFAULT '',
  how_to_use  TEXT DEFAULT '',
  volume      TEXT DEFAULT '',
  price       INTEGER NOT NULL DEFAULT 0,
  old_price   INTEGER DEFAULT 0,
  stock       INTEGER NOT NULL DEFAULT 0,
  skin_types  TEXT DEFAULT '',
  concerns    TEXT DEFAULT '',
  rating      REAL DEFAULT 5,
  sold_count  INTEGER DEFAULT 0,
  is_active   INTEGER DEFAULT 1,
  is_featured INTEGER DEFAULT 0,
  is_new      INTEGER DEFAULT 0,
  created_at  TEXT DEFAULT (datetime('now')),
  search_text TEXT
);

CREATE TABLE IF NOT EXISTS product_images (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  url        TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS orders (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  code          TEXT NOT NULL UNIQUE,
  customer_name TEXT NOT NULL,
  phone         TEXT NOT NULL,
  telegram      TEXT DEFAULT '',
  delivery      TEXT DEFAULT 'pickup',
  address       TEXT DEFAULT '',
  comment       TEXT DEFAULT '',
  total         INTEGER NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'new',
  created_at    TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS order_items (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id   INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER,
  name       TEXT NOT NULL,
  price      INTEGER NOT NULL,
  qty        INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS admins (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at    TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Фото товаров. Раньше лежали файлами в data/uploads, но на Render файлы
-- стираются при перезапуске. Имя файла уникально и не меняется.
CREATE TABLE IF NOT EXISTS media (
  name       TEXT PRIMARY KEY,
  mime       TEXT NOT NULL,
  size       INTEGER NOT NULL,
  data       BLOB NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_products_cat    ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_brand  ON products(brand_id);
CREATE INDEX IF NOT EXISTS idx_products_active ON products(is_active);
CREATE INDEX IF NOT EXISTS idx_images_product  ON product_images(product_id);
CREATE INDEX IF NOT EXISTS idx_images_url      ON product_images(url);
CREATE INDEX IF NOT EXISTS idx_items_order     ON order_items(order_id);
`;

/* ---------- базовые запросы ---------- */

/* undefined база не принимает, логическое — храним как 0/1 */
const clean = (args) => args.map((a) => {
  if (a === undefined) return null;
  if (typeof a === 'boolean') return a ? 1 : 0;
  return a;
});

/* Строку результата превращаем в обычный объект: по номеру столбца,
   чтобы одноимённые поля из JOIN не перекрывали друг друга */
const toObjects = (rs) => rs.rows.map((row) => {
  const obj = {};
  rs.columns.forEach((col, i) => { obj[col] = row[i]; });
  return obj;
});

async function all(sql, ...args) {
  return toObjects(await client.execute({ sql, args: clean(args) }));
}

async function get(sql, ...args) {
  return (await all(sql, ...args))[0];
}

async function run(sql, ...args) {
  const rs = await client.execute({ sql, args: clean(args) });
  return {
    changes: rs.rowsAffected,
    /* Номер новой записи приходит как bigint — приводим к обычному числу */
    lastInsertRowid: rs.lastInsertRowid == null ? null : Number(rs.lastInsertRowid),
  };
}

/**
 * Пакет команд одной транзакцией: либо выполняются все, либо ни одна.
 * Формат: [[sql, ...аргументы], [sql, ...аргументы], …]
 */
async function batch(statements) {
  const list = statements.filter(Boolean).map(([sql, ...args]) => ({ sql, args: clean(args) }));
  if (!list.length) return [];
  return client.batch(list, 'write');
}

/* Большие пакеты режем на части: у Turso есть предел размера запроса */
async function batchChunked(statements, size = 80) {
  for (let i = 0; i < statements.length; i += size) {
    await batch(statements.slice(i, i + size));
  }
}

/* ---------- поиск ----------
   SQLite, и Turso вместе с ним, приводит к нижнему регистру только латиницу:
   lower('Тонеры') так и остаётся 'Тонеры', и поиск «тонер» ничего не находит.
   Поэтому строку для поиска храним готовой, в нижнем регистре, собранной в JS. */
const lc = (s) => String(s ?? '').toLowerCase();
const searchText = (p) => lc([p.name, p.short_desc, p.description, p.volume].filter(Boolean).join(' '));

/* ---------- миграции ---------- */
async function columnsOf(table) {
  return (await all(`SELECT name FROM pragma_table_info('${table}')`)).map((r) => r.name);
}

async function addColumnIfMissing(table, column, type) {
  if (!(await columnsOf(table)).includes(column)) {
    await client.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }
}

async function migrate() {
  if (!isRemote) {
    /* Для локального файла: журнал WAL и ожидание вместо ошибки «база занята».
       У Turso этим управляет сам сервер. */
    await client.execute('PRAGMA journal_mode = WAL');
    await client.execute('PRAGMA busy_timeout = 5000');
  }

  await client.executeMultiple(SCHEMA);

  /* Базы, созданные до переезда, получают новые столбцы */
  await addColumnIfMissing('products', 'search_text', 'TEXT');
  await addColumnIfMissing('brands', 'name_lc', 'TEXT');
  await addColumnIfMissing('categories', 'name_lc', 'TEXT');

  await backfillSearch();
}

/** Досчитать строки для поиска там, где их нет: после миграции или переноса данных */
async function backfillSearch() {
  const products = await all(
    'SELECT id, name, short_desc, description, volume FROM products WHERE search_text IS NULL');
  await batchChunked(products.map((p) => ['UPDATE products SET search_text = ? WHERE id = ?', searchText(p), p.id]));

  let refs = 0;
  for (const table of ['brands', 'categories']) {
    const rows = await all(`SELECT id, name FROM ${table} WHERE name_lc IS NULL`);
    await batchChunked(rows.map((r) => [`UPDATE ${table} SET name_lc = ? WHERE id = ?`, lc(r.name), r.id]));
    refs += rows.length;
  }
  return products.length + refs;
}

let ready = null;
/** Подготовить базу. Вызывается один раз при запуске; повторные вызовы безопасны. */
function init() {
  ready ||= migrate().catch((e) => { ready = null; throw e; });
  return ready;
}

/* ---------- настройки магазина ---------- */
const DEFAULT_SETTINGS = {
  shop_name: 'Korean Beauty',
  tagline: 'Настоящая корейская косметика прямиком из Кореи',
  phone: '+998 91 301 45 51',
  telegram: 'diankatsoy',
  instagram: 'koreanbeauty.nukus',
  city: 'Нукус, Узбекистан',
  address: 'г. Нукус, Республика Каракалпакстан',
  work_hours: 'Ежедневно, 09:00 – 21:00',
  delivery_city_price: '15000',
  free_delivery_from: '300000',
  hero_note: 'Since 2017',
};

async function setting(key) {
  const row = await get('SELECT value FROM settings WHERE key = ?', key);
  return row ? row.value : (DEFAULT_SETTINGS[key] ?? '');
}

async function allSettings() {
  const out = { ...DEFAULT_SETTINGS };
  for (const r of await all('SELECT key, value FROM settings')) out[r.key] = r.value;
  return out;
}

/**
 * Настройки, которые можно показывать посетителям.
 *
 * Только белый список. Раньше публичный /api/meta отдавал ВСЕ настройки,
 * включая токен Telegram-бота и номер чата продавца: они уходили в браузер
 * каждого посетителя. Белый список надёжнее чёрного — новая секретная
 * настройка не утечёт, даже если про неё забудут.
 * Список совпадает со стандартными настройками: секретов среди них нет.
 */
const PUBLIC_SETTING_KEYS = Object.freeze(Object.keys(DEFAULT_SETTINGS));

async function publicSettings() {
  const all_ = await allSettings();
  return Object.fromEntries(PUBLIC_SETTING_KEYS.map((k) => [k, all_[k]]));
}

async function saveSetting(key, value) {
  await run('INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    key, String(value));
}

/* ---------- фото ---------- */
async function saveMedia(name, mime, buffer) {
  await run('INSERT INTO media(name, mime, size, data) VALUES(?, ?, ?, ?)', name, mime, buffer.length, buffer);
}

async function getMedia(name) {
  const row = await get('SELECT mime, size, data FROM media WHERE name = ?', name);
  return row ? { mime: row.mime, size: row.size, data: Buffer.from(row.data) } : null;
}

/**
 * Удалить фото, на которые больше не ссылается ни один товар.
 * Только старше суток: свежее фото могли загрузить в форму, но ещё не сохранить товар.
 */
async function sweepOrphanMedia() {
  const r = await run(`
    DELETE FROM media
    WHERE created_at < datetime('now', '-1 day')
      AND '/uploads/' || name NOT IN (SELECT url FROM product_images)`);
  return r.changes;
}

async function close() {
  try { client.close(); } catch { /* уже закрыт */ }
}

module.exports = {
  client, init, all, get, run, batch, batchChunked, backfillSearch, columnsOf,
  setting, allSettings, saveSetting, publicSettings, PUBLIC_SETTING_KEYS,
  saveMedia, getMedia, sweepOrphanMedia,
  lc, searchText, close, describe,
  DEFAULT_SETTINGS, DATA_DIR, isRemote,
};
