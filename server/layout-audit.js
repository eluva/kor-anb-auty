'use strict';
/**
 * Проверка вёрстки на реальных размерах экранов.
 *
 * Ловит то, что не видно на одном разрешении: горизонтальную прокрутку,
 * налезающие друг на друга элементы, мелкий текст, маленькие кнопки.
 *
 * Запуск при работающем сервере:  npm run audit:layout
 */
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const BASE = process.env.KB_BASE || 'http://localhost:3000';
const PORT = 9230;

const BROWSERS = [
  `${process.env['ProgramFiles(x86)']}\\Microsoft\\Edge\\Application\\msedge.exe`,
  `${process.env.ProgramFiles}\\Microsoft\\Edge\\Application\\msedge.exe`,
  `${process.env.ProgramFiles}\\Google\\Chrome\\Application\\chrome.exe`,
  '/usr/bin/google-chrome', '/usr/bin/chromium',
];

/* Реальные размеры, а не круглые числа: самые ходовые телефоны и ноутбуки */
const SCREENS = [
  { name: 'iPhone SE',        w: 320,  h: 568,  mobile: true },
  { name: 'Android компакт',  w: 360,  h: 800,  mobile: true },
  { name: 'iPhone 14',        w: 390,  h: 844,  mobile: true },
  { name: 'iPhone Plus',      w: 428,  h: 926,  mobile: true },
  { name: 'планшет книжн.',   w: 768,  h: 1024, mobile: true },
  { name: 'iPad',             w: 834,  h: 1112, mobile: true },
  { name: 'планшет альбом.',  w: 1024, h: 768,  mobile: false },
  { name: 'ноутбук',          w: 1280, h: 800,  mobile: false },
  { name: 'десктоп',          w: 1440, h: 900,  mobile: false },
  { name: 'широкий',          w: 1920, h: 1080, mobile: false },
];

const PAGES = [
  ['главная',  '/'],
  ['каталог',  '/catalog'],
  ['товар',    '/product/anua-heartleaf-77-soothing-toner'],
  ['корзина',  '/checkout'],
];

let problems = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- клиент CDP ---------- */
async function connect() {
  for (let i = 0; i < 40; i++) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = targets.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (page) {
        const ws = new WebSocket(page.webSocketDebuggerUrl);
        await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
        const waiting = new Map();
        let id = 0;
        ws.onmessage = (e) => {
          const m = JSON.parse(e.data);
          const slot = waiting.get(m.id);
          if (slot) { waiting.delete(m.id); slot(m); }
        };
        const send = (method, params = {}) => {
          const n = ++id;
          ws.send(JSON.stringify({ id: n, method, params }));
          return new Promise((r) => waiting.set(n, r));
        };
        return { send };
      }
    } catch { /* браузер поднимается */ }
    await sleep(250);
  }
  throw new Error('Браузер не отвечает');
}

/* Что именно ищем на странице */
const PROBE = `
  const vw = document.documentElement.clientWidth;
  const issues = [];
  const seen = new Set();
  const add = (kind, el, detail) => {
    const id = el.tagName.toLowerCase()
      + (el.id ? '#' + el.id : '')
      + (typeof el.className === 'string' && el.className
          ? '.' + el.className.trim().split(/\\s+/).slice(0, 2).join('.') : '');
    const key = kind + '|' + id;
    if (seen.has(key)) return;
    seen.add(key);
    issues.push({ kind, el: id, detail });
  };

  const visible = (el) => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  /* Панели, которые в закрытом виде специально вынесены за экран */
  const offstage = (el) => el.closest('.mobile-nav, .drawer, .overlay, .filters, .toasts');

  for (const el of document.querySelectorAll('body *')) {
    if (!visible(el) || offstage(el)) continue;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);

    /* 1. Вылезает за правый край экрана */
    if (r.right > vw + 1) add('выходит за экран', el, Math.round(r.right - vw) + 'px вправо');

    /* 2. Слишком мелкий текст в живом тексте */
    const size = parseFloat(cs.fontSize);
    const text = (el.textContent || '').trim();
    if (text && el.children.length === 0 && size && size < 12) {
      add('мелкий текст', el, size.toFixed(1) + 'px');
    }

    /* 3. Маленькая цель для пальца */
    const tappable = el.matches('a[href], button, input[type=checkbox], select, [role=tab]');
    if (tappable && !el.closest('.breadcrumbs, .footer-bottom')) {
      const box = el.closest('label') || el;
      const br = box.getBoundingClientRect();
      if (br.height < 30 || br.width < 30) {
        add('мелкая кнопка', el, Math.round(br.width) + '×' + Math.round(br.height));
      }
    }

    /* 4. Текст не помещается в свой блок по ширине */
    if (el.children.length === 0 && text.length > 3
        && el.scrollWidth > el.clientWidth + 2 && cs.overflowX !== 'auto'
        && cs.overflowX !== 'scroll' && cs.textOverflow !== 'ellipsis') {
      add('текст обрезан', el, el.scrollWidth + '>' + el.clientWidth);
    }
  }

  return {
    scrollW: document.documentElement.scrollWidth,
    vw,
    issues: issues.slice(0, 8),
  };
`;

(async function run() {
  const exe = BROWSERS.find((p) => p && fs.existsSync(p));
  if (!exe) { console.log('Браузер не найден — проверка пропущена.'); process.exit(0); }

  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-audit-'));
  const browser = spawn(exe, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, 'about:blank',
  ], { stdio: 'ignore' });

  const done = () => {
    try { browser.kill(); } catch { /* закрыт */ }
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* занято */ }
  };
  process.on('exit', done);

  const { send } = await connect();
  await send('Page.enable');
  await send('Runtime.enable');

  const evaluate = async (expr) => {
    const r = await send('Runtime.evaluate', {
      expression: `(async () => { ${expr} })()`, awaitPromise: true, returnByValue: true,
    });
    return r.result?.result?.value;
  };

  console.log(`\nПроверка вёрстки — ${SCREENS.length} размеров × ${PAGES.length} страницы\n`);

  for (const s of SCREENS) {
    await send('Emulation.setDeviceMetricsOverride',
      { width: s.w, height: s.h, deviceScaleFactor: 1, mobile: s.mobile });

    const found = [];
    for (const [label, url] of PAGES) {
      await send('Page.navigate', { url: BASE + url });
      for (let i = 0; i < 60; i++) {
        await sleep(200);
        if (await evaluate('return !!document.querySelector("#site-header .logo") && !document.querySelector(".sk-card");')) break;
      }
      await sleep(450);

      const r = await evaluate(PROBE);
      if (!r) continue;
      if (r.scrollW > r.vw + 1) {
        found.push(`${label}: горизонтальная прокрутка (${r.scrollW} при ширине ${r.vw})`);
      }
      for (const i of r.issues) found.push(`${label}: ${i.kind} — ${i.el} (${i.detail})`);
    }

    const tag = found.length ? '\x1b[31m✗\x1b[0m' : '\x1b[32m✓\x1b[0m';
    console.log(`${tag} ${String(s.w).padStart(4)}×${String(s.h).padEnd(4)} ${s.name}`);
    for (const f of found) { console.log(`      \x1b[33m${f}\x1b[0m`); problems++; }
  }

  console.log(`\n${'─'.repeat(52)}`);
  console.log(problems === 0
    ? '\x1b[32m  Замечаний по вёрстке нет\x1b[0m'
    : `\x1b[31m  Замечаний: ${problems}\x1b[0m`);
  console.log(`${'─'.repeat(52)}\n`);

  done();
  process.exit(problems ? 1 : 0);
})().catch((e) => { console.error('Ошибка:', e.message); process.exit(1); });
