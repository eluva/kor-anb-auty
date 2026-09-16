'use strict';
/**
 * Смена пароля администратора из командной строки.
 *
 *   npm run password                  — сгенерирует надёжный пароль
 *   npm run password -- мойпароль123  — поставит указанный
 *
 * Работает и с локальной базой, и с Turso: для Turso задайте KB_DB_URL
 * и KB_DB_TOKEN (в .env или в окружении). Нужно, если пароль забыт —
 * через админку его уже не сменить.
 */
const db = require('./db');
const auth = require('./auth');

(async () => {
  await db.init();
  await auth.ensureDefaultAdmin();

  const admin = await db.get('SELECT id, username FROM admins ORDER BY id LIMIT 1');
  if (!admin) throw new Error('Администратор не найден');

  const given = process.argv.slice(2).filter((a) => !a.startsWith('-')).join(' ').trim();
  if (given && given.length < 8) throw new Error('Пароль слишком короткий — нужно минимум 8 символов.');

  const password = given || auth.randomPassword();
  await db.run('UPDATE admins SET password_hash = ? WHERE id = ?', auth.hashPassword(password), admin.id);

  const line = '─'.repeat(52);
  console.log(`\n${line}`);
  console.log('  Пароль администратора изменён');
  console.log(`  База: ${db.describe()}`);
  console.log(line);
  console.log(`  Логин:  \x1b[1m${admin.username}\x1b[0m`);
  console.log(`  Пароль: \x1b[1m${password}\x1b[0m`);
  console.log(line);
  console.log('  Сохраните пароль — второй раз он не покажется.\n');
  await db.close();
})().catch(async (e) => {
  console.error(`\nПароль не изменён: ${e.message}\n`);
  await db.close();
  process.exit(1);
});
