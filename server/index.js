'use strict';
const express = require('express');
const compression = require('compression');
const path = require('node:path');

const config = require('./config');
const { asyncSafe } = require('./http');
const db = require('./db');
const auth = require('./auth');
const seo = require('./seo');
const { router: publicApi } = require('./routes/api');
const adminApi = require('./routes/admin');

const app = asyncSafe(express());
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const STARTED_AT = Date.now();

app.disable('x-powered-by');

/* Кому верить X-Forwarded-*: только своему прокси (см. config.js).
   Иначе любой посетитель подменит свой IP и обойдёт ограничение попыток входа. */
app.set('trust proxy', config.trustProxy);

/* Сжатие: style.css 57 КБ → около 12 КБ. На мобильном интернете заметно. */
app.use(compression({ threshold: 1024 }));

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

/* ---------- защитные заголовки ---------- */
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  /* HSTS только когда запрос реально пришёл по HTTPS: иначе на localhost
     браузер навсегда запретит http */
  if (req.secure && config.isProd) {
    res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  }
  next();
});

/* ---------- журнал запросов в продакшене ---------- */
if (config.isProd) {
  app.use((req, res, next) => {
    const t0 = process.hrtime.bigint();
    res.on('finish', () => {
      if (/^\/(css|js|img|uploads|healthz)\b/.test(req.path)) return;
      const ms = Number(process.hrtime.bigint() - t0) / 1e6;
      const line = `${new Date().toISOString()} ${req.method} ${req.originalUrl} ${res.statusCode} ${ms.toFixed(0)}ms ${req.ip}`;
      (res.statusCode >= 500 ? console.error : console.log)(line);
    });
    next();
  });
}

/* ---------- проверка здоровья ----------
   Хостинг дёргает этот адрес: если база не отвечает — 503, и процесс перезапускают.
   Сюда же можно направить внешний «будильник», чтобы бесплатный Render не засыпал. */
app.get('/healthz', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    await db.get('SELECT 1 AS ok');
    res.json({ status: 'ok', uptime: Math.round((Date.now() - STARTED_AT) / 1000) });
  } catch {
    res.status(503).json({ status: 'error', error: 'база данных недоступна' });
  }
});

/* ---------- robots.txt и карта сайта ---------- */
const baseUrl = (req) => config.publicUrl || `${req.protocol}://${req.get('host')}`;

app.get('/robots.txt', (req, res) => {
  res.type('text/plain').send([
    'User-agent: *',
    'Allow: /',
    'Disallow: /admin',
    'Disallow: /checkout',
    'Disallow: /api/',
    '',
    `Sitemap: ${baseUrl(req)}/sitemap.xml`,
    '',
  ].join('\n'));
});

app.get('/sitemap.xml', async (req, res) => {
  const base = baseUrl(req);
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const [categories, products] = await Promise.all([
    db.all('SELECT slug FROM categories ORDER BY sort_order'),
    db.all('SELECT slug, created_at FROM products WHERE is_active = 1 ORDER BY id DESC'),
  ]);

  const urls = [
    { loc: '/', priority: '1.0' },
    { loc: '/catalog', priority: '0.9' },
    ...categories.map((c) => ({ loc: `/catalog?category=${c.slug}`, priority: '0.7' })),
    ...products.map((p) => ({ loc: `/product/${p.slug}`, priority: '0.8', lastmod: String(p.created_at).slice(0, 10) })),
    { loc: '/privacy', priority: '0.2' },
  ];

  res.type('application/xml').send(
    '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    + urls.map((u) => `  <url><loc>${esc(base + u.loc)}</loc>`
        + (u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : '')
        + `<priority>${u.priority}</priority></url>`).join('\n')
    + '\n</urlset>\n');
});

/* ---------- фото товаров ----------
   Хранятся в базе: на бесплатном Render файлы на диске стираются при перезапуске.
   Имя уникально и никогда не меняется, поэтому кэш на год безопасен —
   браузер скачает фото один раз, и база не будет нагружаться повторно. */
app.get('/uploads/:name', async (req, res) => {
  const name = String(req.params.name);
  if (!/^[\w.-]{1,120}$/.test(name)) return res.status(404).json({ error: 'Не найдено' });

  if (req.headers['if-none-match'] === `"${name}"`) return res.status(304).end();

  const media = await db.getMedia(name);
  if (!media) return res.status(404).json({ error: 'Не найдено' });

  res.set({
    'Content-Type': media.mime,
    'Content-Length': String(media.data.length),
    'Cache-Control': 'public, max-age=31536000, immutable',
    ETag: `"${name}"`,
  });
  res.end(media.data);
});

/* ---------- API ---------- */
app.use('/api', publicApi);
app.use('/api/admin', adminApi);

/* Админ-панель — до статики, иначе express.static редиректит /admin на /admin/ */
app.get(['/admin', '/admin/*'], (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.sendFile(path.join(PUBLIC_DIR, 'admin', 'index.html'));
});

/* ---------- страницы с мета-тегами для превью ----------
   Telegram не выполняет JavaScript, поэтому заголовок, цену и картинку
   для превью вписывает сервер. Стоит ДО статики, иначе она перехватит запрос. */
app.get(['/', '/index.html'], seo.home);
app.get(['/catalog', '/catalog.html'], seo.catalog);
app.get('/product/:slug', seo.product);
app.get(['/privacy', '/privacy.html'], seo.privacy);
app.get(['/checkout', '/checkout.html'], seo.checkout);

/* ---------- статика ----------
   Страницы, стили и скрипты — no-cache: при отсутствии правок браузер
   получает пустой 304. Картинки и шрифты — неделя. */
app.use(express.static(PUBLIC_DIR, {
  extensions: ['html'],
  setHeaders(res, filePath) {
    const longLived = /\.(png|jpe?g|webp|avif|gif|svg|ico|woff2?|ttf)$/i.test(filePath);
    res.setHeader('Cache-Control', longLived ? 'public, max-age=604800' : 'no-cache');
  },
}));

/* ---------- 404 и ошибки ---------- */
app.use((req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Не найдено' });
  res.status(404).sendFile(path.join(PUBLIC_DIR, '404.html'));
});

app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);

  const status = err.status || err.statusCode;
  if (status === 404) return res.status(404).json({ error: 'Не найдено' });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Слишком большой запрос' });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Некорректные данные' });

  /* Детали — в журнал, посетителю — общее сообщение */
  console.error(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}:`, err.stack || err.message);
  res.status(500).json({ error: 'Внутренняя ошибка сервера' });
});

/* ==========================================================================
   Запуск: сначала база, потом приём запросов
   ========================================================================== */
let server;

async function start() {
  /* Render стирает диск при каждом перезапуске. Без внешней базы магазин
     проработал бы до первого перезапуска и потерял все заказы — лучше не стартовать. */
  if (process.env.RENDER && !db.isRemote) {
    throw new Error('на Render не задан KB_DB_URL — локальная база сотрётся при перезапуске вместе с заказами. ' +
      'Укажите KB_DB_URL и KB_DB_TOKEN от Turso: Render → korean-beauty → Environment.');
  }
  await db.init();
  const secretSource = await auth.initSecret();
  const created = await auth.ensureDefaultAdmin();
  const { n: productCount } = await db.get('SELECT COUNT(*) AS n FROM products');

  server = app.listen(config.port, config.host, () => {
    const line = '─'.repeat(56);
    const C = '\x1b[36m'; const Y = '\x1b[33m'; const B = '\x1b[1m'; const R = '\x1b[0m';
    const local = `http://localhost:${config.port}`;
    const SECRET_LABEL = { env: 'KB_SECRET', file: 'файл data/.session-secret', database: 'сохранён в базе' };

    console.log(`\n\x1b[35m${line}${R}`);
    console.log(`  ${B}Korean Beauty${R} — интернет-магазин, г. Нукус`);
    console.log(`\x1b[35m${line}${R}`);
    console.log(`  Режим:        ${config.isProd ? `${B}продакшен${R}` : 'разработка'}`);
    console.log(`  Магазин:      ${C}${config.publicUrl || local}${R}`);
    console.log(`  Админ-панель: ${C}${config.publicUrl || local}/admin${R}`);
    console.log(`  База:         ${db.describe()}`);
    console.log(`  Ключ сессий:  ${SECRET_LABEL[secretSource]}`);
    if (config.isProd) console.log(`  Прокси:       ${config.trustProxyLabel}`);

    if (created) {
      console.log(`\n  ${Y}Создан администратор${R}`);
      console.log(`    логин:  ${B}${created.username}${R}`);
      console.log(`    пароль: ${B}${created.password}${R}`);
      if (created.generated) console.log('    Сохраните пароль — больше он не покажется. Сменить: npm run password');
    }
    if (productCount === 0) {
      console.log(`\n  ${Y}Каталог пуст.${R} Добавьте товары в админ-панели${db.isRemote ? '' : ' или запустите npm run seed'}.`);
    }
    if (config.isProd && !config.publicUrl) {
      console.log(`\n  ${Y}Не задан KB_PUBLIC_URL${R} — адрес для превью и карты сайта берётся из запроса.`);
    }
    console.log(`\x1b[35m${line}${R}\n`);
  });
}

/* ---------- корректная остановка ----------
   Хостинг при обновлении шлёт SIGTERM. Дожидаемся текущих запросов
   (например, оформления заказа) и закрываем соединение с базой. */
let stopping = false;
function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  console.log(`\n${signal}: завершаю работу…`);

  const force = setTimeout(() => {
    console.error('Не успели завершить за 10 с — выходим принудительно.');
    process.exit(1);
  }, 10000);
  force.unref();

  const finish = async () => {
    try {
      if (!db.isRemote) await db.client.execute('PRAGMA wal_checkpoint(TRUNCATE)');
      await db.close();
      console.log('База закрыта корректно. До встречи!');
    } catch (e) {
      console.error('Ошибка при закрытии базы:', e.message);
    }
    process.exit(0);
  };

  if (server) server.close(finish); else finish();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

/* Непойманная ошибка — в журнал и выход: хостинг перезапустит магазин
   в чистом состоянии, это надёжнее, чем работать «полусломанным» */
process.on('uncaughtException', (e) => {
  console.error('[fatal] непойманная ошибка:', e.stack || e);
  shutdown('uncaughtException');
});
process.on('unhandledRejection', (e) => {
  console.error('[warn] необработанный отказ промиса:', e?.stack || e);
});

start().catch((e) => {
  console.error('\nМагазин не запустился:', e.message);
  if (/\b40[13]\b|unauthori[sz]ed/i.test(String(e.message))) {
    console.error('Похоже, не подходит KB_DB_TOKEN. Проверьте токен базы Turso.');
  } else if (/ENOTFOUND|ECONNREFUSED|fetch failed/i.test(String(e.message))) {
    console.error('Не удалось связаться с базой. Проверьте KB_DB_URL и интернет.');
  }
  process.exit(1);
});

module.exports = { app };
