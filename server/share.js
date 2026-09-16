'use strict';
/**
 * Временная публичная ссылка на локальный магазин (Cloudflare Tunnel).
 *
 *   npm start     — в одном окне
 *   npm run share — в другом
 *
 * Выдаёт адрес вида https://что-то.trycloudflare.com с готовым HTTPS.
 * Ссылка живёт, пока открыто это окно. Ctrl+C — и она перестаёт работать.
 */
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const PORT = Number(process.env.PORT) || 3000;
const TARGET = `http://localhost:${PORT}`;
const TOOLS = path.join(__dirname, '..', 'tools');
const BIN = path.join(TOOLS, process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared');

const DOWNLOAD = {
  win32:  'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe',
  darwin: 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-amd64.tgz',
  linux:  'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64',
};

const line = (ch = '─') => ch.repeat(58);
const B = '\x1b[1m'; const D = '\x1b[0m'; const C = '\x1b[36m'; const Y = '\x1b[33m'; const R = '\x1b[31m';

async function ensureBinary() {
  if (fs.existsSync(BIN)) return true;

  const url = DOWNLOAD[process.platform];
  if (!url) {
    console.error(`${R}Нет готовой сборки cloudflared для ${process.platform}.${D}`);
    console.error('Скачайте вручную: https://github.com/cloudflare/cloudflared/releases');
    return false;
  }
  if (process.platform === 'darwin') {
    console.error(`${R}На macOS установите через Homebrew:${D} brew install cloudflared`);
    return false;
  }

  console.log('Скачиваю cloudflared (около 50 МБ, только в первый раз)…');
  fs.mkdirSync(TOOLS, { recursive: true });
  try {
    const res = await fetch(url, { redirect: 'follow' });
    if (!res.ok) throw new Error(`сервер ответил ${res.status}`);
    const tmp = BIN + '.part';
    fs.writeFileSync(tmp, Buffer.from(await res.arrayBuffer()));
    fs.renameSync(tmp, BIN);
    if (process.platform !== 'win32') fs.chmodSync(BIN, 0o755);
    console.log(`Готово: ${(fs.statSync(BIN).size / 1024 / 1024).toFixed(1)} МБ\n`);
    return true;
  } catch (e) {
    console.error(`${R}Не удалось скачать: ${e.message}${D}`);
    return false;
  }
}

async function checkShop() {
  try {
    const res = await fetch(TARGET + '/api/meta', { signal: AbortSignal.timeout(4000) });
    return res.ok;
  } catch { return false; }
}

(async function main() {
  if (!await checkShop()) {
    console.error(`\n${R}Магазин не отвечает на ${TARGET}${D}`);
    console.error(`Сначала запустите его в другом окне: ${B}npm start${D}\n`);
    process.exit(1);
  }
  if (!await ensureBinary()) process.exit(1);

  console.log('Поднимаю туннель…\n');
  const cf = spawn(BIN, ['tunnel', '--url', TARGET], { stdio: ['ignore', 'pipe', 'pipe'] });

  let shown = false;
  const scan = (chunk) => {
    const text = String(chunk);
    const m = !shown && text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
    if (m) {
      shown = true;
      console.log(`\x1b[35m${line()}${D}`);
      console.log(`  ${B}Магазин доступен из интернета${D}`);
      console.log(`\x1b[35m${line()}${D}`);
      console.log(`  ${C}${B}${m[0]}${D}`);
      console.log(`  Админка: ${C}${m[0]}/admin${D}`);
      console.log(`\x1b[35m${line()}${D}`);
      console.log(`  ${Y}Ссылка работает, пока открыто это окно.${D}`);
      console.log('  Закройте его или нажмите Ctrl+C — и доступ закроется.');
      console.log(`${'─'.repeat(58)}\n`);
    }
    /* Остальной вывод cloudflared прячем: он шумный и пугает лишним */
    if (process.env.KB_SHARE_VERBOSE) process.stdout.write(text);
  };

  cf.stdout.on('data', scan);
  cf.stderr.on('data', scan);

  cf.on('exit', (code) => {
    console.log(`\nТуннель остановлен${code ? ` (код ${code})` : ''}. Ссылка больше не работает.`);
    process.exit(code || 0);
  });

  const stop = () => { cf.kill(); };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
})();
