'use strict';
/**
 * Перенос данных магазина в базу из настроек (обычно — в Turso).
 *
 *   npm run db:push                          — показать, что и куда будет перенесено
 *   npm run db:push yes                      — перенести data/shop.db в базу из KB_DB_URL
 *   npm run db:push yes from=ФАЙЛ            — восстановить из резервной копии
 *   npm run db:push yes replace              — база не пуста: сделать её копию, очистить и заменить
 *
 * Флаги пишутся без дефисов — так они доходят до скрипта и в PowerShell (см. cli.js).
 *
 * Переносится всё: товары, разделы, бренды, заказы, настройки (включая
 * подключённый Telegram-бот), пароль администратора и фото. Номера записей
 * сохраняются, поэтому связи «заказ — позиции» и «товар — фото» не ломаются.
 *
 * Защиты:
 *   • без yes ничего не пишет;
 *   • в непустую базу не пишет без replace — и перед заменой делает её копию;
 *   • в конце сверяет число записей в каждой таблице.
 */
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { DatabaseSync } = require('node:sqlite');
const { fileURLToPath } = require('node:url');
const config = require('./config');
const db = require('./db');
const cli = require('./cli');

const YES = cli.flag('yes');
const REPLACE = cli.flag('replace');
const SOURCE = path.resolve(cli.option('from') || path.join(config.dataDir, 'shop.db'));

const G = '\x1b[32m'; const Y = '\x1b[33m'; const R = '\x1b[31m'; const B = '\x1b[1m'; const D = '\x1b[0m';

/* Порядок важен: сначала справочники, потом то, что на них ссылается */
const TABLES = ['brands', 'categories', 'products', 'product_images', 'orders', 'order_items', 'admins', 'settings', 'media'];
const CHUNK = { media: 4, default: 60 };

const q = (name) => `"${name.replace(/"/g, '""')}"`;
const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(2)} МБ`;

(async () => {
  if (!fs.existsSync(SOURCE)) throw new Error(`Нет файла базы: ${SOURCE}`);

  /* Цель — файл? Тогда какой именно: из KB_DB_URL, а без него — data/shop.db */
  const targetFile = (() => {
    if (db.isRemote) return null;
    if (!config.dbUrl) return path.resolve(config.dataDir, 'shop.db');
    try { return path.resolve(fileURLToPath(config.dbUrl)); } catch { return path.resolve(config.dbUrl.replace(/^file:/, '')); }
  })();
  if (targetFile && targetFile.toLowerCase() === SOURCE.toLowerCase()) {
    throw new Error('Источник и цель — один и тот же файл. Задайте KB_DB_URL (адрес Turso) в .env или окружении.');
  }

  /* ---------- источник ---------- */
  const src = new DatabaseSync(SOURCE, { readOnly: true });
  const srcTables = new Set(src.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((r) => r.name));
  const srcCols = (t) => src.prepare(`SELECT name FROM pragma_table_info('${t}')`).all().map((r) => r.name);
  const srcCount = (t) => (srcTables.has(t) ? src.prepare(`SELECT COUNT(*) AS n FROM ${q(t)}`).get().n : 0);

  /* Фото, которые в старых версиях лежали файлами в data/uploads */
  const uploadsDir = path.join(path.dirname(SOURCE), 'uploads');
  const knownMedia = new Set(srcTables.has('media') ? src.prepare('SELECT name FROM media').all().map((r) => r.name) : []);
  const legacyFiles = fs.existsSync(uploadsDir)
    ? fs.readdirSync(uploadsDir).filter((f) => /^[\w.-]+\.(jpe?g|png|webp|gif|avif)$/i.test(f) && !knownMedia.has(f))
    : [];

  /* ---------- цель ---------- */
  await db.init();
  const targetBefore = {};
  for (const t of TABLES) targetBefore[t] = (await db.get(`SELECT COUNT(*) AS n FROM ${q(t)}`)).n;
  const targetHasData = targetBefore.products > 0 || targetBefore.orders > 0 || targetBefore.admins > 0;

  console.log(`\n${B}Перенос данных магазина${D}`);
  console.log('─'.repeat(64));
  console.log(`  Откуда: ${SOURCE}`);
  console.log(`  Куда:   ${db.describe()}`);
  console.log('─'.repeat(64));
  console.log('  Таблица          в источнике   сейчас в цели');
  for (const t of TABLES) {
    console.log(`  ${t.padEnd(16)} ${String(srcCount(t)).padStart(11)}   ${String(targetBefore[t]).padStart(13)}`);
  }
  if (legacyFiles.length) console.log(`  + фото-файлов из ${path.relative(process.cwd(), uploadsDir)}: ${legacyFiles.length}`);
  console.log('─'.repeat(64));

  const settings = srcTables.has('settings')
    ? Object.fromEntries(src.prepare('SELECT key, value FROM settings').all().map((r) => [r.key, r.value])) : {};
  if (settings.telegram_bot_username) console.log(`  Telegram-бот: @${settings.telegram_bot_username} — перенесётся вместе с настройками`);

  if (targetHasData && !REPLACE) {
    console.log(`\n  ${R}В целевой базе уже есть данные — перенос остановлен.${D}`);
    console.log('  Если это боевая база с заказами покупателей, ничего не делайте.');
    console.log(`  Если нужно заменить её содержимое: ${B}npm run db:push yes replace${D}`);
    console.log('  (перед заменой будет сделана резервная копия текущей базы)\n');
    process.exitCode = 1;
    return;
  }

  if (!YES) {
    console.log(`\n  ${Y}Это предварительный просмотр, ничего не записано.${D}`);
    if (cli.swallowedYes()) console.log(`\n  ${R}PowerShell не передал --yes.${D} Пишите без дефисов:`);
    console.log(`  Чтобы перенести: ${B}npm run db:push yes${REPLACE ? ' replace' : ''}${D}\n`);
    return;
  }

  /* ---------- замена: сначала копия того, что там сейчас ---------- */
  if (targetHasData && REPLACE) {
    console.log('\n  Делаю резервную копию целевой базы перед заменой…');
    try {
      execFileSync(process.execPath, ['--no-warnings', path.join(__dirname, 'backup.js')], { stdio: 'pipe' });
      console.log(`  ${G}Копия готова${D}`);
    } catch (e) {
      throw new Error(`резервная копия целевой базы не удалась, замена отменена: ${String(e.stderr || e.message).trim()}`);
    }
    await db.batch([...TABLES].reverse().map((t) => [`DELETE FROM ${q(t)}`]));
  }

  /* ---------- перенос ---------- */
  console.log('');
  const t0 = Date.now();
  let mediaBytes = 0;

  for (const t of TABLES) {
    if (!srcTables.has(t)) continue;
    const targetCols = new Set(await db.columnsOf(t));
    /* Только общие столбцы: старая копия могла быть без новых полей — их досчитаем */
    const cols = srcCols(t).filter((c) => targetCols.has(c));
    const hasRowid = t === 'media';                         // у media ключ — имя, rowid переносим явно
    const selectCols = (hasRowid ? ['rowid AS __rowid', ...cols.map(q)] : cols.map(q)).join(', ');
    const insertCols = (hasRowid ? ['rowid', ...cols] : cols).map(q).join(', ');
    const placeholders = (hasRowid ? ['?', ...cols] : cols).map(() => '?').join(', ');

    const size = CHUNK[t] || CHUNK.default;
    const total = srcCount(t);
    let done = 0;
    const stmt = src.prepare(`SELECT ${selectCols} FROM ${q(t)} ORDER BY rowid LIMIT ? OFFSET ?`);

    while (done < total) {
      const rows = stmt.all(size, done);
      if (!rows.length) break;
      await db.batch(rows.map((row) => {
        const values = (hasRowid ? ['__rowid', ...cols] : cols).map((c) => {
          const v = row[c];
          if (v instanceof Uint8Array) { mediaBytes += v.length; return Buffer.from(v); }
          return v;
        });
        return [`INSERT INTO ${q(t)} (${insertCols}) VALUES (${placeholders})`, ...values];
      }));
      done += rows.length;
      process.stdout.write(`\r  ${t.padEnd(16)} ${done} из ${total}   `);
    }
    process.stdout.write(`\r  ${G}✓${D} ${t.padEnd(14)} ${total}${' '.repeat(12)}\n`);
  }

  /* Старые фото-файлы — в таблицу media */
  for (let i = 0; i < legacyFiles.length; i++) {
    const name = legacyFiles[i];
    const buf = fs.readFileSync(path.join(uploadsDir, name));
    const ext = path.extname(name).toLowerCase();
    const mime = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif', '.avif': 'image/avif' }[ext];
    await db.run('INSERT OR IGNORE INTO media(name, mime, size, data) VALUES(?, ?, ?, ?)', name, mime, buf.length, buf);
    mediaBytes += buf.length;
    process.stdout.write(`\r  фото-файлы        ${i + 1} из ${legacyFiles.length}   `);
  }
  if (legacyFiles.length) process.stdout.write(`\r  ${G}✓${D} фото-файлы     ${legacyFiles.length}${' '.repeat(12)}\n`);

  const filled = await db.backfillSearch();
  if (filled) console.log(`  ${G}✓${D} строки поиска досчитаны: ${filled}`);

  /* ---------- сверка ---------- */
  console.log('\n  Сверка:');
  let mismatch = 0;
  for (const t of TABLES) {
    if (!srcTables.has(t)) continue;
    const expected = srcCount(t) + (t === 'media' ? legacyFiles.length : 0);
    const actual = (await db.get(`SELECT COUNT(*) AS n FROM ${q(t)}`)).n;
    const okRow = actual === expected;
    if (!okRow) mismatch++;
    console.log(`    ${okRow ? `${G}✓${D}` : `${R}✗${D}`} ${t.padEnd(16)} ${actual} из ${expected}`);
  }
  src.close();

  console.log('─'.repeat(64));
  if (mismatch) throw new Error(`не совпало таблиц: ${mismatch}. Данные в источнике не тронуты — запустите перенос ещё раз: npm run db:push yes replace`);

  console.log(`  ${G}${B}Перенос завершён${D} за ${((Date.now() - t0) / 1000).toFixed(1)} с${mediaBytes ? `, фото: ${mb(mediaBytes)}` : ''}.`);
  console.log('  Пароль администратора — тот же, что был в источнике.\n');
})()
  .catch((e) => { console.error(`\n  ${R}Перенос не выполнен: ${e.message}${D}\n`); process.exitCode = 1; })
  .finally(() => db.close());
