'use strict';
/**
 * Браузерная проверка витрины: настоящие клики по фильтрам, корзина, поиск.
 * API-тесты (server/smoke.js) такие ошибки не ловят — здесь работает
 * реальный DOM в headless-браузере через Chrome DevTools Protocol.
 *
 * Запуск при работающем сервере:  node server/browser-test.js
 */
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const BASE = process.env.KB_BASE || 'http://localhost:3000';
const PORT = 9222;

const BROWSERS = [
  `${process.env['ProgramFiles(x86)']}\\Microsoft\\Edge\\Application\\msedge.exe`,
  `${process.env.ProgramFiles}\\Microsoft\\Edge\\Application\\msedge.exe`,
  `${process.env.ProgramFiles}\\Google\\Chrome\\Application\\chrome.exe`,
  `${process.env['ProgramFiles(x86)']}\\Google\\Chrome\\Application\\chrome.exe`,
  '/usr/bin/google-chrome', '/usr/bin/chromium',
];

let pass = 0; let fail = 0;
const ok = (label, cond, extra = '') => {
  if (cond) { pass++; console.log(`  \x1b[32m✓\x1b[0m ${label}${extra ? ' — ' + extra : ''}`); }
  else { fail++; console.log(`  \x1b[31m✗ ${label}${extra ? ' — ' + extra : ''}\x1b[0m`); }
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- минимальный клиент CDP ---------- */
class CDP {
  constructor(ws) { this.ws = ws; this.id = 0; this.waiting = new Map(); }

  static async attach() {
    for (let i = 0; i < 40; i++) {
      try {
        const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
        const page = targets.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
        if (page) {
          const ws = new WebSocket(page.webSocketDebuggerUrl);
          await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
          const cdp = new CDP(ws);
          ws.onmessage = (e) => {
            const msg = JSON.parse(e.data);
            const slot = cdp.waiting.get(msg.id);
            if (slot) { cdp.waiting.delete(msg.id); slot(msg); }
          };
          return cdp;
        }
      } catch { /* браузер ещё поднимается */ }
      await sleep(250);
    }
    throw new Error('Не удалось подключиться к браузеру');
  }

  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((res) => this.waiting.set(id, res));
  }

  /* Выполнить выражение на странице и вернуть результат */
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', {
      expression: `(async () => { ${expression} })()`,
      awaitPromise: true,
      returnByValue: true,
    });
    if (r.result?.exceptionDetails) {
      throw new Error(r.result.exceptionDetails.exception?.description || 'ошибка на странице');
    }
    return r.result?.result?.value;
  }

  async goto(url) {
    await this.send('Page.navigate', { url });
    /* Ждём, пока витрина отрисует шапку и каталог */
    for (let i = 0; i < 60; i++) {
      await sleep(200);
      try {
        const ready = await this.eval('return !!document.querySelector("#site-header .logo") && !document.querySelector(".sk-card");');
        if (ready) { await sleep(250); return; }
      } catch { /* страница ещё перезагружается */ }
    }
  }
}

/* ---------- запуск браузера ---------- */
const exe = BROWSERS.find((p) => p && fs.existsSync(p));
if (!exe) { console.error('Браузер (Edge/Chrome) не найден — пропускаем браузерные тесты.'); process.exit(0); }

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-cdp-'));
const browser = spawn(exe, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  '--window-size=1440,1000', 'about:blank',
], { stdio: 'ignore' });

const cleanup = () => {
  try { browser.kill(); } catch { /* уже закрыт */ }
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* занято */ }
};
process.on('exit', cleanup);

(async function run() {
  console.log(`\nБраузерная проверка ${BASE}\n`);
  const cdp = await CDP.attach();
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');

  /* ================= Фильтры каталога ================= */
  console.log('Фильтры каталога');
  await cdp.goto(`${BASE}/catalog`);

  const values = await cdp.eval(`
    return {
      category: [...document.querySelectorAll('#f-category input')].map(i => i.value),
      brand:    [...document.querySelectorAll('#f-brand input')].map(i => i.value),
      skin:     [...document.querySelectorAll('#f-skin input')].map(i => i.value),
      concern:  [...document.querySelectorAll('#f-concern input')].map(i => i.value),
    };`);

  const isSlug = (v) => /^[a-z][a-z0-9-]*$/.test(v);
  ok('значения разделов — слаги, а не числа', values.category.every(isSlug), values.category.slice(0, 3).join(', '));
  ok('значения брендов — слаги, а не числа', values.brand.every(isSlug), values.brand.slice(0, 3).join(', '));
  ok('значения типов кожи корректны', values.skin.every(isSlug), values.skin.join(', '));
  ok('значения задач корректны', values.concern.every(isSlug), values.concern.slice(0, 3).join(', '));

  /* Настоящий клик по фильтру «Сыворотки» */
  const afterClick = await cdp.eval(`
    const box = [...document.querySelectorAll('#f-category input')].find(i => i.value === 'serums');
    box.click();
    await new Promise(r => setTimeout(r, 700));
    return {
      chips: [...document.querySelectorAll('#active-chips .chip:not(#clear-all)')].map(c => c.textContent.replace('✕','').trim()),
      url: location.search,
      count: document.querySelector('#count').textContent,
      cards: document.querySelectorAll('.card').length,
      brands: [...document.querySelectorAll('.card-brand')].map(b => b.textContent),
    };`);

  ok('чип показывает название раздела, а не число',
    afterClick.chips.includes('Сыворотки'), `чипы: ${afterClick.chips.join(' | ') || '—'}`);
  ok('в URL попадает слаг', afterClick.url.includes('category=serums'), afterClick.url);
  ok('каталог нашёл товары', afterClick.cards > 0, `${afterClick.count}, карточек: ${afterClick.cards}`);

  /* Второй фильтр поверх первого */
  const twoFilters = await cdp.eval(`
    const box = [...document.querySelectorAll('#f-skin input')].find(i => i.value === 'dry');
    box.click();
    await new Promise(r => setTimeout(r, 700));
    return {
      chips: [...document.querySelectorAll('#active-chips .chip:not(#clear-all)')].map(c => c.textContent.replace('✕','').trim()),
      url: location.search,
      cards: document.querySelectorAll('.card').length,
    };`);
  ok('второй фильтр добавился чипом',
    twoFilters.chips.includes('Сыворотки') && twoFilters.chips.includes('Сухая'),
    twoFilters.chips.join(' | '));
  ok('оба фильтра в URL',
    twoFilters.url.includes('category=serums') && twoFilters.url.includes('skin=dry'), twoFilters.url);
  ok('результаты сузились', twoFilters.cards > 0 && twoFilters.cards <= afterClick.cards,
    `${afterClick.cards} → ${twoFilters.cards}`);

  /* Снятие фильтра крестиком на чипе */
  const afterChipRemove = await cdp.eval(`
    const chip = [...document.querySelectorAll('#active-chips .chip:not(#clear-all)')]
      .find(c => c.textContent.includes('Сухая'));
    chip.querySelector('button').click();
    await new Promise(r => setTimeout(r, 700));
    return {
      chips: [...document.querySelectorAll('#active-chips .chip:not(#clear-all)')].map(c => c.textContent.replace('✕','').trim()),
      skinChecked: [...document.querySelectorAll('#f-skin input')].filter(i => i.checked).map(i => i.value),
    };`);
  ok('чип снимается крестиком', !afterChipRemove.chips.includes('Сухая'), afterChipRemove.chips.join(' | '));
  ok('чекбокс снялся вместе с чипом', afterChipRemove.skinChecked.length === 0);

  /* Сброс всех фильтров */
  const afterReset = await cdp.eval(`
    document.querySelector('#reset-filters').click();
    await new Promise(r => setTimeout(r, 700));
    return {
      chips: document.querySelectorAll('#active-chips .chip:not(#clear-all)').length,
      checked: document.querySelectorAll('.filters input[type=checkbox]:checked').length,
      cards: document.querySelectorAll('.card').length,
    };`);
  ok('сброс убирает все чипы и галочки',
    afterReset.chips === 0 && afterReset.checked === 0);
  ok('после сброса показан весь каталог', afterReset.cards >= 12, `${afterReset.cards} карточек`);

  /* ================= Фильтры из ссылки ================= */
  console.log('\nФильтры по ссылке');
  await cdp.goto(`${BASE}/catalog?category=suncare&skin=dry`);
  const fromUrl = await cdp.eval(`
    return {
      catChecked:  [...document.querySelectorAll('#f-category input')].filter(i => i.checked).map(i => i.value),
      skinChecked: [...document.querySelectorAll('#f-skin input')].filter(i => i.checked).map(i => i.value),
      chips: [...document.querySelectorAll('#active-chips .chip:not(#clear-all)')].map(c => c.textContent.replace('✕','').trim()),
      title: document.querySelector('#catalog-title').textContent,
    };`);
  ok('галочка раздела проставлена из ссылки',
    fromUrl.catChecked.includes('suncare'), fromUrl.catChecked.join(', ') || 'ни одной');
  ok('галочка типа кожи проставлена из ссылки', fromUrl.skinChecked.includes('dry'));
  ok('чипы построены из ссылки', fromUrl.chips.length === 2, fromUrl.chips.join(' | '));

  /* ================= Фильтр по бренду ================= */
  await cdp.goto(`${BASE}/catalog`);
  const brandFilter = await cdp.eval(`
    const box = [...document.querySelectorAll('#f-brand input')].find(i => i.value === 'cosrx');
    box.click();
    await new Promise(r => setTimeout(r, 700));
    return {
      chips: [...document.querySelectorAll('#active-chips .chip:not(#clear-all)')].map(c => c.textContent.replace('✕','').trim()),
      brands: [...new Set([...document.querySelectorAll('.card-brand')].map(b => b.textContent))],
    };`);
  ok('чип бренда показывает название', brandFilter.chips.includes('COSRX'), brandFilter.chips.join(' | '));
  ok('показаны товары только этого бренда',
    brandFilter.brands.length === 1 && brandFilter.brands[0] === 'COSRX', brandFilter.brands.join(', '));

  /* ================= Цена ================= */
  console.log('\nЦена, сортировка, поиск');
  await cdp.goto(`${BASE}/catalog`);
  const byPrice = await cdp.eval(`
    document.querySelector('#f-min').value = '100000';
    document.querySelector('#f-min').dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('#f-max').value = '130000';
    document.querySelector('#f-max').dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(r => setTimeout(r, 1400));
    return {
      chips: [...document.querySelectorAll('#active-chips .chip:not(#clear-all)')].map(c => c.textContent.replace('✕','').trim()),
      prices: [...document.querySelectorAll('.card-price b')].map(b => Number(b.textContent.replace(/\\D/g,''))),
    };`);
  ok('фильтр цены отдаёт товары в диапазоне',
    byPrice.prices.length > 0 && byPrice.prices.every((p) => p >= 100000 && p <= 130000),
    `${byPrice.prices.length} товаров: ${byPrice.prices.slice(0, 4).join(', ')}`);
  ok('чипы цены читаемы', byPrice.chips.length === 2, byPrice.chips.join(' | '));

  /* Сортировка */
  await cdp.goto(`${BASE}/catalog`);
  const sorted = await cdp.eval(`
    const sel = document.querySelector('#sort');
    sel.value = 'price_asc';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 800));
    return [...document.querySelectorAll('.card-price b')].map(b => Number(b.textContent.replace(/\\D/g,'')));`);
  ok('сортировка по возрастанию цены работает',
    sorted.every((v, i) => i === 0 || sorted[i - 1] <= v), sorted.slice(0, 4).join(' ≤ '));

  /* Поиск через шапку */
  await cdp.goto(`${BASE}/catalog?search=%D1%82%D0%BE%D0%BD%D0%B5%D1%80`);
  const search = await cdp.eval(`
    return {
      cards: document.querySelectorAll('.card').length,
      title: document.querySelector('#catalog-title').textContent,
    };`);
  ok('поиск «тонер» находит товары', search.cards > 0, `${search.cards} шт., заголовок: ${search.title}`);

  /* ================= Корзина ================= */
  console.log('\nКорзина');
  await cdp.goto(`${BASE}/catalog`);
  /* Берём товар, которого точно больше одного: корзина не даёт заказать
     больше, чем есть на складе, и на остатке 1 проверка увеличения упадёт. */
  const cart = await cdp.eval(`
    localStorage.removeItem('kb_cart');
    const page = await (await fetch('/api/products?sort=popular&limit=12')).json();
    const roomy = page.items.find(p => p.stock > 2) || page.items[0];
    const btn = document.querySelector('[data-add="' + roomy.id + '"]') || document.querySelector('[data-add]');
    btn.click();
    await new Promise(r => setTimeout(r, 900));
    return {
      badge: document.querySelector('#cart-count').textContent,
      stored: JSON.parse(localStorage.getItem('kb_cart') || '[]').length,
      drawerOpen: !!document.querySelector('#kb-cart.open'),
      lines: document.querySelectorAll('.cart-line').length,
    };`);
  ok('товар добавляется в корзину', cart.stored === 1, `в хранилище: ${cart.stored}`);
  ok('счётчик в шапке обновился', cart.badge === '1', `«${cart.badge}»`);

  const drawer = await cdp.eval(`
    document.querySelector('#open-cart').click();
    await new Promise(r => setTimeout(r, 800));
    const inc = document.querySelector('[data-cart-inc]');
    inc.click();
    await new Promise(r => setTimeout(r, 900));
    return {
      lines: document.querySelectorAll('.cart-line').length,
      qty: document.querySelector('.qty-mini span')?.textContent,
      badge: document.querySelector('#cart-count').textContent,
      hasCheckout: !!document.querySelector('[href="/checkout"]'),
    };`);
  ok('панель корзины показывает позицию', drawer.lines === 1);
  ok('количество увеличивается', drawer.qty === '2' && drawer.badge === '2', `${drawer.qty} шт.`);
  ok('есть переход к оформлению', drawer.hasCheckout);

  /* ================= Избранное ================= */
  console.log('\nИзбранное');
  await cdp.goto(`${BASE}/catalog`);
  const fav = await cdp.eval(`
    localStorage.removeItem('kb_fav');
    document.querySelector('[data-fav]').click();
    await new Promise(r => setTimeout(r, 500));
    return {
      stored: JSON.parse(localStorage.getItem('kb_fav') || '[]').length,
      badge: document.querySelector('#fav-count').textContent,
      marked: document.querySelectorAll('.card-fav.on').length,
    };`);
  ok('товар добавляется в избранное', fav.stored === 1 && fav.marked === 1, `счётчик: ${fav.badge}`);

  await cdp.goto(`${BASE}/catalog?fav=1`);
  const favPage = await cdp.eval(`
    return { cards: document.querySelectorAll('.card').length,
             title: document.querySelector('#catalog-title')?.textContent };`);
  ok('страница избранного показывает отмеченное', favPage.cards === 1,
    `${favPage.cards} шт., «${favPage.title}»`);

  /* ================= Целостность вёрстки =================
     Незакрытый или лишний </div> браузер молча «чинит» по-своему: блок
     уезжает в чужого родителя и теряет колонку. Проверяем, что ключевые
     секции лежат там, где задумано. */
  console.log('\nСтруктура страниц');
  await cdp.goto(`${BASE}/`);
  const structure = await cdp.eval(`
    const checks = [];
    const inWrap = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return 'нет элемента';
      return el.parentElement?.classList.contains('wrap') ? true : 'родитель: .' + (el.parentElement?.className || '?');
    };
    checks.push(['.about-grid внутри .wrap', inWrap('.about-grid')]);
    checks.push(['.steps внутри .wrap', inWrap('.steps')]);
    checks.push(['.cat-grid внутри .wrap', inWrap('.cat-grid')]);
    checks.push(['#featured внутри .wrap', inWrap('#featured')]);

    /* Ни одна секция не должна оказаться внутри шапки секции */
    const nested = [...document.querySelectorAll('.sec-head')]
      .filter(h => h.querySelector('.products, .cat-grid, .about-grid, .steps'))
      .map(h => h.textContent.trim().slice(0, 30));

    /* Ширина контента не должна превышать .wrap */
    const wrapW = Math.round(document.querySelector('.wrap').getBoundingClientRect().width);
    const wide = [...document.querySelectorAll('.steps, .about-grid, .cat-grid, .products')]
      .filter(el => Math.round(el.getBoundingClientRect().width) > wrapW + 1)
      .map(el => el.className);

    return { checks, nested, wide, wrapW };`);

  for (const [label, res] of structure.checks) ok(label, res === true, res === true ? '' : String(res));
  ok('секции не вложены в .sec-head', structure.nested.length === 0, structure.nested.join(' | ') || 'ок');
  ok('блоки не шире колонки .wrap', structure.wide.length === 0, structure.wide.join(' | ') || `${structure.wrapW}px`);

  /* ================= Ошибки в консоли ================= */
  console.log('\nОшибки страниц');
  for (const p of ['/', '/catalog', '/checkout']) {
    await cdp.goto(BASE + p);
    const broken = await cdp.eval(`
      return [...document.images].filter(i => i.complete && i.naturalWidth === 0).map(i => i.src);`);
    ok(`${p}: все картинки загрузились`, broken.length === 0, broken.length ? broken.join(', ') : 'ок');
  }

  console.log(`\n${'─'.repeat(46)}`);
  console.log(fail === 0
    ? `\x1b[32m  Все браузерные проверки пройдены: ${pass}\x1b[0m`
    : `\x1b[31m  Успешно: ${pass}, провалено: ${fail}\x1b[0m`);
  console.log(`${'─'.repeat(46)}\n`);

  cleanup();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('\n\x1b[31mОшибка:\x1b[0m', e.message); cleanup(); process.exit(1); });
