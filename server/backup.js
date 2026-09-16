'use strict';
/**
 * Резервная копия магазина.
 *
 *   npm run backup
 *
 * Скачивает базу — локальную или Turso — в обычный файл SQLite на этом
 * компьютере: backups/shop-ГГГГ-ММ-ДД_ЧЧ-ММ-СС.db. Фото хранятся в базе,
 * поэтому копия полная: товары, заказы, настройки и снимки.
 *
 * Для копии боевой базы запускайте на своём компьютере с KB_DB_URL
 * и KB_DB_TOKEN от Turso (в .env). Turso сам хранит историю изменений
 * за последние сутки, но копия у вас — это защита на случай, если
 * пропадёт доступ к аккаунту или ошибку заметят позже.
 *
 * Хранится KB_BACKUP_KEEP последних копий (по умолчанию 14).
 */
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const config = require('./config');
const db = require('./db');

const OUT = config.backupDir;
/* Фото переносим небольшими порциями: каждая строка может весить сотни КБ */
const MEDIA_PAGE = 20;

const stamp = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
};
const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(2)} МБ`;
const quoteIdent = (name) => `"${String(name).replace(/"/g, '""')}"`;

async function snapshot() {
  await db.init();
  fs.mkdirSync(OUT, { recursive: true });

  const target = path.join(OUT, `shop-${stamp()}.db`);
  const tmp = `${target}.part`;
  fs.rmSync(tmp, { force: true });

  /* Схема источника: сначала таблицы, потом индексы */
  const schema = await db.all(`
    SELECT type, name, sql FROM sqlite_master
    WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_litestream%'
    ORDER BY CASE type WHEN 'table' THEN 0 ELSE 1 END, name`);
  const tables = schema.filter((o) => o.type === 'table').map((o) => o.name);
  const dataTables = tables.filter((t) => t !== 'media');

  /* Проверку внешних ключей выключаем: копия переносит данные как есть,
     в любом порядке таблиц и даже если в базе есть осиротевшие записи */
  const out = new DatabaseSync(tmp, { enableForeignKeyConstraints: false });
  const counts = {};
  try {
    out.exec('PRAGMA journal_mode = OFF; PRAGMA synchronous = OFF;');
    for (const o of schema.filter((x) => x.type === 'table')) out.exec(o.sql);

    /* Деловые данные — одним снимком: пакет чтения выполняется атомарно,
       и заказ не окажется в копии без своих позиций, даже если его
       оформили прямо во время копирования */
    const results = await db.client.batch(dataTables.map((t) => `SELECT * FROM ${quoteIdent(t)}`), 'read');

    out.exec('BEGIN');
    dataTables.forEach((t, i) => {
      const rs = results[i];
      counts[t] = rs.rows.length;
      if (!rs.rows.length) return;
      const cols = rs.columns.map(quoteIdent).join(', ');
      const stmt = out.prepare(`INSERT INTO ${quoteIdent(t)} (${cols}) VALUES (${rs.columns.map(() => '?').join(', ')})`);
      for (const row of rs.rows) stmt.run(...rs.columns.map((_, ci) => row[ci]));
    });
    out.exec('COMMIT');

    /* Фото — порциями по rowid. Они не меняются после загрузки, поэтому
       отдельный снимок им не нужен */
    if (tables.includes('media')) {
      const stmt = out.prepare('INSERT INTO media (rowid, name, mime, size, data, created_at) VALUES (?, ?, ?, ?, ?, ?)');
      let last = 0; counts.media = 0; let bytes = 0;
      for (;;) {
        const page = await db.all(
          'SELECT rowid AS rid, name, mime, size, data, created_at FROM media WHERE rowid > ? ORDER BY rowid LIMIT ?',
          last, MEDIA_PAGE);
        if (!page.length) break;
        out.exec('BEGIN');
        for (const m of page) {
          const buf = Buffer.from(m.data);
          stmt.run(m.rid, m.name, m.mime, m.size, buf, m.created_at);
          bytes += buf.length;
        }
        out.exec('COMMIT');
        counts.media += page.length;
        last = page[page.length - 1].rid;
      }
      counts.mediaBytes = bytes;
    }

    for (const o of schema.filter((x) => x.type !== 'table')) out.exec(o.sql);

    /* Копия, которую нельзя открыть, хуже её отсутствия: создаёт ложную уверенность */
    const verdict = Object.values(out.prepare('PRAGMA integrity_check').get())[0];
    if (verdict !== 'ok') throw new Error(`копия повреждена: ${verdict}`);
  } finally {
    out.close();
  }

  fs.renameSync(tmp, target);
  return { target, size: fs.statSync(target).size, counts };
}

function rotate() {
  const snapshots = fs.readdirSync(OUT)
    .filter((f) => /^shop-\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.db$/.test(f))
    .sort().reverse();
  const removed = snapshots.slice(config.backupKeep);
  for (const f of removed) fs.rmSync(path.join(OUT, f), { force: true });
  return { kept: Math.min(snapshots.length, config.backupKeep), removed: removed.length };
}

(async () => {
  const t0 = Date.now();
  const { target, size, counts } = await snapshot();
  const rot = rotate();

  console.log('\nРезервная копия готова');
  console.log('─'.repeat(56));
  console.log(`  Откуда: ${db.describe()}`);
  console.log(`  Файл:   ${path.basename(target)} (${mb(size)})`);
  console.log(`  Товаров: ${counts.products ?? 0}, заказов: ${counts.orders ?? 0}, фото: ${counts.media ?? 0}` +
    `${counts.mediaBytes ? ` (${mb(counts.mediaBytes)})` : ''}`);
  console.log('  Целостность: ok');
  console.log(`  Хранится копий: ${rot.kept}${rot.removed ? `, удалено старых: ${rot.removed}` : ''}`);
  console.log(`  Папка:  ${OUT}`);
  console.log(`  Время:  ${((Date.now() - t0) / 1000).toFixed(1)} с`);
  console.log('─'.repeat(56));
  console.log('  Храните копию и вне этого компьютера — например, в облачном диске.\n');
  await db.close();
})().catch(async (e) => {
  console.error(`\nРезервное копирование НЕ выполнено: ${e.message}\n`);
  await db.close();
  process.exit(1);
});
