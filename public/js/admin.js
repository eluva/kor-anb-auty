/* ==========================================================================
   Korean Beauty — админ-панель
   ========================================================================== */
(function () {
  'use strict';

  /* Контурные иконки: эмодзи в интерфейсе не используем — они по-разному
     рисуются в Windows, Android и iOS и выглядят как случайная картинка. */
  const sv = (b) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"
      stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${b}</svg>`;
  const I = {
    dashboard:  sv('<path d="M3.5 3.5h7v7h-7zM13.5 3.5h7v4.5h-7zM13.5 12h7v8.5h-7zM3.5 14h7v6.5h-7z"/>'),
    products:   sv('<path d="M9.5 3h5M10.5 3v3.6L7.4 16.8a2.6 2.6 0 0 0 2.4 3.6h4.4a2.6 2.6 0 0 0 2.4-3.6L13.5 6.6V3"/><path d="M8.8 13.6h6.4"/>'),
    categories: sv('<path d="M3.5 6.4a2 2 0 0 1 2-2h3.1l1.9 2.2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/>'),
    brands:     sv('<path d="M3.6 11.4V4.6a1 1 0 0 1 1-1h6.8l8.5 8.5a1.6 1.6 0 0 1 0 2.3l-5.5 5.5a1.6 1.6 0 0 1-2.3 0z"/><circle cx="8" cy="8" r="1.4"/>'),
    orders:     sv('<path d="M6 2.8h12v18.4l-3-1.8-3 1.8-3-1.8-3 1.8z"/><path d="M9.2 7.6h5.6M9.2 11.6h5.6M9.2 15.4h3.4"/>'),
    settings:   sv('<circle cx="12" cy="12" r="3.2"/><path d="M12 2.6v2.6M12 18.8v2.6M21.4 12h-2.6M5.2 12H2.6M18.6 5.4l-1.8 1.8M7.2 16.8l-1.8 1.8M18.6 18.6l-1.8-1.8M7.2 7.2 5.4 5.4"/>'),
    shop:       sv('<path d="M4 8.6h16l-1.2 11.2a1.6 1.6 0 0 1-1.6 1.4H6.8a1.6 1.6 0 0 1-1.6-1.4z"/><path d="M8.8 8.6V6.4a3.2 3.2 0 0 1 6.4 0v2.2"/>'),
    logout:     sv('<path d="M14.6 16.8v2.2a1.8 1.8 0 0 1-1.8 1.8H5.4a1.8 1.8 0 0 1-1.8-1.8V5a1.8 1.8 0 0 1 1.8-1.8h7.4A1.8 1.8 0 0 1 14.6 5v2.2"/><path d="M18.6 12H8.6M15.8 8.8 19 12l-3.2 3.2"/>'),
    menu:       sv('<path d="M3.5 7h17M3.5 12h17M3.5 17h17"/>'),
    close:      sv('<path d="M6 6l12 12M18 6 6 18"/>'),
    money:      sv('<rect x="2.6" y="5.6" width="18.8" height="12.8" rx="1.6"/><circle cx="12" cy="12" r="2.6"/><path d="M6 9.6v4.8M18 9.6v4.8"/>'),
    box:        sv('<path d="M3.5 8.2 12 4l8.5 4.2v7.6L12 20l-8.5-4.2z"/><path d="M12 12.4 20.5 8.2M12 12.4V20M12 12.4 3.5 8.2"/>'),
    chart:      sv('<path d="M3.6 20.4h16.8"/><path d="M6.6 20.4V11M11 20.4V5.6M15.4 20.4v-6M19.8 20.4v-9.8"/>'),
    edit:       sv('<path d="M4 20h4.2L19.4 8.8a2 2 0 0 0-2.8-2.8L5.4 17.2z"/><path d="M14.6 7.8l2.6 2.6"/>'),
    trash:      sv('<path d="M4.6 6.4h14.8M9.4 6.4V4.6h5.2v1.8M6.6 6.4l.9 13a1.6 1.6 0 0 0 1.6 1.5h6a1.6 1.6 0 0 0 1.6-1.5l.9-13"/>'),
    eye:        sv('<path d="M2.6 12S6.4 6.2 12 6.2 21.4 12 21.4 12 17.6 17.8 12 17.8 2.6 12 2.6 12z"/><circle cx="12" cy="12" r="2.8"/>'),
    eyeOff:     sv('<path d="M4 4l16 16"/><path d="M9.6 5.2A9.5 9.5 0 0 1 12 5c5.6 0 9.4 7 9.4 7a17 17 0 0 1-3 3.5M6.5 7.3A17 17 0 0 0 2.6 12S6.4 17.8 12 17.8a9.2 9.2 0 0 0 3.4-.6"/>'),
    camera:     sv('<path d="M3.4 8.2h3.4l1.5-2.4h7.4l1.5 2.4h3.4v11H3.4z"/><circle cx="12" cy="13.4" r="3.6"/>'),
    arrow:      sv('<path d="M4 12h16M14 6l6 6-6 6"/>'),
  };

  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const app = $('#app');

  const money = (n) => new Intl.NumberFormat('ru-RU').format(Math.round(Number(n) || 0)) + ' сум';

  /* Русские склонения: 1 заказ / 2 заказа / 5 заказов */
  const plural = (n, one, few, many) => {
    const a = Math.abs(n) % 100; const b = a % 10;
    if (a > 10 && a < 20) return many;
    if (b > 1 && b < 5) return few;
    if (b === 1) return one;
    return many;
  };
  const esc = (s) => String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  const dt = (s) => {
    const d = new Date(String(s).replace(' ', 'T') + 'Z');
    return isNaN(d) ? s : d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
  };

  /* ---------- HTTP ---------- */
  async function api(path, options = {}) {
    const res = await fetch(path, {
      headers: options.body ? { 'Content-Type': 'application/json' } : {},
      ...options,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    let data = null;
    try { data = await res.json(); } catch { /* пусто */ }
    if (res.status === 401 && !path.endsWith('/login')) { renderLogin('Сессия истекла — войдите заново'); throw new Error('401'); }
    if (!res.ok) throw new Error(data?.error || `Ошибка ${res.status}`);
    return data;
  }

  /* ---------- Уведомления ---------- */
  let toastBox;
  function toast(msg, type = '') {
    if (!toastBox) { toastBox = document.createElement('div'); toastBox.className = 'toasts'; document.body.appendChild(toastBox); }
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = msg;
    toastBox.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; setTimeout(() => el.remove(), 300); }, 2800);
  }

  /* ---------- Подготовка фото перед загрузкой ----------
     Снимок с телефона весит 5–8 МБ, а в карточке товара показывается
     квадратом ~600 px. Уменьшаем прямо в браузере: страницы магазина
     будут открываться быстро даже на мобильном интернете.
     Если что-то пошло не так — отправляем исходный файл как есть. */
  const MAX_SIDE = 1400;
  const JPEG_QUALITY = 0.82;

  function shrinkImage(file) {
    return new Promise((resolve) => {
      if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size < 300 * 1024) {
        return resolve(file);           // svg, gif и мелкие файлы не трогаем
      }
      const url = URL.createObjectURL(file);
      const img = new Image();

      img.onload = () => {
        URL.revokeObjectURL(url);
        const scale = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
        if (scale === 1 && file.size < 1024 * 1024) return resolve(file);

        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        canvas.toBlob((blob) => {
          if (!blob || blob.size >= file.size) return resolve(file);
          const name = file.name.replace(/\.[^.]+$/, '') + '.jpg';
          resolve(new File([blob], name, { type: 'image/jpeg', lastModified: Date.now() }));
        }, 'image/jpeg', JPEG_QUALITY);
      };

      img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
      img.src = url;
    });
  }

  /* ---------- Модальные окна ---------- */
  function modal({ title, body, footer, narrow = false, onMount }) {
    const back = document.createElement('div');
    back.className = 'modal-back';
    back.innerHTML = `
      <div class="modal${narrow ? ' narrow' : ''}" role="dialog" aria-modal="true">
        <div class="modal-head"><h3>${esc(title)}</h3><button class="x-btn" data-close aria-label="Закрыть">${I.close}</button></div>
        <div class="modal-body">${body}</div>
        ${footer ? `<div class="modal-foot">${footer}</div>` : ''}
      </div>`;
    document.body.appendChild(back);
    document.body.style.overflow = 'hidden';

    const close = () => { back.remove(); document.body.style.overflow = ''; };
    back.addEventListener('click', (e) => { if (e.target === back || e.target.closest('[data-close]')) close(); });
    const onKey = (e) => { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onKey); } };
    document.addEventListener('keydown', onKey);
    onMount?.(back, close);
    return { el: back, close };
  }

  function confirmDialog(text, onYes, danger = true) {
    modal({
      title: 'Подтвердите действие', narrow: true,
      body: `<p style="margin:0">${esc(text)}</p>`,
      footer: `<button class="btn btn-ghost" data-close>Отмена</button>
               <button class="btn ${danger ? 'btn-danger' : ''}" data-yes>Да, продолжить</button>`,
      onMount: (root, close) => $('[data-yes]', root).addEventListener('click', async () => { close(); await onYes(); }),
    });
  }

  /* ---------- Логотип ---------- */
  /* Та же монограмма, что и на витрине: плоская бронза по тёмному полю */
  const LOGO = `<svg viewBox="0 0 100 100" aria-hidden="true">
    <rect width="100" height="100" rx="6" fill="#7A4750"/>
    <rect x="6" y="6" width="88" height="88" rx="3" fill="none" stroke="#E8C98B" stroke-width="1.5" opacity=".65"/>
    <text x="50" y="64" text-anchor="middle" font-family="Playfair Display, Georgia, serif"
          font-size="40" font-weight="600" fill="#F0D9A8" letter-spacing="-1">K&amp;B</text>
  </svg>`;

  /* ---------- Экран входа ---------- */
  function renderLogin(message = '') {
    app.innerHTML = `
      <div class="login-page">
        <form class="login-card" id="login-form">
          <div class="brand">${LOGO}<h1>Korean Beauty</h1><p>Панель управления магазином</p></div>
          ${message ? `<div class="login-error">${esc(message)}</div>` : ''}
          <div class="field">
            <label for="u">Логин</label>
            <input id="u" name="username" type="text" autocomplete="username" required autofocus>
          </div>
          <div class="field">
            <label for="p">Пароль</label>
            <input id="p" name="password" type="password" autocomplete="current-password" required>
          </div>
          <button class="btn btn-block" type="submit" id="login-btn" style="margin-top:8px">Войти</button>
          <p style="text-align:center;margin:22px 0 0"><a href="/" class="label">← Вернуться в магазин</a></p>
        </form>
      </div>`;

    $('#login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = $('#login-btn');
      btn.disabled = true; btn.textContent = 'Проверяем…';
      try {
        await api('/api/admin/login', { method: 'POST', body: { username: $('#u').value, password: $('#p').value } });
        renderApp();
      } catch (err) {
        btn.disabled = false; btn.textContent = 'Войти';
        renderLogin(err.message);
      }
    });
  }

  /* ======================================================================
     Каркас панели
     ====================================================================== */
  const PAGES = [
    { id: 'dashboard',  icon: I.dashboard,  label: 'Обзор' },
    { id: 'products',   icon: I.products,   label: 'Товары' },
    { id: 'categories', icon: I.categories, label: 'Разделы' },
    { id: 'brands',     icon: I.brands,     label: 'Бренды' },
    { id: 'orders',     icon: I.orders,     label: 'Заказы' },
    { id: 'settings',   icon: I.settings,   label: 'Настройки' },
  ];

  const cache = { categories: [], brands: [], stats: null, meta: null };
  let currentPage = 'dashboard';

  function renderApp() {
    app.innerHTML = `
      <div class="layout">
        <aside class="sidebar" id="sidebar">
          <div class="brand">${LOGO}<div><b>Korean Beauty</b><span>Admin · Нукус</span></div></div>
          <nav class="side-nav" id="side-nav">
            ${PAGES.map((p) => `<button data-page="${p.id}"><span class="ico">${p.icon}</span>${p.label}<span class="pill hidden" data-pill="${p.id}"></span></button>`).join('')}
          </nav>
          <div class="side-foot">
            <a href="/" target="_blank" rel="noopener">${I.shop} Открыть магазин</a>
            <button id="logout">${I.logout} Выйти</button>
          </div>
        </aside>
        <div>
          <div class="mobile-bar">
            <button class="x-btn" id="burger" aria-label="Меню">${I.menu}</button>
            <b>Korean Beauty</b>
          </div>
          <main class="main" id="page"></main>
        </div>
      </div>`;

    $('#side-nav').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-page]');
      if (btn) { go(btn.dataset.page); $('#sidebar').classList.remove('open'); $('.sb-back')?.remove(); }
    });

    $('#logout').addEventListener('click', async () => {
      await api('/api/admin/logout', { method: 'POST' }).catch(() => {});
      renderLogin();
    });

    $('#burger').addEventListener('click', () => {
      $('#sidebar').classList.add('open');
      const back = document.createElement('div');
      back.className = 'sb-back';
      back.addEventListener('click', () => { $('#sidebar').classList.remove('open'); back.remove(); });
      document.body.appendChild(back);
    });

    go(currentPage);
  }

  function go(page) {
    currentPage = page;
    $$('#side-nav button').forEach((b) => b.classList.toggle('active', b.dataset.page === page));
    ({ dashboard, products, categories, brands, orders, settings })[page]();
  }

  function setPill(id, n) {
    const el = $(`[data-pill="${id}"]`);
    if (!el) return;
    el.textContent = n;
    el.classList.toggle('hidden', !n);
  }

  const loading = (rows = 5) => `<div class="skeleton-row"></div>`.repeat(rows);

  async function ensureRefs() {
    if (!cache.categories.length) {
      const [c, b] = await Promise.all([api('/api/admin/categories'), api('/api/admin/brands')]);
      cache.categories = c.items; cache.brands = b.items;
    }
    if (!cache.meta) cache.meta = await fetch('/api/meta').then((r) => r.json());
    return cache;
  }

  /* ======================================================================
     Обзор
     ====================================================================== */
  async function dashboard() {
    const page = $('#page');
    page.innerHTML = `<div class="page-head"><div><h2>Обзор</h2><p>Ключевые показатели магазина</p></div></div>${loading(3)}`;

    const s = await api('/api/admin/stats');
    cache.stats = s;
    setPill('orders', s.newOrders);

    const STATUS = {
      new: ['tag-warn', 'Новый'], confirmed: ['tag-rose', 'Подтверждён'],
      shipped: ['tag-gold', 'Доставляется'], done: ['tag-ok', 'Выполнен'], canceled: ['tag-off', 'Отменён'],
    };

    page.innerHTML = `
      <div class="page-head">
        <div><h2>Обзор</h2><p>Ключевые показатели магазина</p></div>
        <button class="btn" id="quick-add">+ Добавить товар</button>
      </div>

      <div class="stats">
        <div class="stat"><span class="s-ico">${I.products}</span><div class="s-label">Товаров в каталоге</div>
          <div class="s-value">${s.products}</div><div class="s-note">${s.active} опубликовано</div></div>
        <div class="stat ${s.newOrders ? 'warn' : ''}"><span class="s-ico">${I.orders}</span><div class="s-label">Новых заказов</div>
          <div class="s-value">${s.newOrders}</div><div class="s-note">всего ${s.orders} ${plural(s.orders, 'заказ', 'заказа', 'заказов')}</div></div>
        <div class="stat ok"><span class="s-ico">${I.money}</span><div class="s-label">Выручка (выполнено)</div>
          <div class="s-value" style="font-size:1.3rem">${money(s.revenue)}</div><div class="s-note">по завершённым заказам</div></div>
        <div class="stat ${s.outOfStock ? 'danger' : ''}"><span class="s-ico">${I.box}</span><div class="s-label">Нет в наличии</div>
          <div class="s-value">${s.outOfStock}</div><div class="s-note">${s.lowStock} заканчивается</div></div>
      </div>

      <div class="grid-2">
        <div class="card">
          <h3>Последние заказы</h3>
          ${s.recentOrders.length ? `<div class="table-wrap" style="border:none">
            <table style="min-width:0">
              <tbody>${s.recentOrders.map((o) => `
                <tr><td><div class="t-name">${esc(o.code)}</div><div class="t-sub">${esc(o.customer_name)} · ${dt(o.created_at)}</div></td>
                <td class="num"><b>${money(o.total)}</b><br>
                  <span class="tag ${STATUS[o.status]?.[0] || 'tag-off'}">${STATUS[o.status]?.[1] || o.status}</span></td></tr>`).join('')}
              </tbody></table></div>
            <button class="btn btn-ghost btn-sm btn-block" style="margin-top:12px" data-goto="orders">Все заказы ${I.arrow}</button>`
            : `<div class="empty-state"><div class="e-ico">${I.orders}</div><h3>Заказов пока нет</h3><p>Они появятся здесь после первой покупки.</p></div>`}
        </div>

        <div class="card">
          <h3>Топ продаж</h3>
          ${s.topProducts.length ? `<div class="table-wrap" style="border:none">
            <table style="min-width:0"><tbody>${s.topProducts.map((p) => `
              <tr><td style="width:56px"><img class="t-thumb" src="${esc(p.image || '/img/placeholder.svg')}" alt=""></td>
              <td><div class="t-name">${esc(p.name)}</div><div class="t-sub">${money(p.price)} · остаток ${p.stock}</div></td>
              <td class="num"><b>${p.sold_count}</b><div class="t-sub">продано</div></td></tr>`).join('')}
            </tbody></table></div>` : `<div class="empty-state"><div class="e-ico">${I.chart}</div><h3>Нет данных</h3></div>`}
        </div>
      </div>`;

    $('#quick-add').addEventListener('click', () => productForm());
    $('[data-goto="orders"]')?.addEventListener('click', () => go('orders'));
  }

  /* ======================================================================
     Товары
     ====================================================================== */
  const pState = { search: '', category: '', brand: '', status: '', page: 1 };

  async function products() {
    const page = $('#page');
    await ensureRefs();

    page.innerHTML = `
      <div class="page-head">
        <div><h2>Товары</h2><p>Добавляйте и редактируйте позиции каталога</p></div>
        <button class="btn" id="add-product">+ Добавить товар</button>
      </div>
      <div class="toolbar">
        <input type="search" id="p-search" placeholder="Поиск по названию или бренду" value="${esc(pState.search)}">
        <select id="p-category"><option value="">Все разделы</option>
          ${cache.categories.map((c) => `<option value="${esc(c.slug)}"${pState.category === c.slug ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}</select>
        <select id="p-brand"><option value="">Все бренды</option>
          ${cache.brands.map((b) => `<option value="${esc(b.slug)}"${pState.brand === b.slug ? ' selected' : ''}>${esc(b.name)}</option>`).join('')}</select>
        <select id="p-status">
          <option value="">Любой статус</option>
          <option value="active"${pState.status === 'active' ? ' selected' : ''}>Опубликованные</option>
          <option value="hidden"${pState.status === 'hidden' ? ' selected' : ''}>Скрытые</option>
          <option value="outstock"${pState.status === 'outstock' ? ' selected' : ''}>Нет в наличии</option>
        </select>
      </div>
      <div id="p-table">${loading(6)}</div>`;

    $('#add-product').addEventListener('click', () => productForm());
    let t;
    $('#p-search').addEventListener('input', (e) => {
      clearTimeout(t); t = setTimeout(() => { pState.search = e.target.value; pState.page = 1; loadProducts(); }, 350);
    });
    ['category', 'brand', 'status'].forEach((k) => $(`#p-${k}`).addEventListener('change', (e) => {
      pState[k] = e.target.value; pState.page = 1; loadProducts();
    }));

    loadProducts();
  }

  async function loadProducts() {
    const host = $('#p-table');
    if (!host) return;
    const q = new URLSearchParams();
    Object.entries(pState).forEach(([k, v]) => { if (v) q.set(k, v); });
    q.set('limit', 20);

    const data = await api('/api/admin/products?' + q);

    if (!data.items.length) {
      host.innerHTML = `<div class="card"><div class="empty-state"><div class="e-ico">${I.products}</div>
        <h3>Товары не найдены</h3><p>Измените фильтры или добавьте первую позицию.</p></div></div>`;
      return;
    }

    host.innerHTML = `
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th style="width:60px"></th><th>Товар</th><th>Раздел</th>
            <th class="num">Цена</th><th class="num">Остаток</th><th>Статус</th><th></th>
          </tr></thead>
          <tbody>${data.items.map((p) => `
            <tr>
              <td><img class="t-thumb" src="${esc(p.image || '/img/placeholder.svg')}" alt="" loading="lazy"></td>
              <td>
                <div class="t-name">${esc(p.name)}</div>
                <div class="t-sub">${esc(p.brand_name || '—')}${p.volume ? ' · ' + esc(p.volume) : ''}</div>
              </td>
              <td><span class="t-sub">${esc(p.category_name || '—')}</span></td>
              <td class="num"><b>${money(p.price)}</b>${p.old_price > p.price ? `<div class="t-sub"><s>${money(p.old_price)}</s></div>` : ''}</td>
              <td class="num">
                <input type="number" value="${p.stock}" min="0" data-stock="${p.id}"
                       style="width:70px;padding:5px 8px;border:1px solid var(--line);border-radius:7px;text-align:right">
              </td>
              <td>
                <span class="tag ${p.is_active ? 'tag-ok' : 'tag-off'}">${p.is_active ? 'Виден' : 'Скрыт'}</span>
                ${p.stock <= 0 ? '<div style="margin-top:4px"><span class="tag tag-danger">Нет в наличии</span></div>' : ''}
                ${p.is_new ? '<div style="margin-top:4px"><span class="tag tag-rose">Новинка</span></div>' : ''}
                ${p.is_featured ? '<div style="margin-top:4px"><span class="tag tag-gold">Хит</span></div>' : ''}
              </td>
              <td>
                <div class="t-actions">
                  <button class="btn btn-ghost btn-sm" data-edit="${p.id}">${I.edit} Изменить</button>
                  <button class="btn btn-ghost btn-sm" data-toggle="${p.id}"
                          title="${p.is_active ? 'Скрыть из магазина' : 'Показать в магазине'}"
                          aria-label="${p.is_active ? 'Скрыть' : 'Показать'}">${p.is_active ? I.eyeOff : I.eye}</button>
                  <button class="btn btn-ghost btn-sm" data-del="${p.id}" title="Удалить"
                          aria-label="Удалить">${I.trash}</button>
                </div>
              </td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
      ${data.pages > 1 ? `<div style="display:flex;gap:6px;justify-content:center;margin-top:16px">
        ${Array.from({ length: data.pages }, (_, i) => i + 1).map((n) =>
          `<button class="btn ${n === data.page ? '' : 'btn-ghost'} btn-sm" data-page="${n}">${n}</button>`).join('')}
      </div>` : ''}`;

    $$('[data-edit]', host).forEach((b) => b.addEventListener('click', () => productForm(Number(b.dataset.edit))));
    $$('[data-page]', host).forEach((b) => b.addEventListener('click', () => { pState.page = Number(b.dataset.page); loadProducts(); }));

    $$('[data-toggle]', host).forEach((b) => b.addEventListener('click', async () => {
      await api(`/api/admin/products/${b.dataset.toggle}/toggle`, { method: 'PATCH' });
      toast('Видимость изменена', 'ok');
      loadProducts();
    }));

    $$('[data-del]', host).forEach((b) => b.addEventListener('click', () => {
      confirmDialog('Удалить товар безвозвратно? Восстановить его будет нельзя.', async () => {
        await api(`/api/admin/products/${b.dataset.del}`, { method: 'DELETE' });
        toast('Товар удалён', 'ok');
        loadProducts();
      });
    }));

    $$('[data-stock]', host).forEach((input) => input.addEventListener('change', async () => {
      await api(`/api/admin/products/${input.dataset.stock}/stock`, {
        method: 'PATCH', body: { stock: Number(input.value) || 0 },
      });
      toast('Остаток обновлён', 'ok');
      loadProducts();
    }));
  }

  /* ---------- Форма товара ---------- */
  async function productForm(id = 0) {
    await ensureRefs();
    const { skinTypes, concerns } = cache.meta;
    let p = {
      name: '', brand_id: '', category_id: '', short_desc: '', description: '',
      ingredients: '', how_to_use: '', volume: '', price: '', old_price: 0, stock: 1,
      skin_types: [], concerns: [], rating: 5, is_active: 1, is_featured: 0, is_new: 0, images: [],
    };
    if (id) p = (await api(`/api/admin/products/${id}`)).product;

    const chk = (list, selected, name) => list.map((x) => `
      <label class="chk${selected.includes(x.id) ? ' on' : ''}">
        <input type="checkbox" name="${name}" value="${esc(x.id)}" ${selected.includes(x.id) ? 'checked' : ''}>
        ${esc(x.name)}
      </label>`).join('');

    const { el, close } = modal({
      title: id ? 'Редактирование товара' : 'Новый товар',
      body: `
        <form id="pf">
          <div class="field">
            <label for="pf-name">Название <em>*</em></label>
            <input id="pf-name" type="text" value="${esc(p.name)}" required placeholder="Например: Heartleaf 77% Soothing Toner">
          </div>

          <div class="grid-2">
            <div class="field">
              <label for="pf-brand">Бренд</label>
              <select id="pf-brand"><option value="">— не указан —</option>
                ${cache.brands.map((b) => `<option value="${b.id}"${p.brand_id === b.id ? ' selected' : ''}>${esc(b.name)}</option>`).join('')}</select>
            </div>
            <div class="field">
              <label for="pf-category">Раздел</label>
              <select id="pf-category"><option value="">— не указан —</option>
                ${cache.categories.map((c) => `<option value="${c.id}"${p.category_id === c.id ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}</select>
            </div>
          </div>

          <div class="grid-3">
            <div class="field">
              <label for="pf-price">Цена, сум <em>*</em></label>
              <input id="pf-price" type="number" min="0" step="1000" value="${p.price}" required>
            </div>
            <div class="field">
              <label for="pf-old">Старая цена</label>
              <input id="pf-old" type="number" min="0" step="1000" value="${p.old_price || ''}" placeholder="для показа скидки">
            </div>
            <div class="field">
              <label for="pf-stock">Остаток, шт.</label>
              <input id="pf-stock" type="number" min="0" value="${p.stock}">
            </div>
          </div>

          <div class="grid-2">
            <div class="field">
              <label for="pf-volume">Объём / вес</label>
              <input id="pf-volume" type="text" value="${esc(p.volume)}" placeholder="150 мл">
            </div>
            <div class="field">
              <label for="pf-rating">Рейтинг (0–5)</label>
              <input id="pf-rating" type="number" min="0" max="5" step="0.1" value="${p.rating}">
            </div>
          </div>

          <div class="field">
            <label for="pf-short">Краткое описание</label>
            <input id="pf-short" type="text" value="${esc(p.short_desc)}" placeholder="Одно предложение для карточки товара">
          </div>

          <div class="field">
            <label for="pf-desc">Полное описание</label>
            <textarea id="pf-desc" placeholder="Подробно о средстве, эффекте, для кого подходит">${esc(p.description)}</textarea>
          </div>

          <div class="field">
            <label for="pf-use">Применение</label>
            <textarea id="pf-use" style="min-height:66px">${esc(p.how_to_use)}</textarea>
          </div>

          <div class="field">
            <label for="pf-ing">Состав</label>
            <textarea id="pf-ing" style="min-height:66px">${esc(p.ingredients)}</textarea>
          </div>

          <div class="field">
            <label>Тип кожи</label>
            <div class="chk-grid">${chk(skinTypes, p.skin_types, 'skin')}</div>
          </div>

          <div class="field">
            <label>Решает задачи</label>
            <div class="chk-grid">${chk(concerns, p.concerns, 'concern')}</div>
          </div>

          <div class="field">
            <label>Фотографии</label>
            <div class="dropzone" id="dz">
              <div class="dz-ico">${I.camera}</div>
              <div><b>Перетащите фото сюда</b> или нажмите для выбора</div>
              <div style="font-size:.75rem;margin-top:4px">JPG, PNG, WebP · до 8 МБ · до 8 файлов</div>
              <input type="file" id="file-input" accept="image/*" multiple hidden>
            </div>
            <div class="img-list" id="img-list"></div>
            <div class="hint">Первое фото — главное, именно оно показывается в каталоге.</div>
          </div>

          <div class="card" style="background:#FCFAFB;padding:14px">
            <label class="switch"><input type="checkbox" id="pf-active" ${p.is_active ? 'checked' : ''}><span class="track"></span><b>Показывать в магазине</b></label>
            <label class="switch"><input type="checkbox" id="pf-featured" ${p.is_featured ? 'checked' : ''}><span class="track"></span><b>Хит продаж (на главной)</b></label>
            <label class="switch"><input type="checkbox" id="pf-new" ${p.is_new ? 'checked' : ''}><span class="track"></span><b>Новинка</b></label>
          </div>
        </form>`,
      footer: `<button class="btn btn-ghost" data-close>Отмена</button>
               <button class="btn" id="pf-save">${id ? 'Сохранить' : 'Добавить товар'}</button>`,
    });

    /* --- изображения --- */
    let images = [...(p.images || [])];
    const listEl = $('#img-list', el);

    function drawImages() {
      listEl.innerHTML = images.map((url, i) => `
        <div class="img-item">
          <img src="${esc(url)}" alt="">
          ${i === 0 ? '<div class="main-flag">ГЛАВНОЕ</div>' : `<div class="main-flag" style="cursor:pointer" data-up="${i}">Сделать главным</div>`}
          <button type="button" data-rm="${i}" aria-label="Удалить фото">${I.close}</button>
        </div>`).join('');
      $$('[data-rm]', listEl).forEach((b) => b.addEventListener('click', () => { images.splice(Number(b.dataset.rm), 1); drawImages(); }));
      $$('[data-up]', listEl).forEach((b) => b.addEventListener('click', () => {
        const i = Number(b.dataset.up);
        images.unshift(images.splice(i, 1)[0]);
        drawImages();
      }));
    }
    drawImages();

    const dz = $('#dz', el);
    const fileInput = $('#file-input', el);
    dz.addEventListener('click', () => fileInput.click());
    dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('drag'); });
    dz.addEventListener('dragleave', () => dz.classList.remove('drag'));
    dz.addEventListener('drop', (e) => { e.preventDefault(); dz.classList.remove('drag'); uploadFiles(e.dataTransfer.files); });
    fileInput.addEventListener('change', () => uploadFiles(fileInput.files));

    async function uploadFiles(files) {
      if (!files?.length) return;
      const status = dz.querySelector('div:nth-child(2)');
      const list = Array.from(files).slice(0, 8);

      status.innerHTML = '<b>Готовим фото…</b>';
      let saved = 0;
      const prepared = [];
      for (const f of list) {
        const out = await shrinkImage(f);
        saved += f.size - out.size;
        prepared.push(out);
      }

      /* По одному фото на запрос: у хостинга есть предел размера запроса
         (на Vercel 4,5 МБ), и восемь фото разом могли бы в него не влезть */
      try {
        for (let i = 0; i < prepared.length; i++) {
          status.innerHTML = `<b>Загружаем ${prepared.length > 1 ? `${i + 1} из ${prepared.length}` : ''}…</b>`;
          const fd = new FormData();
          fd.append('images', prepared[i]);
          const res = await fetch('/api/admin/upload', { method: 'POST', body: fd });
          const data = await res.json().catch(() => ({ error: res.status === 413 ? 'Фото слишком большое' : 'Ошибка загрузки' }));
          if (!res.ok) throw new Error(data.error || 'Ошибка загрузки');
          images = [...images, ...data.urls].slice(0, 8);
          drawImages();
        }
        toast(saved > 100 * 1024
          ? `Фото загружены, сжаты на ${Math.round(saved / 1024 / 1024 * 10) / 10} МБ`
          : 'Фото загружены', 'ok');
      } catch (err) { toast(err.message, 'err'); }
      status.innerHTML = '<b>Перетащите фото сюда</b> или нажмите для выбора';
      fileInput.value = '';
    }

    /* --- переключение чекбоксов --- */
    $$('.chk input', el).forEach((cb) => cb.addEventListener('change', () =>
      cb.closest('.chk').classList.toggle('on', cb.checked)));

    /* --- сохранение --- */
    $('#pf-save', el).addEventListener('click', async () => {
      const body = {
        name: $('#pf-name', el).value.trim(),
        brand_id: $('#pf-brand', el).value,
        category_id: $('#pf-category', el).value,
        price: $('#pf-price', el).value,
        old_price: $('#pf-old', el).value || 0,
        stock: $('#pf-stock', el).value,
        volume: $('#pf-volume', el).value,
        rating: $('#pf-rating', el).value,
        short_desc: $('#pf-short', el).value,
        description: $('#pf-desc', el).value,
        how_to_use: $('#pf-use', el).value,
        ingredients: $('#pf-ing', el).value,
        skin_types: $$('input[name=skin]:checked', el).map((x) => x.value),
        concerns: $$('input[name=concern]:checked', el).map((x) => x.value),
        is_active: $('#pf-active', el).checked,
        is_featured: $('#pf-featured', el).checked,
        is_new: $('#pf-new', el).checked,
        images,
      };
      if (!body.name) return toast('Укажите название товара', 'err');
      if (!body.price || Number(body.price) <= 0) return toast('Укажите цену товара', 'err');

      const btn = $('#pf-save', el);
      btn.disabled = true; btn.textContent = 'Сохраняем…';
      try {
        if (id) await api(`/api/admin/products/${id}`, { method: 'PUT', body });
        else await api('/api/admin/products', { method: 'POST', body });
        toast(id ? 'Товар обновлён' : 'Товар добавлен', 'ok');
        close();
        cache.categories = []; // счётчики могли измениться
        loadProducts();
      } catch (err) {
        btn.disabled = false; btn.textContent = id ? 'Сохранить' : 'Добавить товар';
        toast(err.message, 'err');
      }
    });
  }

  /* ======================================================================
     Разделы и бренды (общая таблица)
     ====================================================================== */
  function refPage(kind) {
    const isCat = kind === 'categories';
    const conf = isCat
      ? { title: 'Разделы каталога', sub: 'Категории, по которым покупатели ищут товары', add: '+ Добавить раздел', one: 'раздел' }
      : { title: 'Бренды', sub: 'Корейские марки, представленные в магазине', add: '+ Добавить бренд', one: 'бренд' };

    return async function () {
      const page = $('#page');
      page.innerHTML = `<div class="page-head"><div><h2>${conf.title}</h2><p>${conf.sub}</p></div>
        <button class="btn" id="add-ref">${conf.add}</button></div><div id="ref-table">${loading(5)}</div>`;

      $('#add-ref').addEventListener('click', () => refForm(kind));
      await loadRef(kind, conf);
    };
  }

  async function loadRef(kind, conf) {
    const isCat = kind === 'categories';
    const data = await api(`/api/admin/${kind}`);
    cache[kind] = data.items;
    const host = $('#ref-table');
    if (!host) return;

    if (!data.items.length) {
      host.innerHTML = `<div class="card"><div class="empty-state"><div class="e-ico">${isCat ? I.categories : I.brands}</div>
        <h3>Пока пусто</h3><p>Добавьте первый ${conf.one}, чтобы группировать товары.</p></div></div>`;
      return;
    }

    host.innerHTML = `
      <div class="table-wrap"><table>
        <thead><tr>
          <th>Название</th><th>Описание</th><th class="num">Товаров</th><th class="num">Порядок</th><th></th>
        </tr></thead>
        <tbody>${data.items.map((x) => `
          <tr>
            <td><div class="t-name">${esc(x.name)}</div><div class="t-sub">/${esc(x.slug)}</div></td>
            <td><span class="t-sub">${esc((x.description || '—').slice(0, 70))}${(x.description || '').length > 70 ? '…' : ''}</span></td>
            <td class="num"><b>${x.count}</b></td>
            <td class="num"><span class="t-sub">${x.sort_order}</span></td>
            <td><div class="t-actions">
              <button class="btn btn-ghost btn-sm" data-edit="${x.id}">${I.edit} Изменить</button>
              <button class="btn btn-ghost btn-sm" data-del="${x.id}" data-count="${x.count}"
                      data-name="${esc(x.name)}" title="Удалить" aria-label="Удалить">${I.trash}</button>
            </div></td>
          </tr>`).join('')}
        </tbody></table></div>`;

    $$('[data-edit]', host).forEach((b) => b.addEventListener('click', () =>
      refForm(kind, data.items.find((x) => x.id === Number(b.dataset.edit)))));

    $$('[data-del]', host).forEach((b) => b.addEventListener('click', () => {
      const n = Number(b.dataset.count);
      const warn = n
        ? `У «${b.dataset.name}» ${n} ${plural(n, 'товар', 'товара', 'товаров')}. `
          + `${plural(n, 'Он останется', 'Они останутся', 'Они останутся')} в каталоге, но ${plural(n, 'потеряет', 'потеряют', 'потеряют')} привязку. Удалить?`
        : `Удалить «${b.dataset.name}»?`;
      confirmDialog(warn, async () => {
        await api(`/api/admin/${kind}/${b.dataset.del}`, { method: 'DELETE' });
        cache.categories = [];
        toast('Удалено', 'ok');
        loadRef(kind, conf);
      });
    }));
  }

  function refForm(kind, item = null) {
    const isCat = kind === 'categories';
    const x = item || { name: '', description: '', logo: '', sort_order: 100 };

    const { el, close } = modal({
      title: item ? `Изменить: ${item.name}` : (isCat ? 'Новый раздел' : 'Новый бренд'),
      narrow: true,
      body: `
        <div class="field">
          <label for="rf-name">Название <em>*</em></label>
          <input id="rf-name" type="text" value="${esc(x.name)}" required
                 placeholder="${isCat ? 'Например: Сыворотки' : 'Например: COSRX'}">
        </div>
        <div class="field">
          <label for="rf-desc">Описание</label>
          <textarea id="rf-desc" style="min-height:70px">${esc(x.description || '')}</textarea>
        </div>
        <div class="field" style="margin-bottom:0">
          <label for="rf-sort">Порядок сортировки</label>
          <input id="rf-sort" type="number" value="${x.sort_order}" style="width:110px">
          <div class="hint">Чем меньше число, тем выше в списке.</div>
        </div>`,
      footer: `<button class="btn btn-ghost" data-close>Отмена</button><button class="btn" id="rf-save">Сохранить</button>`,
    });

    $('#rf-save', el).addEventListener('click', async () => {
      const body = {
        name: $('#rf-name', el).value.trim(),
        description: $('#rf-desc', el).value.trim(),
        sort_order: Number($('#rf-sort', el).value) || 100,
      };
      if (!body.name) return toast('Укажите название', 'err');

      try {
        if (item) await api(`/api/admin/${kind}/${item.id}`, { method: 'PUT', body });
        else await api(`/api/admin/${kind}`, { method: 'POST', body });
        toast('Сохранено', 'ok');
        close();
        cache.categories = [];
        loadRef(kind, { one: isCat ? 'раздел' : 'бренд' });
      } catch (err) { toast(err.message, 'err'); }
    });
  }

  const categories = refPage('categories');
  const brands = refPage('brands');

  /* ======================================================================
     Заказы
     ====================================================================== */
  const STATUS_MAP = {
    new:       { tag: 'tag-warn',   label: 'Новый' },
    confirmed: { tag: 'tag-rose',   label: 'Подтверждён' },
    shipped:   { tag: 'tag-gold',   label: 'Доставляется' },
    done:      { tag: 'tag-ok',     label: 'Выполнен' },
    canceled:  { tag: 'tag-off',    label: 'Отменён' },
  };
  const oState = { status: '', search: '' };

  async function orders() {
    const page = $('#page');
    page.innerHTML = `
      <div class="page-head"><div><h2>Заказы</h2><p>Нажмите на заказ, чтобы посмотреть состав</p></div></div>
      <div class="toolbar">
        <input type="search" id="o-search" placeholder="Номер, имя или телефон" value="${esc(oState.search)}">
        <select id="o-status">
          <option value="">Все статусы</option>
          ${Object.entries(STATUS_MAP).map(([k, v]) => `<option value="${k}"${oState.status === k ? ' selected' : ''}>${v.label}</option>`).join('')}
        </select>
      </div>
      <div id="o-table">${loading(6)}</div>`;

    let t;
    $('#o-search').addEventListener('input', (e) => {
      clearTimeout(t); t = setTimeout(() => { oState.search = e.target.value; loadOrders(); }, 350);
    });
    $('#o-status').addEventListener('change', (e) => { oState.status = e.target.value; loadOrders(); });
    loadOrders();
  }

  async function loadOrders() {
    const host = $('#o-table');
    if (!host) return;
    const q = new URLSearchParams();
    if (oState.status) q.set('status', oState.status);
    if (oState.search) q.set('search', oState.search);
    const { items } = await api('/api/admin/orders?' + q);

    setPill('orders', items.filter((o) => o.status === 'new').length);

    if (!items.length) {
      host.innerHTML = `<div class="card"><div class="empty-state"><div class="e-ico">${I.orders}</div>
        <h3>Заказов не найдено</h3><p>Новые заказы из магазина появятся здесь автоматически.</p></div></div>`;
      return;
    }

    host.innerHTML = `
      <div class="table-wrap"><table>
        <thead><tr><th>Заказ</th><th>Покупатель</th><th>Получение</th><th class="num">Сумма</th><th>Статус</th><th></th></tr></thead>
        <tbody>${items.map((o) => `
          <tr class="order-row" data-open="${o.id}">
            <td><div class="t-name">${esc(o.code)}</div><div class="t-sub">${dt(o.created_at)}</div></td>
            <td><div class="t-name">${esc(o.customer_name)}</div><div class="t-sub">${esc(o.phone)}</div></td>
            <td><span class="t-sub">${o.delivery === 'delivery' ? 'Доставка' : 'Самовывоз'}</span></td>
            <td class="num"><b>${money(o.total)}</b><div class="t-sub">${o.items.length} ${plural(o.items.length, 'позиция', 'позиции', 'позиций')}</div></td>
            <td><span class="tag ${STATUS_MAP[o.status]?.tag || 'tag-off'}">${STATUS_MAP[o.status]?.label || o.status}</span></td>
            <td><div class="t-actions"><button class="btn btn-ghost btn-sm">Подробнее</button></div></td>
          </tr>
          <tr class="order-detail hidden" data-detail="${o.id}"><td colspan="6"><div class="od-box">
            <div>
              <h3 style="font-size:.9rem;margin-bottom:10px">Состав заказа</h3>
              <div class="od-items">
                ${o.items.map((i) => `<div class="od-item"><span>${esc(i.name)} <span class="t-sub">× ${i.qty}</span></span><b>${money(i.price * i.qty)}</b></div>`).join('')}
                <div class="od-item" style="border:none;padding-top:10px"><b>Итого</b><b>${money(o.total)}</b></div>
              </div>
              <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:16px">
                <select data-status="${o.id}" style="padding:8px 12px;border:1px solid var(--line);border-radius:9px">
                  ${Object.entries(STATUS_MAP).map(([k, v]) => `<option value="${k}"${o.status === k ? ' selected' : ''}>${v.label}</option>`).join('')}
                </select>
                <a class="btn btn-gold btn-sm" href="https://t.me/${esc((o.telegram || '').replace(/^@/, ''))}" target="_blank" rel="noopener"
                   ${o.telegram ? '' : 'style="display:none"'}>Написать в Telegram</a>
                <a class="btn btn-ghost btn-sm" href="tel:${esc(o.phone.replace(/[^\d+]/g, ''))}">Позвонить</a>
                <button class="btn btn-danger btn-sm" data-odel="${o.id}">Удалить заказ</button>
              </div>
            </div>
            <dl class="od-meta">
              <dt>Телефон</dt><dd>${esc(o.phone)}</dd>
              ${o.telegram ? `<dt>Telegram</dt><dd>@${esc(o.telegram)}</dd>` : ''}
              <dt>Способ получения</dt><dd>${o.delivery === 'delivery' ? 'Доставка курьером' : 'Самовывоз'}</dd>
              ${o.address ? `<dt>Адрес</dt><dd>${esc(o.address)}</dd>` : ''}
              ${o.comment ? `<dt>Комментарий</dt><dd>${esc(o.comment)}</dd>` : ''}
              <dt>Создан</dt><dd>${dt(o.created_at)}</dd>
            </dl>
          </div></td></tr>`).join('')}
        </tbody></table></div>`;

    $$('[data-open]', host).forEach((row) => row.addEventListener('click', (e) => {
      if (e.target.closest('select, a, button[data-odel]')) return;
      $(`[data-detail="${row.dataset.open}"]`, host).classList.toggle('hidden');
    }));

    $$('[data-status]', host).forEach((sel) => sel.addEventListener('change', async () => {
      await api(`/api/admin/orders/${sel.dataset.status}`, { method: 'PATCH', body: { status: sel.value } });
      toast('Статус обновлён', 'ok');
      loadOrders();
    }));

    $$('[data-odel]', host).forEach((b) => b.addEventListener('click', () => {
      confirmDialog('Удалить заказ из базы? Действие необратимо.', async () => {
        await api(`/api/admin/orders/${b.dataset.odel}`, { method: 'DELETE' });
        toast('Заказ удалён', 'ok');
        loadOrders();
      });
    }));
  }

  /* ======================================================================
     Настройки
     ====================================================================== */
  const SETTING_FIELDS = [
    ['shop_name', 'Название магазина', 'text'],
    ['tagline', 'Слоган', 'text'],
    ['phone', 'Телефон', 'text'],
    ['telegram', 'Telegram (без @)', 'text'],
    ['instagram', 'Instagram (без @)', 'text'],
    ['city', 'Город', 'text'],
    ['address', 'Адрес', 'text'],
    ['work_hours', 'Часы работы', 'text'],
    ['delivery_city_price', 'Стоимость доставки по городу, сум', 'number'],
    ['free_delivery_from', 'Бесплатная доставка от суммы, сум', 'number'],
  ];

  async function settings() {
    const page = $('#page');
    page.innerHTML = `<div class="page-head"><div><h2>Настройки</h2><p>Контакты магазина и параметры доставки</p></div></div>${loading(3)}`;

    const { settings: s } = await api('/api/admin/settings');

    page.innerHTML = `
      <div class="page-head"><div><h2>Настройки</h2><p>Контакты магазина и параметры доставки</p></div></div>
      <div class="grid-2" style="align-items:start">
        <div class="card">
          <h3>Магазин и контакты</h3>
          ${SETTING_FIELDS.map(([key, label, type]) => `
            <div class="field">
              <label for="s-${key}">${label}</label>
              <input id="s-${key}" type="${type}" value="${esc(s[key] ?? '')}">
            </div>`).join('')}
          <button class="btn" id="save-settings">Сохранить настройки</button>
        </div>

        <div>
          <div class="card">
            <h3>Смена пароля</h3>
            <div class="field"><label for="pw-cur">Текущий пароль</label><input id="pw-cur" type="password" autocomplete="current-password"></div>
            <div class="field"><label for="pw-new">Новый пароль</label><input id="pw-new" type="password" autocomplete="new-password"><div class="hint">Минимум 6 символов.</div></div>
            <div class="field"><label for="pw-rep">Повторите новый пароль</label><input id="pw-rep" type="password" autocomplete="new-password"></div>
            <button class="btn btn-ghost" id="save-pw">Изменить пароль</button>
          </div>

          <div class="card" id="tg-card">
            <h3>Уведомления о заказах в Telegram</h3>
            <div id="tg-body"></div>
          </div>

          <div class="card">
            <h3>Логотип</h3>
            <p style="color:var(--muted);font-size:.84rem">
              Чтобы поставить свой логотип, положите файл <code>logo.png</code> (квадратный, от 200×200)
              в папку <code>public/img/</code>. Он подхватится автоматически на всех страницах.
            </p>
          </div>

          <div class="card">
            <h3>Резервная копия</h3>
            <p style="color:var(--muted);font-size:.84rem;margin-bottom:0">
              Товары, заказы, настройки и фото хранятся в одной базе. Копию на свой
              компьютер делает команда <code>npm run backup</code> — как её запустить
              для работающего сайта, написано в DEPLOY.md.
            </p>
          </div>
        </div>
      </div>`;

    $('#save-settings').addEventListener('click', async () => {
      const body = {};
      SETTING_FIELDS.forEach(([key]) => { body[key] = $(`#s-${key}`).value.trim(); });
      body.telegram = body.telegram.replace(/^@/, '');
      body.instagram = body.instagram.replace(/^@/, '');
      try {
        await api('/api/admin/settings', { method: 'PUT', body });
        toast('Настройки сохранены', 'ok');
      } catch (err) { toast(err.message, 'err'); }
    });

    $('#save-pw').addEventListener('click', async () => {
      const cur = $('#pw-cur').value, next = $('#pw-new').value, rep = $('#pw-rep').value;
      if (next.length < 6) return toast('Новый пароль — минимум 6 символов', 'err');
      if (next !== rep) return toast('Пароли не совпадают', 'err');
      try {
        await api('/api/admin/password', { method: 'POST', body: { current: cur, next } });
        toast('Пароль изменён', 'ok');
        ['#pw-cur', '#pw-new', '#pw-rep'].forEach((s) => { $(s).value = ''; });
      } catch (err) { toast(err.message, 'err'); }
    });

    renderTelegram();
  }

  /* ---------- Настройка уведомлений в Telegram ----------
     Три шага: токен бота → найти чат → проверить. Всё внутри админки,
     чтобы не пришлось искать chat_id вручную. */
  async function renderTelegram() {
    const host = $('#tg-body');
    if (!host) return;
    host.innerHTML = '<div class="skeleton-row"></div>';

    let state;
    try { state = await api('/api/admin/telegram'); }
    catch { host.innerHTML = '<p style="color:var(--danger)">Не удалось загрузить настройки.</p>'; return; }

    if (state.configured) {
      host.innerHTML = `
        <p style="margin:0 0 12px">
          <span class="tag tag-ok">Подключено</span>
          ${state.botUsername ? `<span class="t-sub" style="margin-left:8px">бот @${esc(state.botUsername)}</span>` : ''}
        </p>
        <p style="color:var(--ink-3);font-size:.86rem">
          Новые заказы приходят в Telegram сразу после оформления —
          с составом, телефоном и адресом.
        </p>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn-ghost btn-sm" id="tg-retest">Отправить тест</button>
          <button class="btn btn-ghost btn-sm" id="tg-off">Отключить</button>
        </div>`;

      $('#tg-retest').addEventListener('click', async (e) => {
        e.target.disabled = true; e.target.textContent = 'Отправляем…';
        try { await api('/api/admin/telegram/test', { method: 'POST', body: {} }); toast('Сообщение отправлено', 'ok'); }
        catch (err) { toast(err.message, 'err'); }
        e.target.disabled = false; e.target.textContent = 'Отправить тест';
      });

      $('#tg-off').addEventListener('click', () => {
        confirmDialog('Отключить уведомления? Заказы будут видны только в админ-панели.', async () => {
          await api('/api/admin/telegram', { method: 'DELETE' });
          toast('Уведомления отключены', 'ok');
          renderTelegram();
        });
      });
      return;
    }

    /* Не настроено — показываем пошаговую инструкцию */
    host.innerHTML = `
      <p style="color:var(--ink-3);font-size:.86rem;margin-top:0">
        Сейчас заказы видны только здесь, в админ-панели. Подключите бота —
        и они будут приходить вам в Telegram сразу.
      </p>

      <div class="field">
        <label for="tg-token"><b>Шаг 1.</b> Токен бота</label>
        <input id="tg-token" type="text" placeholder="1234567890:AAF..." autocomplete="off">
        <div class="hint">
          Откройте в Telegram <b>@BotFather</b> → команда <code>/newbot</code> →
          придумайте имя. Он пришлёт строку с двоеточием — вставьте её сюда.
        </div>
      </div>
      <button class="btn btn-sm" id="tg-save-token">Проверить токен</button>

      <div id="tg-step2" class="hidden" style="margin-top:18px">
        <div class="field" style="margin-bottom:8px">
          <label><b>Шаг 2.</b> Куда присылать заказы</label>
          <div class="hint" id="tg-step2-hint">
            Напишите своему боту любое сообщение (например «привет»), затем нажмите кнопку ниже.
          </div>
        </div>
        <button class="btn btn-sm" id="tg-detect">Найти мой чат</button>
        <div id="tg-chats" style="margin-top:12px"></div>
      </div>`;

    $('#tg-save-token').addEventListener('click', async (e) => {
      const token = $('#tg-token').value.trim();
      if (!token) return toast('Вставьте токен от @BotFather', 'err');
      e.target.disabled = true; e.target.textContent = 'Проверяем…';
      try {
        const info = await api('/api/admin/telegram/check', { method: 'POST', body: { token } });
        toast(`Бот @${info.username} на связи`, 'ok');
        $('#tg-step2').classList.remove('hidden');
        $('#tg-step2-hint').innerHTML =
          `Откройте <a href="https://t.me/${esc(info.username)}" target="_blank" rel="noopener"><b>@${esc(info.username)}</b></a>,
           нажмите «Начать» и напишите любое сообщение. Потом вернитесь и нажмите кнопку ниже.`;
      } catch (err) { toast(err.message, 'err'); }
      e.target.disabled = false; e.target.textContent = 'Проверить токен';
    });

    $('#tg-detect').addEventListener('click', async (e) => {
      e.target.disabled = true; e.target.textContent = 'Ищем…';
      try {
        const { chats } = await api('/api/admin/telegram/detect', { method: 'POST', body: {} });
        $('#tg-chats').innerHTML = chats.map((c) => `
          <button class="btn btn-ghost btn-sm" data-chat="${esc(c.id)}" style="margin:0 6px 6px 0">
            ${esc(c.title)} <span class="t-sub">(${esc(c.type)})</span>
          </button>`).join('');

        $$('#tg-chats [data-chat]').forEach((btn) => btn.addEventListener('click', async () => {
          try {
            await api('/api/admin/telegram/test', { method: 'POST', body: { chatId: btn.dataset.chat } });
            toast('Готово! Проверьте Telegram', 'ok');
            renderTelegram();
          } catch (err) { toast(err.message, 'err'); }
        }));
      } catch (err) { toast(err.message, 'err'); }
      e.target.disabled = false; e.target.textContent = 'Найти мой чат';
    });
  }

  /* ======================================================================
     Старт
     ====================================================================== */
  (async function init() {
    try {
      await api('/api/admin/me');
      renderApp();
    } catch {
      renderLogin();
    }
  })();
})();
