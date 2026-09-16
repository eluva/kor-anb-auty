'use strict';
/**
 * Мета-теги страниц на стороне сервера.
 *
 * Зачем: Telegram, WhatsApp и поисковики строят превью ссылки по HTML,
 * НЕ выполняя JavaScript. Название товара раньше подставлялось скриптом —
 * и в превью любой карточки было безликое «Товар — Korean Beauty».
 * Магазин продаёт через Telegram, поэтому превью с названием, ценой и фото
 * — это то, что увидит подруга, которой переслали ссылку.
 */
const fs = require('node:fs');
const path = require('node:path');
const config = require('./config');
const db = require('./db');

const THEME_COLOR = '#A65A63';
const DEFAULT_IMAGE = '/img/og-image.png';

/* Страницы лежат в views/, а не в public/: Vercel раздаёт public/ сам, мимо
   сервера, и мета-теги для превью не попали бы в HTML.
   Пути записаны целиком, без переменных: так сборщик Vercel видит,
   какие файлы нужны серверу, и кладёт их в функцию. */
const TEMPLATES = {
  'index.html': path.join(__dirname, '..', 'views', 'index.html'),
  'catalog.html': path.join(__dirname, '..', 'views', 'catalog.html'),
  'product.html': path.join(__dirname, '..', 'views', 'product.html'),
  'checkout.html': path.join(__dirname, '..', 'views', 'checkout.html'),
  'privacy.html': path.join(__dirname, '..', 'views', 'privacy.html'),
};

/* Шаблоны кэшируем, но проверяем время изменения файла:
   правки HTML видны сразу, без перезапуска */
const cache = new Map();
function template(file) {
  const full = TEMPLATES[file];
  const mtime = fs.statSync(full).mtimeMs;
  const hit = cache.get(full);
  if (hit && hit.mtime === mtime) return hit.html;
  const html = fs.readFileSync(full, 'utf8');
  cache.set(full, { html, mtime });
  return html;
}

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const clip = (s, n) => {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : t;
};

const money = (n) => new Intl.NumberFormat('ru-RU').format(Math.round(Number(n) || 0)) + ' сум';

const baseUrl = (req) => config.publicUrl || `${req.protocol}://${req.get('host')}`;

/** Вставить мета-теги в шаблон: старые title/description/og удаляются. */
async function render(file, req, meta) {
  const base = baseUrl(req);
  const abs = (u) => (/^https?:\/\//.test(u) ? u : base + u);
  const shop = (await db.setting('shop_name')) || 'Korean Beauty';

  const url = abs(meta.path ?? req.originalUrl);
  const image = abs(meta.image || DEFAULT_IMAGE);

  const tags = [
    `<title>${esc(meta.title)}</title>`,
    `<meta name="description" content="${esc(meta.description)}">`,
    `<meta name="theme-color" content="${THEME_COLOR}">`,
    `<link rel="canonical" href="${esc(url)}">`,
    meta.noindex ? '<meta name="robots" content="noindex">' : '',
    `<meta property="og:site_name" content="${esc(shop)}">`,
    `<meta property="og:locale" content="ru_RU">`,
    `<meta property="og:type" content="${meta.type || 'website'}">`,
    `<meta property="og:title" content="${esc(meta.ogTitle || meta.title)}">`,
    `<meta property="og:description" content="${esc(meta.description)}">`,
    `<meta property="og:url" content="${esc(url)}">`,
    `<meta property="og:image" content="${esc(image)}">`,
    meta.imageIsDefault !== false ? '<meta property="og:image:width" content="1200">' : '',
    meta.imageIsDefault !== false ? '<meta property="og:image:height" content="630">' : '',
    `<meta property="og:image:alt" content="${esc(meta.ogTitle || meta.title)}">`,
    meta.price ? `<meta property="product:price:amount" content="${meta.price}">` : '',
    meta.price ? '<meta property="product:price:currency" content="UZS">' : '',
    '<meta name="twitter:card" content="summary_large_image">',
  ].filter(Boolean).join('\n');

  return template(file)
    .replace(/<title>[\s\S]*?<\/title>\s*/i, '')
    .replace(/<meta\s+name="(description|theme-color|robots)"[^>]*>\s*/gi, '')
    .replace(/<meta\s+property="(og|product):[^"]*"[^>]*>\s*/gi, '')
    .replace(/<meta\s+name="twitter:[^"]*"[^>]*>\s*/gi, '')
    .replace(/<link\s+rel="canonical"[^>]*>\s*/gi, '')
    .replace(/<meta name="viewport"[^>]*>/i, (m) => `${m}\n${tags}`);
}

function send(res, html, status = 200) {
  res.status(status)
    .set('Content-Type', 'text/html; charset=utf-8')
    .set('Cache-Control', 'no-cache')
    .send(html);
}

/* ---------- страницы ---------- */

async function home(req, res) {
  const s = await db.publicSettings();
  send(res, await render('index.html', req, {
    path: '/',
    title: `${s.shop_name || 'Korean Beauty'} — корейская косметика в Нукусе`,
    ogTitle: `${s.shop_name || 'Korean Beauty'} — настоящая корейская косметика`,
    description: 'Оригинальная корейская косметика в Нукусе: COSRX, Beauty of Joseon, Anua, Laneige и другие бренды. '
      + 'Подбор ухода под ваш тип кожи, доставка по Нукусу в день заказа.',
  }));
}

async function catalog(req, res) {
  let title = 'Каталог корейской косметики';
  let description = 'Тонеры, сыворотки, кремы, SPF и маски от корейских брендов. '
    + 'Фильтры по типу кожи и задаче, доставка по Нукусу.';

  /* Один раздел или один бренд — своё название в превью */
  const cat = String(req.query.category || '');
  const brand = String(req.query.brand || '');
  if (cat && !cat.includes(',')) {
    const c = await db.get('SELECT name, description FROM categories WHERE slug = ?', cat);
    if (c) { title = `${c.name} — корейская косметика`; description = c.description || description; }
  } else if (brand && !brand.includes(',')) {
    const b = await db.get('SELECT name, description FROM brands WHERE slug = ?', brand);
    if (b) { title = `${b.name} в Нукусе — оригинал из Кореи`; description = b.description || description; }
  }

  /* Отдельные разделы и бренды индексируем, остальные сочетания фильтров — нет:
     иначе поисковик увидит тысячи почти одинаковых страниц */
  const params = Object.keys(req.query).filter((k) => req.query[k]);
  const indexable = params.length === 0
    || (params.length === 1 && ['category', 'brand'].includes(params[0]) && !String(req.query[params[0]]).includes(','));

  send(res, await render('catalog.html', req, {
    path: indexable ? req.originalUrl : '/catalog',
    title: `${title} — Korean Beauty, Нукус`,
    ogTitle: title,
    description,
    noindex: !indexable,
  }));
}

async function product(req, res) {
  const p = await db.get(`
    SELECT p.name, p.slug, p.short_desc, p.description, p.price, p.old_price, p.stock, p.volume,
           b.name AS brand,
           (SELECT url FROM product_images WHERE product_id = p.id ORDER BY sort_order, id LIMIT 1) AS image
    FROM products p LEFT JOIN brands b ON b.id = p.brand_id
    WHERE p.slug = ? AND p.is_active = 1`, req.params.slug);

  if (!p) {
    return send(res, await render('product.html', req, {
      title: 'Товар не найден — Korean Beauty',
      description: 'Возможно, товар закончился или ссылка устарела. Загляните в каталог.',
      noindex: true,
    }), 404);
  }

  /* SVG-заглушки мессенджеры не показывают — берём общую картинку магазина */
  const raster = p.image && /\.(jpe?g|png|webp)$/i.test(p.image);
  const name = p.brand ? `${p.brand} — ${p.name}` : p.name;
  const priceLine = p.stock > 0 ? money(p.price) : `${money(p.price)}, под заказ`;
  const sale = p.old_price > p.price ? ` (было ${money(p.old_price)})` : '';

  send(res, await render('product.html', req, {
    path: `/product/${p.slug}`,
    type: 'product',
    title: `${name} — купить в Нукусе | Korean Beauty`,
    ogTitle: `${name} · ${priceLine}`,
    description: clip(
      `${priceLine}${sale}. ${p.short_desc || p.description || 'Оригинальная корейская косметика.'}`
      + `${p.volume ? ` Объём: ${p.volume}.` : ''} Доставка по Нукусу.`, 190),
    image: raster ? p.image : DEFAULT_IMAGE,
    imageIsDefault: !raster,
    price: p.price,
  }));
}

async function privacy(req, res) {
  send(res, await render('privacy.html', req, {
    path: '/privacy',
    title: 'Обработка персональных данных — Korean Beauty',
    description: 'Какие данные Korean Beauty собирает при заказе, зачем и как их удалить.',
  }));
}

async function checkout(req, res) {
  send(res, await render('checkout.html', req, {
    path: '/checkout',
    title: 'Оформление заказа — Korean Beauty',
    description: 'Оформление заказа в интернет-магазине Korean Beauty.',
    noindex: true,
  }));
}

module.exports = { home, catalog, product, privacy, checkout, render };
