'use strict';
/**
 * Удаление демо-товаров перед запуском магазина.
 *
 *   npm run demo:clear            — только показать, что будет удалено
 *   npm run demo:clear yes        — удалить (перед этим сделает резервную копию)
 *
 * Работает с той базой, что указана в настройках: локальной или Turso.
 *
 * Что считается демо: товары, у которых ВСЕ фото — заглушки из /img/products/.
 *
 * Что НЕ трогается:
 *   • товары, добавленные вами (со своими фото или без фото вообще);
 *   • заказы — в них хранятся название и цена на момент покупки;
 *   • разделы, бренды, настройки, пароль, подключение Telegram.
 */
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const db = require('./db');
const cli = require('./cli');

const YES = cli.flag('yes');
const Y = '\x1b[33m'; const G = '\x1b[32m'; const R = '\x1b[31m'; const B = '\x1b[1m'; const D = '\x1b[0m';

(async () => {
  await db.init();

  /* Демо = есть фото, и все они заглушки. Товар без фото демо не считается:
     его завели вручную и просто ещё не сфотографировали. */
  const demo = await db.all(`
    SELECT p.id, p.name, b.name AS brand
    FROM products p
    LEFT JOIN brands b ON b.id = p.brand_id
    WHERE EXISTS (SELECT 1 FROM product_images i WHERE i.product_id = p.id)
      AND NOT EXISTS (SELECT 1 FROM product_images i
                      WHERE i.product_id = p.id AND i.url NOT LIKE '/img/products/%')
    ORDER BY b.name, p.name`);

  const { n: total } = await db.get('SELECT COUNT(*) AS n FROM products');
  const { n: orders } = await db.get('SELECT COUNT(*) AS n FROM orders');

  console.log(`\n${B}Демо-товары${D} · ${db.describe()}`);
  console.log('─'.repeat(56));

  if (!demo.length) {
    console.log(`  ${G}Демо-товаров нет — каталог уже ваш.${D}\n`);
    return;
  }

  for (const p of demo.slice(0, 12)) console.log(`  • ${p.brand ? p.brand + ' — ' : ''}${p.name}`);
  if (demo.length > 12) console.log(`  … и ещё ${demo.length - 12}`);

  console.log('─'.repeat(56));
  console.log(`  Будет удалено товаров:  ${R}${demo.length}${D}`);
  console.log(`  Останется ваших:        ${G}${total - demo.length}${D}`);
  console.log(`  Заказы:                 ${G}${orders} — не трогаются${D}`);
  console.log('  Разделы, бренды, настройки, Telegram — не трогаются');

  if (!YES) {
    console.log(`\n  ${Y}Это предварительный просмотр, ничего не удалено.${D}`);
    if (cli.swallowedYes()) console.log(`\n  ${R}PowerShell не передал --yes.${D} Пишите без дефисов:`);
    console.log(`  Чтобы удалить: ${B}npm run demo:clear yes${D}\n`);
    return;
  }

  /* Страховка: копия базы до удаления. Не получилась — не удаляем. */
  console.log('\n  Делаю резервную копию перед удалением…');
  try {
    execFileSync(process.execPath, ['--no-warnings', path.join(__dirname, 'backup.js')], { stdio: 'pipe' });
    console.log(`  ${G}Копия готова${D} — данные можно вернуть командой npm run db:push.`);
  } catch (e) {
    console.error(`\n  ${R}Резервная копия не удалась — удаление отменено.${D}`);
    console.error(`  ${String(e.stderr || e.message).trim()}\n`);
    process.exitCode = 1;
    return;
  }

  /* Одним пакетом: либо удалено всё, либо ничего. Фото удаляем явно —
     на удалённой базе каскадное удаление может быть не включено. */
  const ids = demo.map((p) => p.id);
  const marks = ids.map(() => '?').join(',');
  await db.batch([
    [`DELETE FROM product_images WHERE product_id IN (${marks})`, ...ids],
    [`DELETE FROM products WHERE id IN (${marks})`, ...ids],
  ]);

  const { n: left } = await db.get('SELECT COUNT(*) AS n FROM products');
  const { n: ordersAfter } = await db.get('SELECT COUNT(*) AS n FROM orders');
  console.log(`\n  ${G}${B}Готово.${D} Удалено ${demo.length}, в каталоге осталось ${left}, заказов ${ordersAfter}.`);
  console.log('  Добавляйте свои товары: админ-панель → Товары → «+ Добавить товар».\n');
})()
  .catch((e) => { console.error(`\n  ${R}Ошибка, ничего не удалено: ${e.message}${D}\n`); process.exitCode = 1; })
  .finally(() => db.close());
