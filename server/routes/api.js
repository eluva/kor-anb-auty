'use strict';
const express = require('express');
const { asyncSafe } = require('../http');
const db = require('../db');
const { waitUntil } = require('@vercel/functions');
const { notifyNewOrder } = require('../notify');
const { orderLimiter } = require('../ratelimit');

const router = asyncSafe(express.Router());

/* Стоимость доставки считаем на сервере: клиент может прислать что угодно */
async function shippingCost(goodsTotal) {
  const price = Number(await db.setting('delivery_city_price')) || 0;
  const freeFrom = Number(await db.setting('free_delivery_from')) || 0;
  if (freeFrom && goodsTotal >= freeFrom) return 0;
  return price;
}

const SKIN_TYPES = [
  { id: 'dry',         name: 'Сухая' },
  { id: 'oily',        name: 'Жирная' },
  { id: 'combination', name: 'Комбинированная' },
  { id: 'normal',      name: 'Нормальная' },
  { id: 'sensitive',   name: 'Чувствительная' },
];

const CONCERNS = [
  { id: 'acne',        name: 'Акне и высыпания' },
  { id: 'pores',       name: 'Расширенные поры' },
  { id: 'pigment',     name: 'Пигментация и тон' },
  { id: 'aging',       name: 'Возрастные изменения' },
  { id: 'dehydration', name: 'Обезвоженность' },
  { id: 'redness',     name: 'Покраснения' },
  { id: 'dullness',    name: 'Тусклость кожи' },
];

/* ---------- сериализация товара ---------- */
const PRODUCT_FIELDS = `
  p.id, p.name, p.slug, p.short_desc, p.description, p.ingredients, p.how_to_use,
  p.volume, p.price, p.old_price, p.stock, p.skin_types, p.concerns, p.rating,
  p.sold_count, p.is_active, p.is_featured, p.is_new, p.created_at,
  p.brand_id, p.category_id,
  b.name AS brand_name, b.slug AS brand_slug,
  c.name AS category_name, c.slug AS category_slug`;

const FROM_PRODUCTS = `
  FROM products p
  LEFT JOIN brands b     ON b.id = p.brand_id
  LEFT JOIN categories c ON c.id = p.category_id`;

const csv = (s) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean);
const marks = (list) => list.map(() => '?').join(',');

async function withImages(rows) {
  if (!rows.length) return rows;
  const ids = rows.map((r) => r.id);
  const imgs = await db.all(
    `SELECT product_id, url FROM product_images
     WHERE product_id IN (${marks(ids)})
     ORDER BY sort_order, id`, ...ids);
  const byId = new Map(ids.map((id) => [id, []]));
  for (const i of imgs) byId.get(i.product_id)?.push(i.url);
  return rows.map((r) => ({
    ...r,
    skin_types: csv(r.skin_types),
    concerns: csv(r.concerns),
    is_active: !!r.is_active,
    is_featured: !!r.is_featured,
    is_new: !!r.is_new,
    images: byId.get(r.id) || [],
    image: (byId.get(r.id) || [])[0] || '',
    discount: r.old_price > r.price ? Math.round((1 - r.price / r.old_price) * 100) : 0,
  }));
}

/* ---------- справочники и публичные настройки ---------- */
router.get('/meta', async (req, res) => {
  /* Счётчики товаров — одним проходом по таблице. Раньше для каждого раздела
     и бренда был отдельный подзапрос: 28 проходов вместо одного. На Turso
     бесплатный лимит считается по прочитанным строкам — разница прямая. */
  const [settings, categories, brands, counts, priceRow] = await Promise.all([
    db.publicSettings(),
    db.all('SELECT id, name, slug, description, icon, sort_order FROM categories ORDER BY sort_order, name'),
    db.all('SELECT id, name, slug, description, logo, sort_order FROM brands ORDER BY sort_order, name'),
    db.all(`SELECT category_id, brand_id, COUNT(*) AS n
            FROM products WHERE is_active = 1 GROUP BY category_id, brand_id`),
    db.get('SELECT MIN(price) AS min, MAX(price) AS max FROM products WHERE is_active = 1'),
  ]);

  const byCat = new Map(); const byBrand = new Map();
  for (const r of counts) {
    byCat.set(r.category_id, (byCat.get(r.category_id) || 0) + r.n);
    byBrand.set(r.brand_id, (byBrand.get(r.brand_id) || 0) + r.n);
  }

  res.json({
    settings,
    categories: categories.map((c) => ({ ...c, count: byCat.get(c.id) || 0 })),
    brands: brands.map((b) => ({ ...b, count: byBrand.get(b.id) || 0 })),
    skinTypes: SKIN_TYPES,
    concerns: CONCERNS,
    priceRange: { min: priceRow?.min ?? 0, max: priceRow?.max ?? 1000000 },
  });
});

/* ---------- каталог с фильтрами ---------- */
router.get('/products', async (req, res) => {
  const q = req.query;
  const where = ['p.is_active = 1'];
  const params = [];

  if (q.category) {
    const slugs = csv(q.category);
    where.push(`c.slug IN (${marks(slugs)})`);
    params.push(...slugs);
  }
  if (q.brand) {
    const slugs = csv(q.brand);
    where.push(`b.slug IN (${marks(slugs)})`);
    params.push(...slugs);
  }
  if (q.skin) {
    const list = csv(q.skin);
    where.push(`(${list.map(() => "(',' || p.skin_types || ',') LIKE ?").join(' OR ')})`);
    params.push(...list.map((s) => `%,${s},%`));
  }
  if (q.concern) {
    const list = csv(q.concern);
    where.push(`(${list.map(() => "(',' || p.concerns || ',') LIKE ?").join(' OR ')})`);
    params.push(...list.map((s) => `%,${s},%`));
  }
  if (q.min) { where.push('p.price >= ?'); params.push(Number(q.min) || 0); }
  if (q.max) { where.push('p.price <= ?'); params.push(Number(q.max) || 0); }
  if (q.instock === '1')  where.push('p.stock > 0');
  if (q.sale === '1')     where.push('p.old_price > p.price');
  if (q.new === '1')      where.push('p.is_new = 1');
  if (q.featured === '1') where.push('p.is_featured = 1');
  if (q.search) {
    /* Готовые строки в нижнем регистре: SQLite не умеет сворачивать регистр кириллицы */
    where.push('(p.search_text LIKE ? OR b.name_lc LIKE ? OR c.name_lc LIKE ?)');
    const s = `%${db.lc(String(q.search).trim())}%`;
    params.push(s, s, s);
  }

  const SORTS = {
    popular:    'p.sold_count DESC, p.rating DESC, p.id DESC',
    new:        'p.created_at DESC, p.id DESC',
    price_asc:  'p.price ASC',
    price_desc: 'p.price DESC',
    name:       'p.name COLLATE NOCASE ASC',
    rating:     'p.rating DESC, p.sold_count DESC',
  };
  const order = SORTS[q.sort] || SORTS.popular;
  const whereSql = `WHERE ${where.join(' AND ')}`;

  const limit = Math.min(Math.max(parseInt(q.limit, 10) || 12, 1), 60);
  const page = Math.max(parseInt(q.page, 10) || 1, 1);

  const [countRow, rows] = await Promise.all([
    db.get(`SELECT COUNT(*) AS n ${FROM_PRODUCTS} ${whereSql}`, ...params),
    db.all(`SELECT ${PRODUCT_FIELDS} ${FROM_PRODUCTS} ${whereSql} ORDER BY ${order} LIMIT ? OFFSET ?`,
      ...params, limit, (page - 1) * limit),
  ]);
  const total = countRow.n;

  res.json({ items: await withImages(rows), total, page, pages: Math.ceil(total / limit) || 1, limit });
});

/* ---------- один товар ---------- */
router.get('/products/:slug', async (req, res) => {
  const row = await db.get(`SELECT ${PRODUCT_FIELDS} ${FROM_PRODUCTS} WHERE p.slug = ? AND p.is_active = 1`,
    req.params.slug);
  if (!row) return res.status(404).json({ error: 'Товар не найден' });
  const [product] = await withImages([row]);

  const related = await withImages(await db.all(
    `SELECT ${PRODUCT_FIELDS} ${FROM_PRODUCTS}
     WHERE p.is_active = 1 AND p.id <> ? AND (p.category_id = ? OR p.brand_id = ?)
     ORDER BY (p.category_id = ?) DESC, p.sold_count DESC LIMIT 4`,
    product.id, product.category_id, product.brand_id, product.category_id));

  res.json({ product, related });
});

/* ---------- корзина: сверка с актуальными ценами ---------- */
router.post('/cart/validate', async (req, res) => {
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  const ids = [...new Set(items.map((i) => Number(i.id)).filter(Number.isInteger))].slice(0, 100);
  if (!ids.length) return res.json({ items: [] });

  const rows = await withImages(await db.all(
    `SELECT ${PRODUCT_FIELDS} ${FROM_PRODUCTS}
     WHERE p.id IN (${marks(ids)}) AND p.is_active = 1`, ...ids));
  const byId = new Map(rows.map((r) => [r.id, r]));

  const out = [];
  for (const i of items) {
    const p = byId.get(Number(i.id));
    if (!p) continue;
    out.push({ ...p, qty: Math.max(1, Math.min(Number(i.qty) || 1, Math.max(p.stock, 1))) });
  }
  res.json({ items: out });
});

/* ---------- оформление заказа ---------- */
router.post('/orders', orderLimiter, async (req, res) => {
  const b = req.body || {};
  const name = String(b.name || '').trim().slice(0, 120);
  const phone = String(b.phone || '').trim().slice(0, 40);
  const items = Array.isArray(b.items) ? b.items.slice(0, 100) : [];

  if (name.length < 2)  return res.status(400).json({ error: 'Укажите имя' });
  if (phone.length < 7) return res.status(400).json({ error: 'Укажите корректный номер телефона' });
  if (!items.length)    return res.status(400).json({ error: 'Корзина пуста' });

  const ids = [...new Set(items.map((i) => Number(i.id)).filter(Number.isInteger))];
  if (!ids.length) return res.status(400).json({ error: 'Корзина пуста' });

  const rows = await db.all(`SELECT id, name, price, stock FROM products
                             WHERE id IN (${marks(ids)}) AND is_active = 1`, ...ids);
  const byId = new Map(rows.map((r) => [r.id, r]));

  const lines = [];
  for (const i of items) {
    const p = byId.get(Number(i.id));
    if (!p) continue;
    lines.push({ product_id: p.id, name: p.name, price: p.price, qty: Math.max(1, Math.min(Number(i.qty) || 1, 99)) });
  }
  if (!lines.length) return res.status(400).json({ error: 'Товары недоступны' });

  const total = lines.reduce((s, l) => s + l.price * l.qty, 0);
  const code = 'KB-' + String(Date.now()).slice(-6) + '-' + Math.floor(Math.random() * 90 + 10);
  const delivery = b.delivery === 'delivery' ? 'delivery' : 'pickup';
  const telegram = String(b.telegram || '').replace(/^@/, '').trim().slice(0, 64);
  const address = String(b.address || '').trim().slice(0, 500);
  const comment = String(b.comment || '').trim().slice(0, 1000);

  /* Весь заказ — одним пакетом: либо записан целиком, либо не записан вовсе.
     Позиции ссылаются на заказ по уникальному номеру — так не нужен
     промежуточный запрос за id, и пакет остаётся атомарным. */
  try {
    await db.batch([
      [`INSERT INTO orders(code, customer_name, phone, telegram, delivery, address, comment, total)
        VALUES(?, ?, ?, ?, ?, ?, ?, ?)`, code, name, phone, telegram, delivery, address, comment, total],
      ...lines.flatMap((l) => [
        [`INSERT INTO order_items(order_id, product_id, name, price, qty)
          VALUES((SELECT id FROM orders WHERE code = ?), ?, ?, ?, ?)`, code, l.product_id, l.name, l.price, l.qty],
        ['UPDATE products SET sold_count = sold_count + ?, stock = MAX(stock - ?, 0) WHERE id = ?',
          l.qty, l.qty, l.product_id],
      ]),
    ]);
  } catch (e) {
    console.error('[order] не удалось сохранить заказ:', e.message);
    return res.status(500).json({ error: 'Не удалось оформить заказ. Попробуйте ещё раз или напишите нам в Telegram.' });
  }

  res.json({ ok: true, code, total, items: lines });

  /* Уведомление продавцу — после ответа покупателю: медленный или недоступный
     Telegram не должен задерживать оформление. waitUntil просит Vercel
     не замораживать функцию, пока сообщение не уйдёт; на своём сервере
     он ничего не делает — там процесс и так продолжает работать. */
  waitUntil((async () => {
    const shipping = delivery === 'delivery' ? await shippingCost(total) : 0;
    await notifyNewOrder({ code, total, customer_name: name, phone, telegram, delivery, address, comment }, lines, shipping);
  })().catch((e) => console.error(`[telegram] уведомление о заказе ${code} не отправлено:`, e.message)));
});

module.exports = { router, SKIN_TYPES, CONCERNS, withImages, PRODUCT_FIELDS, FROM_PRODUCTS };
