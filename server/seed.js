'use strict';
/**
 * Демо-наполнение каталога.
 *   npm run seed          — заполнить, если каталог пуст
 *   npm run reset         — очистить и заполнить заново
 */
const fs = require('node:fs');
const path = require('node:path');
const db = require('./db');
const { ensureDefaultAdmin } = require('./auth');
const cli = require('./cli');

const FORCE = cli.flag('force');
/* Стирание удалённой базы — отдельным, нарочно длинным флагом */
const CONFIRM_REMOTE = cli.flag('delete-production-orders');
const IMG_DIR = path.join(__dirname, '..', 'public', 'img', 'products');
fs.mkdirSync(IMG_DIR, { recursive: true });

/* ------------------------------------------------------------------ */
/*  Генератор SVG-заглушек: аккуратная карточка вместо «нет фото»       */
/* ------------------------------------------------------------------ */
const PALETTES = [
  ['#FBE9EC', '#F3CBD3', '#B4707F'], ['#FFF3E6', '#F8DCC0', '#B98A5B'],
  ['#EAF4F1', '#C9E4DC', '#5C8E84'], ['#F3EEFA', '#DCD0EE', '#7A6595'],
  ['#FFF7E3', '#F5E3B0', '#B29334'], ['#EDF2FA', '#CFDDF0', '#5B7699'],
  ['#FDECEF', '#F7C9D4', '#AE5C75'], ['#F1F6E8', '#D9E8C4', '#6F8B4C'],
];

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function shapeFor(kind, c) {
  const S = { fill: c, opacity: 0.92 };
  const f = `fill="${S.fill}" opacity="${S.opacity}"`;
  switch (kind) {
    case 'jar':
      return `<rect x="150" y="230" width="200" height="150" rx="26" ${f}/>
              <rect x="138" y="196" width="224" height="52" rx="20" fill="${c}" opacity="0.55"/>`;
    case 'tube':
      return `<path d="M190 168h120l14 232a26 26 0 0 1-26 28H202a26 26 0 0 1-26-28z" ${f}/>
              <rect x="196" y="146" width="108" height="30" rx="12" fill="${c}" opacity="0.55"/>`;
    case 'pouch':
      return `<path d="M160 170h180a12 12 0 0 1 12 12v208a12 12 0 0 1-12 12H160a12 12 0 0 1-12-12V182a12 12 0 0 1 12-12z" ${f}/>
              <path d="M148 170h204v22H148z" fill="${c}" opacity="0.5"/>`;
    case 'pump':
      return `<rect x="176" y="220" width="148" height="182" rx="22" ${f}/>
              <rect x="228" y="148" width="44" height="76" rx="10" fill="${c}" opacity="0.6"/>
              <rect x="212" y="128" width="86" height="26" rx="13" fill="${c}" opacity="0.6"/>`;
    case 'compact':
      return `<circle cx="250" cy="290" r="108" ${f}/>
              <circle cx="250" cy="290" r="72" fill="#fff" opacity="0.35"/>`;
    default: // dropper / bottle
      return `<rect x="188" y="210" width="124" height="196" rx="20" ${f}/>
              <rect x="222" y="136" width="56" height="80" rx="12" fill="${c}" opacity="0.6"/>
              <rect x="214" y="120" width="72" height="24" rx="12" fill="${c}" opacity="0.75"/>`;
  }
}

function makePlaceholder(slug, brand, name, kind, seed) {
  const [bg1, bg2, accent] = PALETTES[seed % PALETTES.length];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500" width="500" height="500" role="img" aria-label="${esc(name)}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${bg1}"/><stop offset="1" stop-color="${bg2}"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.42" r="0.55">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.85"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="500" height="500" fill="url(#g)"/>
  <circle cx="250" cy="270" r="170" fill="url(#glow)"/>
  <ellipse cx="250" cy="418" rx="120" ry="16" fill="${accent}" opacity="0.16"/>
  ${shapeFor(kind, accent)}
  <text x="250" y="62" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif"
        font-size="21" letter-spacing="4" fill="${accent}" opacity="0.85">${esc(brand.toUpperCase())}</text>
  <text x="250" y="466" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif"
        font-size="16" letter-spacing="1.5" fill="${accent}" opacity="0.6">KOREAN BEAUTY · NUKUS</text>
</svg>`;
  const file = `${slug}.svg`;
  fs.writeFileSync(path.join(IMG_DIR, file), svg, 'utf8');
  return `/img/products/${file}`;
}

/* ------------------------------------------------------------------ */
/*  Справочники                                                        */
/* ------------------------------------------------------------------ */
const CATEGORIES = [
  ['Очищение',            'cleansing',  '🫧', 'Гидрофильные масла, пенки и гели для двойного очищения', 10],
  ['Тонеры и эссенции',   'toners',     '💧', 'Восстановление pH, увлажнение и подготовка кожи',        20],
  ['Сыворотки',           'serums',     '🧪', 'Концентрированный уход за конкретной задачей',           30],
  ['Кремы и увлажнение',  'moisturizers','🪷', 'Кремы, гель-кремы и восстанавливающие бальзамы',        40],
  ['Маски',               'masks',      '🎭', 'Тканевые, глиняные и ночные маски',                      50],
  ['Солнцезащита',        'suncare',    '☀️', 'SPF-средства с лёгкими корейскими текстурами',           60],
  ['Уход за глазами',     'eye-care',   '👁️', 'Патчи и кремы для деликатной зоны вокруг глаз',          70],
  ['Уход за телом',       'body',       '🧴', 'Лосьоны, скрабы и средства для душа',                    80],
  ['Уход за волосами',    'hair',       '💇', 'Шампуни, маски и уходовые масла',                        90],
  ['Декоративная косметика','makeup',   '💄', 'Тинты, кушоны и всё для лёгкого макияжа',               100],
];

const BRANDS = [
  ['COSRX',            'Лаборатория минималистичных формул с доказанной эффективностью'],
  ['Beauty of Joseon', 'Традиционные корейские ингредиенты в современных текстурах'],
  ['SOME BY MI',       'Уход за проблемной кожей и знаменитая линейка AHA-BHA-PHA'],
  ['Anua',             'Мягкие формулы на основе гамамелиса и центеллы'],
  ['Medicube',         'Аптечный подход к домашнему уходу'],
  ['SKIN1004',         'Мадагаскарская центелла в чистом виде'],
  ['Laneige',          'Глубокое увлажнение и культовые ночные маски'],
  ['Innisfree',        'Натуральные ингредиенты острова Чеджу'],
  ['Round Lab',        'Чистые составы с водой Токто и берёзовым соком'],
  ['Torriden',         'Низкомолекулярная гиалуроновая кислота DIVE-IN'],
  ['numbuzin',         'Формулы по номерам для точечного решения задач'],
  ['Isntree',          'Гиалуроновая кислота и мягкие кислотные тонеры'],
  ['Mixsoon',          'Минимализм: один ингредиент — один результат'],
  ['AXIS-Y',           'Уход за тоном кожи и постакне'],
  ['Missha',           'Классика корейского ухода с 2000 года'],
  ["rom&nd",           'Тинты и палетки, ставшие визитной карточкой K-beauty'],
  ['TIRTIR',           'Кушоны с плотным покрытием и уходовым составом'],
  ['Dr.Jart+',         'Дерматологические решения премиум-класса'],
];

const SKIN = { dry: 'dry', oily: 'oily', comb: 'combination', norm: 'normal', sens: 'sensitive' };

/* name, brand, category, price, oldPrice, volume, stock, shape, skin, concerns, short, featured, isNew, sold */
const PRODUCTS = [
  ['Low pH Good Morning Gel Cleanser', 'COSRX', 'cleansing', 89000, 0, '150 мл', 24, 'tube',
    [SKIN.oily, SKIN.comb, SKIN.sens], ['acne', 'pores'],
    'Мягкий утренний гель с pH 5.0 — очищает, не нарушая защитный барьер.', 1, 0, 148],
  ['Green Plum Refreshing Cleanser', 'Beauty of Joseon', 'cleansing', 97000, 115000, '150 мл', 15, 'tube',
    [SKIN.comb, SKIN.oily], ['pores', 'dullness'],
    'Гель с зелёной сливой и AHA-кислотами для свежести и гладкости.', 0, 1, 61],
  ['Radiance Cleansing Balm', 'Beauty of Joseon', 'cleansing', 129000, 0, '100 мл', 18, 'jar',
    [SKIN.dry, SKIN.norm, SKIN.sens], ['dullness', 'dehydration'],
    'Бальзам с рисовыми отрубями растворяет макияж и SPF без ощущения плёнки.', 1, 0, 203],
  ['Heartleaf Pore Control Cleansing Oil', 'Anua', 'cleansing', 139000, 155000, '200 мл', 12, 'pump',
    [SKIN.oily, SKIN.comb], ['pores', 'acne'],
    'Гидрофильное масло с хауттюйнией — растворяет себум в порах.', 1, 0, 267],
  ['Soybean Cleansing Foam', 'Mixsoon', 'cleansing', 78000, 0, '150 мл', 30, 'tube',
    [SKIN.sens, SKIN.dry], ['redness', 'dehydration'],
    'Ферментированные соевые бобы: плотная пена и комфорт после умывания.', 0, 0, 34],

  ['Heartleaf 77% Soothing Toner', 'Anua', 'toners', 149000, 0, '250 мл', 22, 'bottle',
    [SKIN.sens, SKIN.oily, SKIN.comb], ['redness', 'acne', 'pores'],
    'Бестселлер с 77% экстракта хауттюйнии — снимает раздражение за ночь.', 1, 0, 412],
  ['1025 Dokdo Toner', 'Round Lab', 'toners', 132000, 0, '200 мл', 19, 'bottle',
    [SKIN.sens, SKIN.norm, SKIN.dry], ['dehydration', 'redness'],
    'Минеральная вода Токто и берёзовый сок: мягкое ежедневное увлажнение.', 1, 0, 188],
  ['Hyaluronic Acid Toner Plus', 'Isntree', 'toners', 145000, 168000, '200 мл', 14, 'bottle',
    [SKIN.dry, SKIN.norm], ['dehydration'],
    'Пять видов гиалуроновой кислоты для глубокого послойного увлажнения.', 0, 0, 96],
  ['AHA BHA PHA 30 Days Miracle Toner', 'SOME BY MI', 'toners', 128000, 0, '150 мл', 21, 'bottle',
    [SKIN.oily, SKIN.comb], ['acne', 'pores', 'dullness'],
    'Три вида кислот против высыпаний и неровного рельефа.', 0, 0, 175],
  ['Ginseng Essence Water', 'Beauty of Joseon', 'toners', 154000, 0, '150 мл', 9, 'bottle',
    [SKIN.dry, SKIN.norm], ['aging', 'dullness'],
    'Эссенция-вода с корнем женьшеня: питание и упругость.', 0, 1, 72],

  ['Advanced Snail 96 Mucin Power Essence', 'COSRX', 'serums', 165000, 189000, '100 мл', 26, 'pump',
    [SKIN.dry, SKIN.norm, SKIN.sens], ['dehydration', 'redness', 'aging'],
    'Легендарные 96% муцина улитки — восстановление и сияние.', 1, 0, 534],
  ['The Vitamin C 23 Serum', 'Beauty of Joseon', 'serums', 178000, 0, '20 мл', 11, 'dropper',
    [SKIN.norm, SKIN.comb], ['pigment', 'dullness'],
    'Высокая концентрация витамина C для выравнивания тона.', 1, 0, 289],
  ['DIVE-IN Serum', 'Torriden', 'serums', 152000, 0, '50 мл', 17, 'dropper',
    [SKIN.dry, SKIN.sens, SKIN.norm], ['dehydration', 'redness'],
    '5D-гиалуроновая кислота проникает в глубокие слои и удерживает влагу.', 1, 0, 244],
  ['No.5 Vitamin Niacinamide Concentrated Serum', 'numbuzin', 'serums', 171000, 195000, '30 мл', 8, 'dropper',
    [SKIN.comb, SKIN.oily], ['pigment', 'dullness', 'pores'],
    'Ниацинамид и витаминный комплекс против пигментных пятен.', 0, 1, 118],
  ['Dark Spot Correcting Glow Serum', 'AXIS-Y', 'serums', 158000, 0, '50 мл', 13, 'dropper',
    [SKIN.comb, SKIN.oily], ['pigment', 'acne'],
    'Работает с постакне и следами от высыпаний.', 0, 0, 141],
  ['Centella Ampoule', 'SKIN1004', 'serums', 143000, 0, '55 мл', 20, 'dropper',
    [SKIN.sens, SKIN.oily], ['redness', 'acne'],
    'Мадекассосид из мадагаскарской центеллы успокаивает воспаления.', 0, 0, 197],
  ['Collagen Niacinamide 3000 Ampoule', 'Medicube', 'serums', 210000, 245000, '30 мл', 6, 'dropper',
    [SKIN.norm, SKIN.dry], ['aging', 'dehydration'],
    'Коллагеновая ампула для плотности и эластичности кожи.', 0, 0, 88],

  ['Snail 92 All In One Cream', 'COSRX', 'moisturizers', 149000, 0, '100 мл', 23, 'jar',
    [SKIN.dry, SKIN.norm], ['dehydration', 'aging'],
    'Плотный крем-гель с муцином для восстановления барьера.', 1, 0, 312],
  ['Water Bank Blue Hyaluronic Cream', 'Laneige', 'moisturizers', 289000, 320000, '50 мл', 7, 'jar',
    [SKIN.dry, SKIN.norm, SKIN.sens], ['dehydration'],
    'Голубая гиалуроновая кислота: увлажнение на 100 часов.', 1, 0, 156],
  ['Dynasty Cream', 'Beauty of Joseon', 'moisturizers', 172000, 0, '50 мл', 16, 'jar',
    [SKIN.dry, SKIN.norm], ['aging', 'dullness'],
    'Питательный крем с рисом и женьшенем для вечернего ухода.', 0, 0, 129],
  ['Madagascar Centella Ampoule Foam Cream', 'SKIN1004', 'moisturizers', 138000, 0, '75 мл', 18, 'tube',
    [SKIN.oily, SKIN.comb, SKIN.sens], ['redness', 'acne'],
    'Лёгкая пенная текстура, не забивает поры.', 0, 1, 64],
  ['Ceramidin Cream', 'Dr.Jart+', 'moisturizers', 315000, 0, '50 мл', 5, 'jar',
    [SKIN.dry, SKIN.sens], ['dehydration', 'redness'],
    'Пять церамидов для сухой и обезвоженной кожи зимой.', 0, 0, 77],

  ['Bija Trouble Pink Clay Mask', 'Innisfree', 'masks', 118000, 0, '100 мл', 14, 'jar',
    [SKIN.oily, SKIN.comb], ['acne', 'pores'],
    'Розовая глина с биджей вытягивает загрязнения из пор.', 0, 0, 92],
  ['Lip Sleeping Mask Berry', 'Laneige', 'masks', 132000, 148000, '20 г', 25, 'jar',
    [SKIN.dry, SKIN.norm, SKIN.sens], ['dehydration'],
    'Культовая ночная маска для губ с ягодным ароматом.', 1, 0, 421],
  ['Heartleaf Silky Moisture Sheet Mask', 'Anua', 'masks', 22000, 0, '1 шт · 25 мл', 60, 'pouch',
    [SKIN.sens, SKIN.norm], ['redness', 'dehydration'],
    'Тканевая маска на каждый день — успокаивает после солнца.', 0, 0, 388],
  ['Snail Truecica Miracle Repair Sheet Mask', 'SOME BY MI', 'masks', 26000, 0, '1 шт · 25 мл', 45, 'pouch',
    [SKIN.comb, SKIN.oily], ['acne', 'pigment'],
    'Муцин и труецика для восстановления после высыпаний.', 0, 0, 214],

  ['Relief Sun: Rice + Probiotics SPF50+', 'Beauty of Joseon', 'suncare', 118000, 0, '50 мл', 32, 'tube',
    [SKIN.norm, SKIN.dry, SKIN.sens], ['pigment', 'dullness'],
    'Самый популярный корейский SPF: без белых следов и липкости.', 1, 0, 671],
  ['Birch Juice Moisturizing Sun Cream SPF50+', 'Round Lab', 'suncare', 126000, 0, '50 мл', 20, 'tube',
    [SKIN.dry, SKIN.sens], ['dehydration'],
    'Увлажняющий SPF с берёзовым соком для сухой кожи.', 0, 0, 183],
  ['Hyaluronic Watery Sun Gel SPF50+', 'Isntree', 'suncare', 134000, 152000, '50 мл', 11, 'tube',
    [SKIN.oily, SKIN.comb], ['dehydration', 'pores'],
    'Водянистый гель-SPF, идеален под макияж.', 0, 1, 97],

  ['Zero Pore Pad 2.0', 'Medicube', 'eye-care', 175000, 0, '70 шт', 10, 'jar',
    [SKIN.oily, SKIN.comb], ['pores', 'acne'],
    'Пэды с кислотами для сужения пор и матовости.', 0, 0, 121],
  ['Ginseng Eye Cream', 'Beauty of Joseon', 'eye-care', 149000, 0, '30 мл', 15, 'tube',
    [SKIN.dry, SKIN.norm], ['aging', 'dehydration'],
    'Плотный крем для зоны вокруг глаз с женьшенем.', 1, 0, 164],
  ['Collagen Jelly Cream Eye Patch', 'Medicube', 'eye-care', 138000, 160000, '60 шт', 9, 'jar',
    [SKIN.norm, SKIN.dry], ['aging', 'dehydration'],
    'Гидрогелевые патчи с коллагеном против отёков утром.', 0, 0, 108],

  ['Rice Daily Body Lotion', 'Round Lab', 'body', 112000, 0, '400 мл', 13, 'pump',
    [SKIN.dry, SKIN.sens], ['dehydration'],
    'Рисовый лосьон для тела: впитывается за минуту.', 0, 0, 58],
  ['Green Tea Body Wash', 'Innisfree', 'body', 96000, 0, '300 мл', 17, 'pump',
    [SKIN.norm, SKIN.oily], ['dullness'],
    'Гель для душа с зелёным чаем Чеджу.', 0, 0, 41],

  ['Camellia Essential Hair Oil', 'Innisfree', 'hair', 128000, 0, '100 мл', 12, 'dropper',
    [SKIN.norm, SKIN.dry], ['dullness'],
    'Масло камелии для секущихся кончиков и блеска.', 0, 0, 74],
  ['Damaged Hair Treatment Mask', 'Missha', 'hair', 105000, 125000, '200 мл', 10, 'jar',
    [SKIN.norm, SKIN.dry], ['dehydration'],
    'Восстанавливающая маска для окрашенных волос.', 0, 0, 52],

  ['Juicy Lasting Tint', "rom&nd", 'makeup', 89000, 0, '5.5 г', 34, 'bottle',
    [SKIN.norm, SKIN.dry], ['dullness'],
    'Сочный тинт со стойким глянцевым финишем — 20+ оттенков.', 1, 0, 496],
  ['Better Than Eyes Palette', "rom&nd", 'makeup', 168000, 185000, '7 г', 8, 'compact',
    [SKIN.norm], ['dullness'],
    'Нюдовая палетка теней для повседневного макияжа.', 0, 0, 133],
  ['Mask Fit Red Cushion SPF40', 'TIRTIR', 'makeup', 215000, 0, '18 г', 12, 'compact',
    [SKIN.norm, SKIN.comb], ['pigment'],
    'Кушон с плотным покрытием, который не отпечатывается.', 1, 1, 302],
  ['Perfect Cover BB Cream №23', 'Missha', 'makeup', 118000, 0, '50 мл', 21, 'tube',
    [SKIN.norm, SKIN.comb], ['pigment', 'dullness'],
    'Классический BB-крем, продан десятками миллионов флаконов.', 0, 0, 227],
];

/* ------------------------------------------------------------------ */
async function seed() {
  await db.init();

  const { n: existing } = await db.get('SELECT COUNT(*) AS n FROM products');
  const { n: orders } = await db.get('SELECT COUNT(*) AS n FROM orders');

  if (existing > 0 && !FORCE) {
    console.log(`Каталог уже содержит ${existing} товаров. Демо-товары добавляются только в пустой каталог.`);
    return;
  }

  /* reset стирает и заказы. На локальной базе это удобно для разработки,
     на удалённой (Turso) — это боевые заказы покупателей. */
  if (FORCE && db.isRemote && !CONFIRM_REMOTE) {
    console.error(`
  ОСТАНОВЛЕНО: база удалённая — ${db.describe()}
  В ней ${orders} заказов и ${existing} товаров. npm run reset удалит их безвозвратно.

  Вероятно, в .env указан адрес боевой базы. Для разработки уберите KB_DB_URL.
  Если действительно нужно стереть боевую базу:
    npm run reset delete-production-orders
`);
    process.exitCode = 1;
    return;
  }

  const statements = [];
  if (FORCE) {
    statements.push(
      ['DELETE FROM order_items'], ['DELETE FROM orders'],
      ['DELETE FROM product_images'], ['DELETE FROM products'],
      ['DELETE FROM brands'], ['DELETE FROM categories'],
    );
  }

  /* Разделы и бренды — INSERT OR IGNORE по уникальному slug: повторный запуск не дублирует */
  CATEGORIES.forEach(([name, slug, icon, description, sort]) => {
    statements.push(['INSERT OR IGNORE INTO categories(name, name_lc, slug, icon, description, sort_order) VALUES(?, ?, ?, ?, ?, ?)',
      name, db.lc(name), slug, icon, description, sort]);
  });

  const brandSlug = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  BRANDS.forEach(([name, description], i) => {
    statements.push(['INSERT OR IGNORE INTO brands(name, name_lc, slug, description, sort_order) VALUES(?, ?, ?, ?, ?)',
      name, db.lc(name), brandSlug(name), description, i * 10]);
  });

  /* Товары ссылаются на раздел и бренд по slug — без промежуточных запросов за id */
  PRODUCTS.forEach((p, i) => {
    const [name, brand, cat, price, oldPrice, volume, stock, shape, skin, concerns, short, featured, isNew, sold] = p;
    const slug = `${brand} ${name}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70);
    const description = `${short}\n\n${name} от ${brand} — часть ассортимента Korean Beauty в Нукусе. Товар привезён напрямую из Кореи, оригинальность подтверждена. Объём: ${volume}.`;

    statements.push([
      `INSERT OR IGNORE INTO products(name, slug, brand_id, category_id, short_desc, description, ingredients,
         how_to_use, volume, price, old_price, stock, skin_types, concerns, rating, sold_count,
         is_active, is_featured, is_new, search_text)
       VALUES(?, ?, (SELECT id FROM brands WHERE slug = ?), (SELECT id FROM categories WHERE slug = ?),
              ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
      name, slug, brandSlug(brand), cat, short, description,
      'Полный состав указан на упаковке. Средство не тестируется на животных, без спирта в первых позициях состава.',
      'Нанесите на очищенную кожу утром и вечером, распределите лёгкими движениями до впитывания.',
      volume, price, oldPrice, stock, skin.join(','), concerns.join(','),
      Math.round((4.5 + (i % 5) * 0.1) * 10) / 10, sold, featured, isNew,
      db.searchText({ name, short_desc: short, description, volume }),
    ]);

    const url = makePlaceholder(slug, brand, name, shape, i);
    statements.push([
      `INSERT INTO product_images(product_id, url, sort_order)
       SELECT id, ?, 0 FROM products WHERE slug = ?
         AND NOT EXISTS (SELECT 1 FROM product_images WHERE product_id = products.id)`,
      url, slug,
    ]);
  });

  /* Всё одним атомарным пакетом: либо каталог заполнен целиком, либо не тронут */
  await db.batch(statements);

  const admin = await ensureDefaultAdmin();
  const count = async (t) => (await db.get(`SELECT COUNT(*) AS n FROM ${t}`)).n;
  console.log(`✓ База:     ${db.describe()}`);
  console.log(`✓ Разделов: ${await count('categories')}`);
  console.log(`✓ Брендов:  ${await count('brands')}`);
  console.log(`✓ Товаров:  ${await count('products')}`);
  if (admin) console.log(`✓ Админ: ${admin.username} / ${admin.password}`);
  console.log('\nЗапустите: npm start');
}

/* Запускаем заполнение только при прямом вызове файла.
   При require из других скриптов отдаём данные для переиспользования. */
if (require.main === module) {
  seed()
    .catch((e) => { console.error('Заполнение не выполнено:', e.message); process.exitCode = 1; })
    .finally(() => db.close());
}

module.exports = { PRODUCTS, CATEGORIES, BRANDS, seed };
