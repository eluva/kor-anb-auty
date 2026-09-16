'use strict';
/**
 * Разбор флагов служебных команд.
 *
 * В PowerShell `npm run demo:clear -- --yes` до скрипта не доходит: npm.ps1
 * теряет `--`, и npm забирает `--yes` себе. Команда молча выполнилась бы
 * как предпросмотр. Поэтому флаги понимаются в обеих записях:
 *
 *   npm run demo:clear yes              — работает везде, так и пишем в инструкциях
 *   npm run demo:clear -- --yes         — Git Bash, cmd
 *   node server/demo-clear.js --yes     — напрямую
 */
const args = process.argv.slice(2).map((a) => a.replace(/^--?/, ''));

/** Флаг без значения: yes, --yes */
const flag = (name) => args.includes(name);

/** Параметр со значением: from=ФАЙЛ, --from=ФАЙЛ */
function option(name) {
  const hit = args.find((a) => a.startsWith(`${name}=`));
  return hit === undefined ? undefined : hit.slice(name.length + 1);
}

/* npm сам выставляет npm_config_yes, когда проглотил --yes из PowerShell.
   Подтверждением это не считаем (так бывает и от настроек npm), только подсказываем. */
const swallowedYes = () => !flag('yes') && process.env.npm_config_yes === 'true';

module.exports = { flag, option, swallowedYes };
