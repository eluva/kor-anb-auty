'use strict';
/**
 * Предстартовая проверка: готов ли магазин к выкатке.
 *
 *   npm run preflight
 *
 * Ничего не меняет — только смотрит и говорит, что осталось сделать.
 * Пункты ✗ дают код выхода 1: удобно, чтобы не выпустить магазин с дырой.
 */
const fs = require('node:fs');
const path = require('node:path');
const config = require('./config');

const G = '\x1b[32m'; const Y = '\x1b[33m'; const R = '\x1b[31m'; const B = '\x1b[1m'; const D = '\x1b[0m';
const results = { fail: 0, warn: 0, ok: 0 };

const pass = (msg, note = '') => { results.ok++; console.log(`  ${G}✓${D} ${msg}${note ? ` — ${note}` : ''}`); };
const warn = (msg, fix) => { results.warn++; console.log(`  ${Y}!${D} ${msg}`); if (fix) console.log(`      ${fix}`); };
const fail = (msg, fix) => { results.fail++; console.log(`  ${R}✗ ${msg}${D}`); if (fix) console.log(`      ${fix}`); };
const section = (t) => console.log(`\n${B}${t}${D}`);
const plural = (n, one, few, many) => {
  const a = Math.abs(n) % 100; const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  return b === 1 ? one : many;
};

(async function run() {
  const db = require('./db');
  const auth = require('./auth');

  console.log(`\n${B}Korean Beauty — готовность к выкатке${D}`);
  console.log(`Режим: ${config.isProd ? 'продакшен' : 'разработка'} · база: ${db.describe()}`);

  /* ---------- окружение ---------- */
  section('Окружение');

  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major > 22 || (major === 22 && minor >= 5)) pass(`Node.js ${process.versions.node}`);
  else fail(`Node.js ${process.versions.node} слишком старый`, 'Нужен 22.5 или новее.');

  if (config.isProd) pass('NODE_ENV=production');
  else warn('NODE_ENV не равен production', 'На сервере задайте NODE_ENV=production: включатся HSTS и журнал запросов.');

  if (config.publicUrl) {
    if (config.publicUrl.startsWith('https://')) pass('публичный адрес', config.publicUrl);
    else fail(`KB_PUBLIC_URL без https: ${config.publicUrl}`, 'Покупатели вводят телефон и адрес — нужен HTTPS.');
  } else {
    warn('не задан KB_PUBLIC_URL', 'Например https://korean-beauty.onrender.com — для превью в Telegram и карты сайта.');
  }

  if (config.trustProxy === true && process.env.VERCEL) {
    pass('доверие прокси', 'vercel — адрес посетителя проставляет Vercel');
  } else if (config.trustProxy === true) {
    fail('KB_TRUST_PROXY=true', 'Любой посетитель подменит свой IP и обойдёт защиту входа. На Render — cloudflare, на VPS — loopback.');
  } else if (process.env.RENDER && typeof config.trustProxy !== 'function') {
    fail(`на Render KB_TRUST_PROXY=${config.trustProxyLabel}`,
      'Все покупательницы будут выглядеть как адрес балансировщика, и лимит заказов начнёт отклонять настоящие заказы. Задайте KB_TRUST_PROXY=cloudflare.');
  } else {
    pass('доверие прокси', config.trustProxyLabel);
  }

  /* ---------- база ---------- */
  section('База данных');

  try {
    await db.init();
    await db.get('SELECT 1');
    pass('подключение', db.describe());
  } catch (e) {
    fail('база недоступна', `${e.message}. Проверьте KB_DB_URL и KB_DB_TOKEN.`);
    return finish();
  }

  /* Бесплатный Render стирает диск при каждом перезапуске: база обязана быть внешней */
  if (config.isProd && !db.isRemote) {
    fail('в продакшене база — локальный файл',
      'На Render файл сотрётся при перезапуске вместе со всеми заказами. Задайте KB_DB_URL и KB_DB_TOKEN от Turso.');
  } else if (db.isRemote) {
    pass('база внешняя — переживёт перезапуск сервера');
  }

  if (!db.isRemote) {
    try {
      fs.mkdirSync(config.dataDir, { recursive: true });
      const probe = path.join(config.dataDir, '.write-test');
      fs.writeFileSync(probe, 'ok'); fs.rmSync(probe);
      pass('папка данных доступна для записи');
    } catch (e) {
      fail('в папку данных нельзя писать', e.message);
    }
  }

  /* ---------- безопасность ---------- */
  section('Безопасность');

  const admin = await db.get('SELECT * FROM admins ORDER BY id LIMIT 1');
  if (!admin) {
    warn('администратора ещё нет', 'Создастся при первом запуске, пароль напечатается в журнале.');
  } else {
    const weak = ['korean2017', 'admin', 'admin123', '123456', 'password', 'qwerty'];
    const hit = weak.find((pw) => auth.verifyPassword(pw, admin.password_hash));
    if (hit) fail(`пароль администратора — «${hit}»`, 'Смените: npm run password');
    else pass('пароль администратора не из списка стандартных');
  }

  if (config.secret) {
    if (config.secret.length < 32) warn('KB_SECRET короче 32 символов', 'Нужна длинная случайная строка.');
    else pass('ключ сессий из KB_SECRET');
  } else if (db.isRemote) {
    pass('ключ сессий хранится в базе', 'переживёт перезапуск');
  } else {
    pass('ключ сессий — локальный файл');
  }

  const gitignore = fs.existsSync(path.join(config.root, '.gitignore'))
    ? fs.readFileSync(path.join(config.root, '.gitignore'), 'utf8') : '';
  if (/^\.env$/m.test(gitignore)) pass('.env исключён из git');
  else fail('.env не исключён из git', 'Добавьте строку .env в .gitignore — иначе токены уйдут в репозиторий.');
  if (/^data\/$/m.test(gitignore)) pass('данные покупателей исключены из git');
  else fail('data/ не исключена из git', 'В data/ телефоны и адреса покупателей.');

  /* Публичные настройки — белый список. Проверяем, что секретов в нём нет */
  const publicKeys = Object.keys(await db.publicSettings());
  const leaked = publicKeys.filter((k) => /token|secret|chat_id|password/i.test(k));
  if (leaked.length) fail(`секреты в публичных настройках: ${leaked.join(', ')}`);
  else pass('публичные настройки не содержат секретов');

  /* ---------- каталог ---------- */
  section('Каталог');

  const [{ n: total }, { n: demo }, { n: noPhoto }] = await Promise.all([
    db.get('SELECT COUNT(*) AS n FROM products'),
    db.get(`SELECT COUNT(DISTINCT p.id) AS n FROM products p
            JOIN product_images i ON i.product_id = p.id WHERE i.url LIKE '/img/products/%'`),
    db.get(`SELECT COUNT(*) AS n FROM products p WHERE p.is_active = 1
            AND NOT EXISTS (SELECT 1 FROM product_images i WHERE i.product_id = p.id)`),
  ]);

  if (total === 0) warn('каталог пуст', 'Добавьте товары в админ-панели.');
  else pass('товаров в каталоге', String(total));

  if (demo > 0) {
    fail(`${demo} ${plural(demo, 'демо-товар', 'демо-товара', 'демо-товаров')} с выдуманными ценами`,
      'Покупатели закажут то, чего нет. Удалить: npm run demo:clear yes (заказы и ваши товары не тронет).');
  } else if (total > 0) {
    pass('демо-товаров нет');
  }

  if (noPhoto > 0) {
    warn(`${noPhoto} ${plural(noPhoto, 'товар', 'товара', 'товаров')} без фото`, 'Покажутся с заглушкой.');
  }

  /* ---------- контакты и заказы ---------- */
  section('Контакты и заказы');

  const s = await db.allSettings();
  if (s.telegram_bot_token && s.telegram_chat_id) {
    try {
      const info = await require('./notify').getBotInfo(s.telegram_bot_token);
      pass('уведомления о заказах в Telegram', `@${info.username} на связи`);
    } catch (e) {
      fail('бот Telegram не отвечает', `${e.message}. Подключите заново: Настройки → Уведомления о заказах.`);
    }
  } else {
    fail('уведомления о заказах не настроены', 'Настройки → Уведомления о заказах в Telegram.');
  }

  /* Адрес и часы работы при создании магазина заполнены примерными значениями */
  const LABELS = { address: 'адрес', work_hours: 'часы работы' };
  const untouched = Object.keys(LABELS).filter((k) => !s[k] || s[k] === db.DEFAULT_SETTINGS[k]);
  if (untouched.length) warn(`не сверены: ${untouched.map((k) => LABELS[k]).join(', ')}`, 'Настройки → Магазин и контакты.');
  else pass('контакты заполнены');

  /* ---------- резервные копии ---------- */
  section('Резервные копии');

  const backups = fs.existsSync(config.backupDir)
    ? fs.readdirSync(config.backupDir).filter((f) => /^shop-.*\.db$/.test(f)).sort() : [];
  if (!backups.length) {
    warn('резервных копий на этом компьютере нет', 'Сделайте первую: npm run backup');
  } else {
    const last = backups[backups.length - 1];
    const age = (Date.now() - fs.statSync(path.join(config.backupDir, last)).mtimeMs) / 3600000;
    if (age > 24 * 7) warn(`последней копии ${Math.round(age / 24)} дн.`, 'Делайте копию хотя бы раз в неделю: npm run backup');
    else pass('последняя копия', `${last} (${age < 1 ? 'меньше часа' : Math.round(age) + ' ч.'} назад)`);
  }

  return finish();

  async function finish() {
    console.log(`\n${'─'.repeat(56)}`);
    if (results.fail === 0 && results.warn === 0) {
      console.log(`${G}${B}  Всё готово к выкатке${D}`);
    } else {
      console.log(`  ${G}готово: ${results.ok}${D}   ${Y}стоит проверить: ${results.warn}${D}   ${R}блокирует выкатку: ${results.fail}${D}`);
      if (results.fail) console.log(`\n  ${R}Исправьте пункты ✗ перед тем, как открывать магазин покупателям.${D}`);
    }
    console.log(`${'─'.repeat(56)}\n`);
    await db.close();
    process.exitCode = results.fail ? 1 : 0;
  }
})().catch((e) => {
  console.error(`\n${R}Проверка прервалась: ${e.message}${D}\n`);
  process.exitCode = 1;
});
