'use strict';
/**
 * Сквозная проверка магазина: публичное API, оформление заказа, админ-панель.
 * Запуск при работающем сервере:  node server/smoke.js
 */
const BASE = process.env.KB_BASE || 'http://localhost:3000';
const USER = process.env.KB_ADMIN_USER || 'admin';
const PASS = process.env.KB_ADMIN_PASS || 'korean2017';

let cookie = '';
/* Свои адреса для проверок блокировки: у каждого прогона свои,
   иначе счётчик неудачных попыток копится между запусками. */
const RUN = Date.now() % 250 + 1;
const TEST_IP_BAD  = `203.0.113.${RUN}`;
const TEST_IP_LOCK = `198.51.100.${RUN}`;
/* Заказы теста идут со своего адреса: иначе ограничение «5 заказов за 10 минут»
   сработает на повторном запуске. И запоминаем их номера, чтобы при уборке
   удалить ровно свои — а не самый свежий заказ, который может быть настоящим. */
const TEST_IP_ORDER = `192.0.2.${RUN}`;
const ORDER_HEADERS = { 'X-Forwarded-For': TEST_IP_ORDER };
const TEST_PHONE = '+998901234567';
const createdOrders = [];
let pass = 0; let fail = 0;

function ok(label, condition, extra = '') {
  if (condition) { pass++; console.log(`  \x1b[32m✓\x1b[0m ${label}${extra ? ' — ' + extra : ''}`); }
  else { fail++; console.log(`  \x1b[31m✗ ${label}${extra ? ' — ' + extra : ''}\x1b[0m`); }
}

async function req(path, { method = 'GET', body, raw = false, headers = {} } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
    redirect: 'manual',
  });
  const set = res.headers.get('set-cookie');
  if (set) cookie = set.split(';')[0];
  if (raw) return { status: res.status, text: await res.text() };
  let data = null;
  try { data = await res.json(); } catch { /* не JSON */ }
  return { status: res.status, data };
}

(async function run() {
  console.log(`\nПроверка ${BASE}\n`);

  /* ---------- страницы ---------- */
  console.log('Страницы');
  for (const [path, expect] of [['/', 200], ['/catalog', 200], ['/checkout', 200], ['/admin/', 200], ['/нет-такой', 404]]) {
    const r = await req(path, { raw: true });
    ok(`${path}`, r.status === expect, `${r.status}`);
  }

  /* ---------- публичное API ---------- */
  console.log('\nПубличное API');
  const meta = (await req('/api/meta')).data;
  ok('meta: разделы', meta.categories.length > 0, `${meta.categories.length}`);
  ok('meta: бренды', meta.brands.length > 0, `${meta.brands.length}`);
  ok('meta: типы кожи и задачи', meta.skinTypes.length === 5 && meta.concerns.length === 7);
  ok('meta: диапазон цен', meta.priceRange.max > meta.priceRange.min);

  const allP = (await req('/api/products?limit=60')).data;
  ok('каталог отдаёт товары', allP.total > 0, `${allP.total}`);
  /* Фото — не обязательное поле: товар без него магазин показывает с заглушкой.
     Проверяем, что поле всегда есть и не ломает витрину. */
  const noPhoto = allP.items.filter((p) => !p.image);
  ok('поле изображения всегда определено', allP.items.every((p) => typeof p.image === 'string'),
    noPhoto.length ? `${noPhoto.length} без фото — покажутся с заглушкой` : 'у всех есть фото');

  const byCat = (await req('/api/products?category=serums')).data;
  ok('фильтр по разделу', byCat.items.every((p) => p.category_slug === 'serums'), `${byCat.total} шт.`);

  const byBrand = (await req('/api/products?brand=cosrx')).data;
  ok('фильтр по бренду', byBrand.items.every((p) => p.brand_name === 'COSRX'), `${byBrand.total} шт.`);

  const bySkin = (await req('/api/products?skin=oily')).data;
  ok('фильтр по типу кожи', bySkin.items.every((p) => p.skin_types.includes('oily')), `${bySkin.total} шт.`);

  const byConcern = (await req('/api/products?concern=acne')).data;
  ok('фильтр по задаче', byConcern.items.every((p) => p.concerns.includes('acne')), `${byConcern.total} шт.`);

  const byPrice = (await req('/api/products?min=100000&max=150000')).data;
  ok('фильтр по цене', byPrice.items.every((p) => p.price >= 100000 && p.price <= 150000), `${byPrice.total} шт.`);

  const sale = (await req('/api/products?sale=1')).data;
  ok('фильтр «со скидкой»', sale.items.every((p) => p.old_price > p.price), `${sale.total} шт.`);

  const instock = (await req('/api/products?instock=1')).data;
  ok('фильтр «в наличии»', instock.items.every((p) => p.stock > 0), `${instock.total} шт.`);

  const combo = (await req('/api/products?category=serums&skin=dry&sort=price_asc')).data;
  const prices = combo.items.map((p) => p.price);
  ok('комбинированный фильтр + сортировка',
    combo.items.every((p) => p.category_slug === 'serums' && p.skin_types.includes('dry'))
    && prices.every((v, i) => i === 0 || prices[i - 1] <= v), `${combo.total} шт.`);

  const desc = (await req('/api/products?sort=price_desc')).data.items.map((p) => p.price);
  ok('сортировка по убыванию цены', desc.every((v, i) => i === 0 || desc[i - 1] >= v));

  for (const [term, label] of [['тонер', 'раздел'], ['ТОНЕР', 'верхний регистр'],
                              ['крем', 'раздел'], ['сыворотк', 'часть слова'],
                              ['cosrx', 'бренд строчными'], ['Snail', 'название']]) {
    const r = (await req(`/api/products?search=${encodeURIComponent(term)}`)).data;
    ok(`поиск «${term}» (${label})`, r.total > 0, `${r.total} шт.`);
  }
  ok('поиск по бессмыслице пуст', (await req('/api/products?search=щщщщ')).data.total === 0);

  const page2 = (await req('/api/products?limit=5&page=2')).data;
  ok('пагинация', page2.page === 2 && page2.items.length <= 5, `стр. 2 из ${page2.pages}`);

  const one = (await req(`/api/products/${allP.items[0].slug}`)).data;
  ok('карточка товара', one.product?.slug === allP.items[0].slug);
  ok('похожие товары', Array.isArray(one.related) && one.related.length > 0, `${one.related.length}`);
  ok('скрытый товар не отдаётся', (await req('/api/products/такого-нет')).status === 404);

  /* ---------- корзина и заказ ---------- */
  console.log('\nКорзина и заказ');
  const [a, b] = allP.items.filter((p) => p.stock > 2).slice(0, 2);
  const validated = (await req('/api/cart/validate', { method: 'POST', body: { items: [{ id: a.id, qty: 2 }, { id: b.id, qty: 1 }, { id: 999999, qty: 1 }] } })).data;
  ok('сверка корзины отбрасывает несуществующие позиции', validated.items.length === 2);

  const stockBefore = a.stock;
  const order = await req('/api/orders', {
    method: 'POST', headers: ORDER_HEADERS,
    body: {
      name: 'Тест Тестов', phone: '+998901234567', delivery: 'delivery',
      address: 'Нукус, ул. Дослык 1', comment: 'проверка', telegram: '@tester',
      items: [{ id: a.id, qty: 2 }, { id: b.id, qty: 1 }],
    },
  });
  ok('заказ создан', order.data?.ok === true, order.data?.code);
  if (order.data?.code) createdOrders.push({ code: order.data.code, restock: [[a.id, 2], [b.id, 1]] });
  ok('сумма заказа верна', order.data?.total === a.price * 2 + b.price,
    `${order.data?.total} = ${a.price}×2 + ${b.price}`);

  const after = (await req(`/api/products/${a.slug}`)).data.product;
  ok('остаток списан', after.stock === stockBefore - 2, `${stockBefore} → ${after.stock}`);
  ok('счётчик продаж увеличен', after.sold_count === a.sold_count + 2);

  ok('заказ без имени отклонён', (await req('/api/orders', { method: 'POST', headers: ORDER_HEADERS, body: { name: '', phone: TEST_PHONE, items: [{ id: a.id, qty: 1 }] } })).status === 400);
  ok('заказ без телефона отклонён', (await req('/api/orders', { method: 'POST', headers: ORDER_HEADERS, body: { name: 'Аноним', phone: '', items: [{ id: a.id, qty: 1 }] } })).status === 400);
  ok('пустой заказ отклонён', (await req('/api/orders', { method: 'POST', headers: ORDER_HEADERS, body: { name: 'Аноним', phone: TEST_PHONE, items: [] } })).status === 400);

  /* ---------- админ ---------- */
  console.log('\nАдмин-панель: доступ');
  ok('без входа /stats закрыт', (await req('/api/admin/stats')).status === 401);
  ok('без входа создание товара закрыто', (await req('/api/admin/products', { method: 'POST', body: { name: 'Взлом', price: 1 } })).status === 401);
  ok('без входа проверка прокси закрыта', (await req('/api/admin/diagnostics/ip')).status === 401);
  /* Стучимся с выдуманного адреса: иначе намеренно неверные пароли
     копятся и защита от перебора блокирует сам тест при повторных запусках. */
  ok('неверный пароль отклонён', (await req('/api/admin/login', {
    method: 'POST', headers: { 'X-Forwarded-For': TEST_IP_BAD },
    body: { username: USER, password: 'неверный' },
  })).status === 401);

  const login = await req('/api/admin/login', { method: 'POST', body: { username: USER, password: PASS } });
  ok('вход выполнен', login.data?.ok === true, login.data?.admin?.username);
  if (login.data?.ok !== true) {
    /* Самая частая причина: пароль сменили через npm run password */
    console.log("");
    console.log("  [33mПодсказка:[0m похоже, пароль администратора изменён —");
    console.log("  поэтому проверки админки не пройдут. Запустите так:");
    console.log("    KB_ADMIN_PASS=ваш_пароль npm test            (Git Bash)");
    console.log('    $env:KB_ADMIN_PASS="ваш_пароль"; npm test    (PowerShell)');
    console.log("");
  }
  ok('сессия выдана', cookie.startsWith('kb_admin='));

  const stats = (await req('/api/admin/stats')).data;
  ok('статистика доступна', stats.products > 0, `${stats.products} товаров, ${stats.orders} заказов`);
  ok('новый заказ учтён', stats.newOrders >= 1);

  const diag = await req('/api/admin/diagnostics/ip');
  ok('проверка прокси показывает адрес', diag.status === 200 && typeof diag.data?.ip === 'string' && 'looksLikeProxy' in diag.data,
    `${diag.data?.ip} · ${diag.data?.trustProxy}`);

  console.log('\nАдмин-панель: справочники');
  const cat = await req('/api/admin/categories', { method: 'POST', body: { name: 'Тестовый раздел ' + Date.now(), icon: '🧪', description: 'временный' } });
  ok('раздел создан', cat.data?.ok === true);
  const brand = await req('/api/admin/brands', { method: 'POST', body: { name: 'TestBrand ' + Date.now(), description: 'временный' } });
  ok('бренд создан', brand.data?.ok === true);

  console.log('\nАдмин-панель: товары');
  const created = await req('/api/admin/products', {
    method: 'POST',
    body: {
      name: 'Набор «Сияние кожи» — тест', price: 249000, old_price: 310000, stock: 4,
      volume: '3 предмета', short_desc: 'Тестовая позиция',
      category_id: cat.data.id, brand_id: brand.data.id,
      skin_types: ['dry', 'normal'], concerns: ['dullness'],
      is_active: true, is_new: true, is_featured: true,
      images: ['/img/placeholder.svg', '/img/favicon.svg'],
    },
  });
  ok('товар создан', created.data?.ok === true, `id ${created.data?.id}`);

  const readBack = (await req(`/api/admin/products/${created.data.id}`)).data.product;
  ok('кириллица превращена в латинский slug', /^[a-z0-9-]+$/.test(readBack.slug), readBack.slug);
  ok('скидка рассчитана', readBack.discount === 20, `${readBack.discount}%`);
  ok('типы кожи сохранены', readBack.skin_types.join(',') === 'dry,normal');
  ok('изображения сохранены по порядку', readBack.images.length === 2 && readBack.images[0] === '/img/placeholder.svg');

  const onSite = (await req(`/api/products/${readBack.slug}`)).data;
  ok('товар виден в магазине', onSite.product?.id === created.data.id);

  await req(`/api/admin/products/${created.data.id}`, {
    method: 'PUT',
    body: { ...readBack, name: readBack.name + ' (изменён)', price: 199000, images: readBack.images },
  });
  const updated = (await req(`/api/admin/products/${created.data.id}`)).data.product;
  ok('товар обновлён', updated.price === 199000 && updated.name.includes('изменён'));

  await req(`/api/admin/products/${created.data.id}/stock`, { method: 'PATCH', body: { stock: 42 } });
  ok('остаток изменён', (await req(`/api/admin/products/${created.data.id}`)).data.product.stock === 42);

  await req(`/api/admin/products/${created.data.id}/toggle`, { method: 'PATCH' });
  ok('товар скрыт от покупателей', (await req(`/api/products/${updated.slug}`)).status === 404);
  ok('но виден в админке', (await req(`/api/admin/products/${created.data.id}`)).status === 200);

  console.log('\nАдмин-панель: заказы и настройки');
  const adminOrders = (await req('/api/admin/orders')).data;
  ok('заказы видны в админке', adminOrders.items.length > 0, `${adminOrders.items.length}`);
  ok('состав заказа приложен', adminOrders.items[0].items.length > 0);

  /* Ищем свой заказ по номеру. Раньше брался adminOrders.items[0] — самый свежий
     в базе: пришёл бы настоящий заказ во время теста, тест сменил бы ему статус
     и удалил его. */
  const ownCode = createdOrders[0]?.code;
  const own = adminOrders.items.find((o) => o.code === ownCode);
  ok('тест нашёл именно свой заказ', Boolean(own), ownCode);
  const oid = own?.id;
  await req(`/api/admin/orders/${oid}`, { method: 'PATCH', body: { status: 'confirmed' } });
  ok('статус заказа изменён',
    (await req('/api/admin/orders?status=confirmed')).data.items.some((o) => o.id === oid));
  ok('некорректный статус отклонён',
    (await req(`/api/admin/orders/${oid}`, { method: 'PATCH', body: { status: 'взлом' } })).status === 400);

  await req('/api/admin/settings', { method: 'PUT', body: { phone: '+998 91 301 45 51', telegram: 'diankatsoy' } });
  const st = (await req('/api/meta')).data.settings;
  ok('настройки сохранены и видны магазину', st.telegram === 'diankatsoy' && st.phone.includes('301'));

  /* ---------- предполётные проверки ---------- */
  console.log('\nГотовность к публикации');

  const robots = await req('/robots.txt', { raw: true });
  ok('robots.txt отдаётся', robots.status === 200 && robots.text.includes('Disallow: /admin'));

  const sitemap = await req('/sitemap.xml', { raw: true });
  const urlCount = (sitemap.text.match(/<url>/g) || []).length;
  ok('sitemap.xml со всеми товарами', sitemap.status === 200 && urlCount > 10, `${urlCount} адресов`);

  ok('страница обработки данных', (await req('/privacy', { raw: true })).status === 200);

  const head = await fetch(BASE + '/');
  ok('защитные заголовки выставлены',
    head.headers.get('x-content-type-options') === 'nosniff'
    && Boolean(head.headers.get('referrer-policy')));

  ok('секрет Telegram не отдаётся в настройках',
    !('telegram_bot_token' in (await req('/api/admin/settings')).data.settings));

  /* Публичный адрес видит любой посетитель. Раньше он отдавал ВСЕ настройки,
     включая токен бота и номер чата продавца, а тест проверял только админку. */
  const SECRET_KEY = /token|secret|chat_id|password|bot_username/i;
  const publicKeys = Object.keys((await fetch(BASE + '/api/meta').then((r) => r.json())).settings);
  const leaked = publicKeys.filter((k) => SECRET_KEY.test(k));
  ok('публичный /api/meta не отдаёт секреты', leaked.length === 0,
    leaked.length ? `УТЕЧКА: ${leaked.join(', ')}` : `${publicKeys.length} публичных полей`);

  const adminKeys = Object.keys((await req('/api/admin/settings')).data.settings);
  ok('настройки админки не отдают секреты', !adminKeys.some((k) => SECRET_KEY.test(k)));

  const metaRaw = await (await fetch(BASE + '/api/meta')).text();
  ok('в ответе /api/meta нет ничего похожего на токен бота', !/\d{6,}:[A-Za-z0-9_-]{30,}/.test(metaRaw));

  /* ---------- фото: хранятся в базе ---------- */
  console.log('\nФото товаров');
  /* Настоящий PNG 1×1 — сервер проверяет содержимое, а не только расширение */
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  const fd = new FormData();
  fd.append('images', new Blob([png], { type: 'image/png' }), 'test.png');
  const up = await fetch(BASE + '/api/admin/upload', { method: 'POST', body: fd, headers: { Cookie: cookie } });
  const upData = await up.json().catch(() => ({}));
  const photoUrl = upData.urls?.[0];
  ok('фото загружается', up.status === 200 && Boolean(photoUrl), photoUrl || upData.error);

  if (photoUrl) {
    const got = await fetch(BASE + photoUrl);
    const bytes = Buffer.from(await got.arrayBuffer());
    ok('фото отдаётся байт в байт', got.status === 200 && bytes.equals(png), `${bytes.length} байт`);
    ok('у фото правильный тип', got.headers.get('content-type') === 'image/png');
    ok('фото кэшируется надолго', /immutable/.test(got.headers.get('cache-control') || ''));
    const again = await fetch(BASE + photoUrl, { headers: { 'If-None-Match': got.headers.get('etag') } });
    ok('повторный запрос фото — 304 без загрузки', again.status === 304);
  }

  const fake = new FormData();
  fake.append('images', new Blob([Buffer.from('это не картинка, а текст')], { type: 'image/png' }), 'virus.png');
  const fakeUp = await fetch(BASE + '/api/admin/upload', { method: 'POST', body: fake, headers: { Cookie: cookie } });
  ok('файл с расширением .png, но не картинка — отклонён', fakeUp.status === 400);

  const noAuth = new FormData();
  noAuth.append('images', new Blob([png], { type: 'image/png' }), 'x.png');
  ok('загрузка без входа закрыта',
    (await fetch(BASE + '/api/admin/upload', { method: 'POST', body: noAuth })).status === 401);

  /* Ключи бота меняются только своими маршрутами. Проверяем, что общий PUT
     их не трогает — независимо от того, настроен бот в магазине или нет. */
  const tgBefore = (await req('/api/admin/telegram')).data;
  await req('/api/admin/settings', {
    method: 'PUT',
    body: { telegram_bot_token: 'попытка-подмены', telegram_bot_username: 'подмена', telegram_chat_id: '000' },
  });
  const tgAfter = (await req('/api/admin/telegram')).data;
  ok('ключи Telegram нельзя переписать через общие настройки',
    tgAfter.hasToken === tgBefore.hasToken
    && tgAfter.botUsername === tgBefore.botUsername
    && tgAfter.chatId === tgBefore.chatId,
    tgBefore.configured ? 'бот настроен, значения не изменились' : 'бот не настроен');

  ok('заказ оформляется независимо от Telegram',
    await (async () => {
      const r = await req('/api/orders', {
        method: 'POST', headers: ORDER_HEADERS,
        body: { name: 'Автопроверка', phone: TEST_PHONE, items: [{ id: a.id, qty: 1 }] },
      });
      if (r.data?.code) createdOrders.push({ code: r.data.code, restock: [[a.id, 1]] });
      return r.data?.ok === true;
    })());

  /* Подбор пароля. Стучимся с выдуманного адреса, чтобы блокировка
     не помешала следующим запускам теста с настоящего IP. */
  const fakeIp = { 'X-Forwarded-For': TEST_IP_LOCK };
  let lockedAfter = 0;
  for (let i = 1; i <= 7; i++) {
    const r = await req('/api/admin/login', {
      method: 'POST', headers: fakeIp,
      body: { username: USER, password: 'подбор' + i },
    });
    if (r.status === 429) { lockedAfter = i; break; }
  }
  ok('вход блокируется после серии неудачных попыток', lockedAfter > 0 && lockedAfter <= 6,
    lockedAfter ? `сработало на ${lockedAfter}-й` : 'НЕ сработало');

  ok('блокировка не мешает работе с другого адреса',
    (await req('/api/admin/stats')).status === 200);

  /* ---------- эксплуатация ---------- */
  console.log('\nЭксплуатация');

  const health = await req('/healthz');
  ok('проверка здоровья /healthz', health.status === 200 && health.data?.status === 'ok');

  const gz = await fetch(BASE + '/css/style.css', { headers: { 'Accept-Encoding': 'gzip' } });
  ok('стили отдаются сжатыми', gz.headers.get('content-encoding') === 'gzip');

  const robotsTxt = (await req('/robots.txt', { raw: true })).text;
  ok('в robots.txt полный адрес карты сайта', /Sitemap: https?:\/\/\S+\/sitemap\.xml/.test(robotsTxt));

  ok('несуществующее фото — 404, а не ошибка сервера',
    (await req('/uploads/nesuschestvuet.jpg')).status === 404);

  ok('битый JSON — понятный отказ 400',
    (await fetch(BASE + '/api/orders', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{битый',
    })).status === 400);

  /* ---------- превью ссылок ----------
     Telegram не выполняет JavaScript: всё, что попадёт в превью,
     должно быть в HTML, который отдаёт сервер. */
  console.log('\nПревью ссылок в Telegram');

  const ogTag = (html, prop) => {
    const m = html.match(new RegExp(`<meta (?:property|name)="${prop}" content="([^"]*)"`));
    return m ? m[1].replace(/&amp;/g, '&').replace(/&quot;/g, '"') : '';
  };

  const pHtml = (await req(`/product/${allP.items[0].slug}`, { raw: true })).text;
  const pTitle = ogTag(pHtml, 'og:title');
  ok('у товара своё название в превью', pTitle.includes(allP.items[0].name), pTitle);
  ok('в превью товара есть цена', /\d[\d\s]* сум/.test(pTitle));
  ok('у превью есть картинка', /^https?:\/\/.+\.(png|jpe?g|webp)$/.test(ogTag(pHtml, 'og:image')));

  const imgUrl = ogTag(pHtml, 'og:image').replace(/^https?:\/\/[^/]+/, '');
  ok('картинка превью действительно открывается', (await req(imgUrl, { raw: true })).status === 200, imgUrl);

  ok('в HTML нет повторов заголовка', (pHtml.match(/<title>/g) || []).length === 1
    && (pHtml.match(/property="og:title"/g) || []).length === 1);

  const catHtml = (await req('/catalog?category=serums', { raw: true })).text;
  ok('у раздела своё название в превью', ogTag(catHtml, 'og:title').startsWith('Сыворотки'));

  const filtered = (await req('/catalog?skin=dry&sale=1', { raw: true })).text;
  ok('сочетания фильтров закрыты от индексации', ogTag(filtered, 'robots') === 'noindex');

  ok('несуществующий товар — статус 404', (await req('/product/takogo-tovara-net', { raw: true })).status === 404);

  /* Спам заказами. Шлём пустые заказы: ограничитель стоит до проверки данных,
     поэтому считает и их, а в базе ничего не появляется. */
  const spamIp = { 'X-Forwarded-For': `203.0.113.${(RUN % 200) + 30}` };
  let spamBlockedAt = 0;
  for (let i = 1; i <= 7; i++) {
    const r = await req('/api/orders', { method: 'POST', headers: spamIp, body: { name: 'спам', phone: TEST_PHONE, items: [] } });
    if (r.status === 429) { spamBlockedAt = i; break; }
  }
  ok('спам заказами останавливается', spamBlockedAt > 0 && spamBlockedAt <= 6,
    spamBlockedAt ? `на ${spamBlockedAt}-м запросе` : 'НЕ остановлен');

  /* Подмена IP. С localhost заголовок X-Forwarded-For принимается намеренно —
     так работают nginx и cloudflared. Внешнему клиенту верить нельзя, поэтому
     стучимся на сетевой адрес этой же машины, как пришёл бы запрос из интернета. */
  const lan = Object.values(require('node:os').networkInterfaces()).flat()
    .find((n) => n && n.family === 'IPv4' && !n.internal && !n.address.startsWith('169.254.'));
  if (lan) {
    const port = new URL(BASE).port || 80;
    let spoofBlocked = 0;
    try {
      for (let i = 1; i <= 8; i++) {
        const r = await fetch(`http://${lan.address}:${port}/api/admin/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': `10.77.${RUN % 250}.${i}` },
          body: JSON.stringify({ username: USER, password: 'подмена' + i }),
          signal: AbortSignal.timeout(4000),
        });
        if (r.status === 429) spoofBlocked++;
      }
      ok('подмена IP не обходит защиту от перебора', spoofBlocked > 0,
        spoofBlocked ? `заблокировано ${spoofBlocked} из 8 через ${lan.address}` : 'ПЕРЕБОР НЕ ОСТАНОВЛЕН');
    } catch (e) {
      console.log(`  - подмена IP: сетевой адрес ${lan.address} недоступен, проверка пропущена`);
    }
  } else {
    console.log('  - подмена IP: нет сетевого интерфейса, проверка пропущена');
  }

  console.log('\nУборка');
  await req(`/api/admin/products/${created.data.id}`, { method: 'DELETE' });
  await req(`/api/admin/categories/${cat.data.id}`, { method: 'DELETE' });
  await req(`/api/admin/brands/${brand.data.id}`, { method: 'DELETE' });
  /* Удаляем все заказы, созданные тестом, и возвращаем списанные остатки */
  let removedOrders = 0;
  for (const { code, restock } of createdOrders) {
    const found = (await req(`/api/admin/orders?search=${encodeURIComponent(code)}`)).data.items
      .find((o) => o.code === code);
    if (!found) continue;
    await req(`/api/admin/orders/${found.id}`, { method: 'DELETE' });
    removedOrders++;
    for (const [pid, qty] of restock) {
      const cur = (await req(`/api/admin/products/${pid}`)).data.product;
      await req(`/api/admin/products/${pid}/stock`, { method: 'PATCH', body: { stock: cur.stock + qty } });
    }
  }
  ok('тест удалил все свои заказы', removedOrders === createdOrders.length,
    `${removedOrders} из ${createdOrders.length}`);
  ok('тестовый товар удалён', (await req(`/api/admin/products/${created.data.id}`)).status === 404);

  const out = await req('/api/admin/logout', { method: 'POST' });
  ok('выход выполнен', out.data?.ok === true);
  cookie = '';
  ok('после выхода доступ закрыт', (await req('/api/admin/stats')).status === 401);

  console.log(`\n${'─'.repeat(46)}`);
  console.log(fail === 0
    ? `\x1b[32m  Все проверки пройдены: ${pass}\x1b[0m`
    : `\x1b[31m  Успешно: ${pass}, провалено: ${fail}\x1b[0m`);
  console.log(`${'─'.repeat(46)}\n`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('\n\x1b[31mОшибка проверки:\x1b[0m', e.message); process.exit(1); });
