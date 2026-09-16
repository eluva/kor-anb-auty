'use strict';
const express = require('express');
const multer = require('multer');
const path = require('node:path');
const crypto = require('node:crypto');

const { asyncSafe } = require('../http');
const config = require('../config');
const db = require('../db');
const auth = require('../auth');
const notify = require('../notify');
const { uploadLimiter } = require('../ratelimit');
const { withImages, PRODUCT_FIELDS, FROM_PRODUCTS } = require('./api');

const router = asyncSafe(express.Router());

/* ---------- загрузка фото ----------
   Фото хранятся в базе, а не файлами: на бесплатном Render диск стирается
   при каждом перезапуске. Браузер перед отправкой уменьшает снимок до 1400 px,
   поэтому 5 МБ на файл — с большим запасом. */
const MAX_FILE = 5 * 1024 * 1024;
const ALLOWED = new Map([
  ['.jpg', 'image/jpeg'], ['.jpeg', 'image/jpeg'], ['.png', 'image/png'],
  ['.webp', 'image/webp'], ['.gif', 'image/gif'], ['.avif', 'image/avif'],
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE, files: 8 },
  fileFilter: (req, file, cb) => {
    const ok = ALLOWED.has(path.extname(file.originalname).toLowerCase()) && /^image\//.test(file.mimetype);
    cb(ok ? null : new Error('Разрешены только изображения: jpg, png, webp, gif, avif'), ok);
  },
});

/* Проверяем, что внутри действительно картинка, а не файл с чужим расширением */
function sniffImage(buf) {
  if (buf.length < 12) return null;
  if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return 'image/jpeg';
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]))) return 'image/png';
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  if (buf.toString('ascii', 0, 3) === 'GIF') return 'image/gif';
  if (buf.toString('ascii', 4, 12) === 'ftypavif') return 'image/avif';
  return null;
}

/* ---------- утилиты ---------- */
function slugify(text, fallback = 'item') {
  const map = {
    а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y',
    к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f',
    х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
    ў: 'u', қ: 'q', ғ: 'g', ҳ: 'h',
  };
  const s = String(text || '').toLowerCase().trim()
    .split('').map((ch) => (map[ch] !== undefined ? map[ch] : ch)).join('')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return s || fallback;
}

/* Таблица подставляется в SQL — только из этого списка */
const SLUG_TABLES = new Set(['products', 'categories', 'brands']);

async function uniqueSlug(table, base, ignoreId = 0) {
  if (!SLUG_TABLES.has(table)) throw new Error('недопустимая таблица');
  let slug = base; let n = 2;
  while (await db.get(`SELECT id FROM ${table} WHERE slug = ? AND id <> ?`, slug, ignoreId)) slug = `${base}-${n++}`;
  return slug;
}

const plural = (n, one, few, many) => {
  const a = Math.abs(n) % 100; const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
};

const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const bool = (v) => (v === true || v === 1 || v === '1' || v === 'true' ? 1 : 0);
const list = (v) => (Array.isArray(v) ? v : String(v || '').split(','))
  .map((x) => String(x).trim()).filter(Boolean).join(',');

/* ---------- сессия ---------- */
router.post('/login', async (req, res) => {
  const wait = auth.loginLockedFor(req);
  if (wait) {
    return res.status(429).json({
      error: `Слишком много попыток входа. Попробуйте через ${wait} ${plural(wait, 'секунду', 'секунды', 'секунд')}.`,
    });
  }

  const username = String(req.body?.username || '').trim();
  const password = String(req.body?.password || '');
  const admin = await db.get('SELECT * FROM admins WHERE username = ?', username);
  if (!admin || !auth.verifyPassword(password, admin.password_hash)) {
    auth.registerFailedLogin(req);
    return res.status(401).json({ error: 'Неверный логин или пароль' });
  }

  auth.resetLoginAttempts(req);
  auth.issueSession(req, res, admin);
  res.json({ ok: true, admin: { id: admin.id, username: admin.username } });
});

router.post('/logout', (req, res) => { auth.clearSession(res); res.json({ ok: true }); });

router.get('/me', async (req, res) => {
  const admin = await auth.currentAdmin(req);
  if (!admin) return res.status(401).json({ error: 'Не авторизован' });
  res.json({ admin });
});

/* Всё ниже требует авторизации */
router.use(auth.requireAdmin);

router.post('/password', async (req, res) => {
  const current = String(req.body?.current || '');
  const next = String(req.body?.next || '');
  if (next.length < 6) return res.status(400).json({ error: 'Новый пароль — минимум 6 символов' });
  const admin = await db.get('SELECT * FROM admins WHERE id = ?', req.admin.id);
  if (!auth.verifyPassword(current, admin.password_hash)) {
    return res.status(400).json({ error: 'Текущий пароль указан неверно' });
  }
  await db.run('UPDATE admins SET password_hash = ? WHERE id = ?', auth.hashPassword(next), admin.id);
  res.json({ ok: true });
});

/* ---------- проверка прокси ----------
   Каким адресом сервер видит того, кто открыл запрос. После выкатки сверяют
   с «мой IP» в любом сервисе: совпало — лимиты считают покупательниц по отдельности. */
router.get('/diagnostics/ip', (req, res) => {
  const { isPrivate, isCloudflare } = require('../proxy');
  res.json({
    ip: req.ip,
    chain: req.ips,
    socket: req.socket?.remoteAddress,
    forwardedFor: req.get('x-forwarded-for') || null,
    cfConnectingIp: req.get('cf-connecting-ip') || null,
    trustProxy: config.trustProxyLabel,
    looksLikeProxy: isPrivate(req.ip) || isCloudflare(req.ip),
  });
});

/* ---------- дашборд ---------- */
router.get('/stats', async (req, res) => {
  /* Все счётчики одним запросом вместо девяти — на Turso это девять обращений по сети */
  const [counts, recentOrders, topProducts] = await Promise.all([
    db.get(`SELECT
      (SELECT COUNT(*) FROM products)                                   AS products,
      (SELECT COUNT(*) FROM products WHERE is_active = 1)               AS active,
      (SELECT COUNT(*) FROM products WHERE stock <= 0)                  AS outOfStock,
      (SELECT COUNT(*) FROM products WHERE stock > 0 AND stock <= 3)    AS lowStock,
      (SELECT COUNT(*) FROM brands)                                     AS brands,
      (SELECT COUNT(*) FROM categories)                                 AS categories,
      (SELECT COUNT(*) FROM orders)                                     AS orders,
      (SELECT COUNT(*) FROM orders WHERE status = 'new')                AS newOrders,
      (SELECT COALESCE(SUM(total), 0) FROM orders WHERE status IN ('done', 'shipped')) AS revenue`),
    db.all('SELECT * FROM orders ORDER BY id DESC LIMIT 5'),
    db.all(`SELECT p.id, p.name, p.sold_count, p.price, p.stock,
                   (SELECT url FROM product_images WHERE product_id = p.id ORDER BY sort_order, id LIMIT 1) AS image
            FROM products p ORDER BY p.sold_count DESC, p.id DESC LIMIT 5`),
  ]);
  res.json({ ...counts, recentOrders, topProducts });
});

/* ---------- товары ---------- */
router.get('/products', async (req, res) => {
  const q = req.query;
  const where = []; const params = [];
  if (q.search) {
    where.push('(p.search_text LIKE ? OR b.name_lc LIKE ? OR c.name_lc LIKE ?)');
    const s = `%${db.lc(String(q.search).trim())}%`;
    params.push(s, s, s);
  }
  if (q.category) { where.push('c.slug = ?'); params.push(q.category); }
  if (q.brand)    { where.push('b.slug = ?'); params.push(q.brand); }
  if (q.status === 'hidden')   where.push('p.is_active = 0');
  if (q.status === 'active')   where.push('p.is_active = 1');
  if (q.status === 'outstock') where.push('p.stock <= 0');

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const limit = Math.min(Math.max(num(q.limit, 20), 1), 100);
  const page = Math.max(num(q.page, 1), 1);
  const [countRow, rows] = await Promise.all([
    db.get(`SELECT COUNT(*) AS n ${FROM_PRODUCTS} ${whereSql}`, ...params),
    db.all(`SELECT ${PRODUCT_FIELDS} ${FROM_PRODUCTS} ${whereSql}
            ORDER BY p.id DESC LIMIT ? OFFSET ?`, ...params, limit, (page - 1) * limit),
  ]);
  res.json({ items: await withImages(rows), total: countRow.n, page, pages: Math.ceil(countRow.n / limit) || 1 });
});

router.get('/products/:id', async (req, res) => {
  const row = await db.get(`SELECT ${PRODUCT_FIELDS} ${FROM_PRODUCTS} WHERE p.id = ?`, num(req.params.id));
  if (!row) return res.status(404).json({ error: 'Товар не найден' });
  res.json({ product: (await withImages([row]))[0] });
});

async function productFields(body, id = 0) {
  const name = String(body.name || '').trim();
  if (!name) throw Object.assign(new Error('Укажите название товара'), { status: 400 });

  const fields = {
    name,
    slug: await uniqueSlug('products', slugify(body.slug || name, 'product'), id),
    brand_id: body.brand_id ? num(body.brand_id) : null,
    category_id: body.category_id ? num(body.category_id) : null,
    short_desc: String(body.short_desc || '').trim(),
    description: String(body.description || '').trim(),
    ingredients: String(body.ingredients || '').trim(),
    how_to_use: String(body.how_to_use || '').trim(),
    volume: String(body.volume || '').trim(),
    price: Math.max(num(body.price), 0),
    old_price: Math.max(num(body.old_price), 0),
    stock: Math.max(num(body.stock), 0),
    skin_types: list(body.skin_types),
    concerns: list(body.concerns),
    rating: Math.min(Math.max(num(body.rating, 5), 0), 5),
    is_active: bool(body.is_active),
    is_featured: bool(body.is_featured),
    is_new: bool(body.is_new),
  };
  fields.search_text = db.searchText(fields);
  return fields;
}

const imageList = (images) => (Array.isArray(images) ? images : [])
  .map((u) => String(u || '').trim()).filter(Boolean).slice(0, 8);

router.post('/products', async (req, res) => {
  let fields;
  try { fields = await productFields(req.body || {}); }
  catch (e) { return res.status(e.status || 400).json({ error: e.message }); }

  const keys = Object.keys(fields);
  /* Товар и его фото — одним пакетом. Фото привязываются к товару
     по уникальному slug, без промежуточного запроса за id. */
  await db.batch([
    [`INSERT INTO products(${keys.join(',')}) VALUES(${keys.map(() => '?').join(',')})`, ...keys.map((k) => fields[k])],
    ...imageList(req.body?.images).map((url, i) => [
      'INSERT INTO product_images(product_id, url, sort_order) VALUES((SELECT id FROM products WHERE slug = ?), ?, ?)',
      fields.slug, url, i,
    ]),
  ]);
  const created = await db.get('SELECT id FROM products WHERE slug = ?', fields.slug);
  res.json({ ok: true, id: created.id });
});

router.put('/products/:id', async (req, res) => {
  const id = num(req.params.id);
  if (!(await db.get('SELECT id FROM products WHERE id = ?', id))) {
    return res.status(404).json({ error: 'Товар не найден' });
  }
  let fields;
  try { fields = await productFields(req.body || {}, id); }
  catch (e) { return res.status(e.status || 400).json({ error: e.message }); }

  const keys = Object.keys(fields);
  const statements = [
    [`UPDATE products SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, ...keys.map((k) => fields[k]), id],
  ];
  /* Фото меняем, только если форма их прислала: быстрые правки без фото не стирают снимки */
  if (Array.isArray(req.body?.images)) {
    statements.push(['DELETE FROM product_images WHERE product_id = ?', id]);
    imageList(req.body.images).forEach((url, i) => {
      statements.push(['INSERT INTO product_images(product_id, url, sort_order) VALUES(?, ?, ?)', id, url, i]);
    });
  }
  await db.batch(statements);
  await db.sweepOrphanMedia();
  res.json({ ok: true, id });
});

router.delete('/products/:id', async (req, res) => {
  const id = num(req.params.id);
  /* Связанные записи удаляем явно: на удалённой базе каскадное удаление
     по внешнему ключу может быть не включено */
  await db.batch([
    ['DELETE FROM product_images WHERE product_id = ?', id],
    ['DELETE FROM products WHERE id = ?', id],
  ]);
  await db.sweepOrphanMedia();
  res.json({ ok: true });
});

router.patch('/products/:id/toggle', async (req, res) => {
  const id = num(req.params.id);
  const p = await db.get('SELECT is_active FROM products WHERE id = ?', id);
  if (!p) return res.status(404).json({ error: 'Товар не найден' });
  await db.run('UPDATE products SET is_active = ? WHERE id = ?', p.is_active ? 0 : 1, id);
  res.json({ ok: true, is_active: !p.is_active });
});

router.patch('/products/:id/stock', async (req, res) => {
  const id = num(req.params.id);
  await db.run('UPDATE products SET stock = ? WHERE id = ?', Math.max(num(req.body?.stock), 0), id);
  res.json({ ok: true });
});

/* ---------- загрузка фото ---------- */
const UPLOAD_ERRORS = {
  LIMIT_FILE_SIZE:  'Файл слишком большой — максимум 5 МБ',
  LIMIT_FILE_COUNT: 'Можно загрузить не больше 8 фотографий за раз',
};

router.post('/upload', uploadLimiter, (req, res, next) => {
  upload.array('images', 8)(req, res, async (err) => {
    try {
      if (err) return res.status(400).json({ error: UPLOAD_ERRORS[err.code] || err.message });
      const files = req.files || [];
      if (!files.length) return res.status(400).json({ error: 'Файлы не получены' });

      const urls = [];
      for (const f of files) {
        const mime = sniffImage(f.buffer);
        if (!mime) return res.status(400).json({ error: `«${f.originalname}» — не изображение` });
        const ext = [...ALLOWED].find(([, m]) => m === mime)[0];
        const name = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`;
        await db.saveMedia(name, mime, f.buffer);
        urls.push(`/uploads/${name}`);
      }
      res.json({ ok: true, urls });
    } catch (e) {
      next(e);
    }
  });
});

/* ---------- разделы и бренды ---------- */
function referenceRoutes(table, { label, extraField }) {
  const one = label.one;

  router.get(`/${table}`, async (req, res) => {
    const column = table === 'categories' ? 'category_id' : 'brand_id';
    const [rows, counts] = await Promise.all([
      db.all(`SELECT * FROM ${table} ORDER BY sort_order, name`),
      db.all(`SELECT ${column} AS ref, COUNT(*) AS n FROM products GROUP BY ${column}`),
    ]);
    const byRef = new Map(counts.map((c) => [c.ref, c.n]));
    res.json({ items: rows.map((r) => ({ ...r, count: byRef.get(r.id) || 0 })) });
  });

  router.post(`/${table}`, async (req, res) => {
    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ error: `Укажите название ${label.gen}` });
    if (await db.get(`SELECT id FROM ${table} WHERE name = ?`, name)) {
      return res.status(400).json({ error: `Такой ${one} уже существует` });
    }
    const r = await db.run(
      `INSERT INTO ${table}(name, name_lc, slug, description, ${extraField.column}, sort_order) VALUES(?, ?, ?, ?, ?, ?)`,
      name, db.lc(name), await uniqueSlug(table, slugify(req.body?.slug || name, table)),
      String(req.body?.description || ''), String(req.body?.[extraField.column] || extraField.fallback),
      num(req.body?.sort_order, 100));
    res.json({ ok: true, id: r.lastInsertRowid });
  });

  router.put(`/${table}/:id`, async (req, res) => {
    const id = num(req.params.id);
    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ error: `Укажите название ${label.gen}` });
    await db.run(
      `UPDATE ${table} SET name = ?, name_lc = ?, slug = ?, description = ?, ${extraField.column} = ?, sort_order = ? WHERE id = ?`,
      name, db.lc(name), await uniqueSlug(table, slugify(req.body?.slug || name, table), id),
      String(req.body?.description || ''), String(req.body?.[extraField.column] || extraField.fallback),
      num(req.body?.sort_order, 100), id);
    res.json({ ok: true });
  });

  router.delete(`/${table}/:id`, async (req, res) => {
    const id = num(req.params.id);
    const column = table === 'categories' ? 'category_id' : 'brand_id';
    /* Товары остаются, но теряют привязку — явно, без надежды на ON DELETE SET NULL */
    await db.batch([
      [`UPDATE products SET ${column} = NULL WHERE ${column} = ?`, id],
      [`DELETE FROM ${table} WHERE id = ?`, id],
    ]);
    res.json({ ok: true });
  });
}

referenceRoutes('categories', {
  label: { one: 'раздел', gen: 'раздела' },
  extraField: { column: 'icon', fallback: '✨' },
});
referenceRoutes('brands', {
  label: { one: 'бренд', gen: 'бренда' },
  extraField: { column: 'logo', fallback: '' },
});

/* ---------- заказы ---------- */
const STATUSES = ['new', 'confirmed', 'shipped', 'done', 'canceled'];

router.get('/orders', async (req, res) => {
  const where = []; const params = [];
  if (STATUSES.includes(req.query.status)) { where.push('status = ?'); params.push(req.query.status); }
  if (req.query.search) {
    where.push('(code LIKE ? OR customer_name LIKE ? OR phone LIKE ?)');
    const s = `%${req.query.search}%`; params.push(s, s, s);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const orders = await db.all(`SELECT * FROM orders ${whereSql} ORDER BY id DESC LIMIT 200`, ...params);

  /* Состав всех заказов — одним запросом. Раньше был отдельный запрос
     на каждый заказ: при 200 заказах — 200 обращений к Turso по сети. */
  if (orders.length) {
    const ids = orders.map((o) => o.id);
    const items = await db.all(
      `SELECT * FROM order_items WHERE order_id IN (${ids.map(() => '?').join(',')}) ORDER BY id`, ...ids);
    const byOrder = new Map(ids.map((id) => [id, []]));
    for (const it of items) byOrder.get(it.order_id)?.push(it);
    for (const o of orders) o.items = byOrder.get(o.id) || [];
  }
  res.json({ items: orders });
});

router.patch('/orders/:id', async (req, res) => {
  const status = String(req.body?.status || '');
  if (!STATUSES.includes(status)) return res.status(400).json({ error: 'Некорректный статус' });
  await db.run('UPDATE orders SET status = ? WHERE id = ?', status, num(req.params.id));
  res.json({ ok: true });
});

router.delete('/orders/:id', async (req, res) => {
  const id = num(req.params.id);
  await db.batch([
    ['DELETE FROM order_items WHERE order_id = ?', id],
    ['DELETE FROM orders WHERE id = ?', id],
  ]);
  res.json({ ok: true });
});

/* ---------- уведомления в Telegram ---------- */
router.get('/telegram', async (req, res) => {
  const s = await db.allSettings();
  res.json({
    configured: await notify.isConfigured(),
    hasToken: Boolean(String(s.telegram_bot_token || '').trim()),   // сам токен наружу не отдаём
    chatId: String(s.telegram_chat_id || ''),
    botUsername: String(s.telegram_bot_username || ''),
  });
});

router.post('/telegram/check', async (req, res) => {
  const token = String(req.body?.token || '').trim() || await db.setting('telegram_bot_token');
  if (!token) return res.status(400).json({ error: 'Укажите токен бота' });
  try {
    const info = await notify.getBotInfo(token);
    await db.saveSetting('telegram_bot_token', token);
    await db.saveSetting('telegram_bot_username', info.username);
    res.json({ ok: true, ...info });
  } catch (e) {
    res.status(400).json({ error: `Токен не подошёл: ${e.message}` });
  }
});

router.post('/telegram/detect', async (req, res) => {
  const token = await db.setting('telegram_bot_token');
  if (!token) return res.status(400).json({ error: 'Сначала сохраните токен бота' });
  try {
    const chats = await notify.detectChatId(token);
    if (!chats.length) {
      return res.status(404).json({ error: 'Не нашли ни одного сообщения. Напишите боту любое сообщение и нажмите ещё раз.' });
    }
    res.json({ ok: true, chats });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.post('/telegram/test', async (req, res) => {
  const token = await db.setting('telegram_bot_token');
  const chatId = String(req.body?.chatId || '').trim() || await db.setting('telegram_chat_id');
  if (!token || !chatId) return res.status(400).json({ error: 'Нужны и токен, и чат' });
  try {
    await notify.sendTest({ token, chatId });
    await db.saveSetting('telegram_chat_id', chatId);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: `Не отправилось: ${e.message}` });
  }
});

router.delete('/telegram', async (req, res) => {
  await db.batch(['telegram_bot_token', 'telegram_chat_id', 'telegram_bot_username']
    .map((k) => ['DELETE FROM settings WHERE key = ?', k]));
  res.json({ ok: true });
});

/* ---------- настройки магазина ----------
   Читать и менять можно только публичные настройки из белого списка.
   Секреты — токен бота, ключ сессий — отсюда недоступны вовсе. */
router.get('/settings', async (req, res) => {
  res.json({ settings: await db.publicSettings() });
});

router.put('/settings', async (req, res) => {
  const body = req.body || {};
  const allowed = new Set(db.PUBLIC_SETTING_KEYS);
  const updates = Object.entries(body).filter(([k]) => allowed.has(k));
  await db.batch(updates.map(([k, v]) => [
    'INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    k, String(v ?? '').slice(0, 500),
  ]));
  res.json({ ok: true, settings: await db.publicSettings() });
});

module.exports = router;
