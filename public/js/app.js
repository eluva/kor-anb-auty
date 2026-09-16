/* ==========================================================================
   Korean Beauty — общий фронтенд-слой:
   API-клиент, корзина, избранное, шапка/подвал, карточки товаров.
   ========================================================================== */
(function () {
  'use strict';

  /* Сообщаем стилям, что скрипты работают: только тогда включается появление
     по прокрутке. Если JS упадёт, содержимое останется видимым. */
  document.documentElement.classList.add('js');

  /* ---------------- утилиты ---------------- */
  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const money = (n) => new Intl.NumberFormat('ru-RU').format(Math.round(Number(n) || 0)) + ' сум';

  const esc = (s) => String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  const plural = (n, one, few, many) => {
    const a = Math.abs(n) % 100; const b = a % 10;
    if (a > 10 && a < 20) return many;
    if (b > 1 && b < 5) return few;
    if (b === 1) return one;
    return many;
  };

  async function api(path, options = {}) {
    const res = await fetch(path, {
      headers: options.body ? { 'Content-Type': 'application/json' } : {},
      ...options,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    let data = null;
    try { data = await res.json(); } catch { /* пустой ответ */ }
    if (!res.ok) throw new Error(data?.error || `Ошибка ${res.status}`);
    return data;
  }

  /* ---------------- уведомления ---------------- */
  let toastBox;
  function toast(message, type = '') {
    if (!toastBox) {
      toastBox = document.createElement('div');
      toastBox.className = 'toasts';
      document.body.appendChild(toastBox);
    }
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = message;
    toastBox.appendChild(el);
    setTimeout(() => {
      el.style.transition = 'opacity .3s, transform .3s';
      el.style.opacity = '0';
      el.style.transform = 'translateY(10px)';
      setTimeout(() => el.remove(), 320);
    }, 2800);
  }

  /* ---------------- хранилище ---------------- */
  const store = {
    read(key, fallback) {
      try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
      catch { return fallback; }
    },
    write(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* приватный режим */ }
    },
  };

  /* ---------------- корзина ---------------- */
  const Cart = {
    items: store.read('kb_cart', []),
    save() {
      store.write('kb_cart', this.items);
      document.dispatchEvent(new CustomEvent('cart:change'));
    },
    count() { return this.items.reduce((s, i) => s + i.qty, 0); },
    find(id) { return this.items.find((i) => i.id === Number(id)); },
    add(product, qty = 1) {
      const id = Number(product.id);
      const line = this.find(id);
      if (line) line.qty = Math.min(line.qty + qty, 99);
      else this.items.push({ id, qty: Math.min(qty, 99) });
      this.save();
      toast(`«${product.name}» — в корзине`, 'ok');
    },
    setQty(id, qty) {
      const line = this.find(id);
      if (!line) return;
      if (qty <= 0) return this.remove(id);
      line.qty = Math.min(qty, 99);
      this.save();
    },
    remove(id) {
      this.items = this.items.filter((i) => i.id !== Number(id));
      this.save();
    },
    clear() { this.items = []; this.save(); },
  };

  /* ---------------- избранное ---------------- */
  const Fav = {
    ids: store.read('kb_fav', []),
    has(id) { return this.ids.includes(Number(id)); },
    toggle(id) {
      id = Number(id);
      this.ids = this.has(id) ? this.ids.filter((x) => x !== id) : [...this.ids, id];
      store.write('kb_fav', this.ids);
      document.dispatchEvent(new CustomEvent('fav:change'));
      return this.has(id);
    },
  };

  /* ---------------- иконки ---------------- */
  /* Единый контурный набор из icons.js. Эмодзи в интерфейсе не используем —
     они рисуются по-разному в Windows, Android и iOS. */
  const ICON = window.KB_ICONS;

  /* ---------------- логотип ---------------- */
  /* Монограмма: плоская, без градиентов — бронза по тёмному винному полю.
     Повторяет знак магазина (золото на розовом), но в палитре сайта. */
  const LOGO_SVG = `<svg viewBox="0 0 100 100" aria-hidden="true">
    <rect width="100" height="100" rx="6" fill="#7A4750"/>
    <rect x="6" y="6" width="88" height="88" rx="3" fill="none" stroke="#E8C98B" stroke-width="1.5" opacity=".65"/>
    <text x="50" y="64" text-anchor="middle" font-family="Playfair Display, Georgia, serif"
          font-size="40" font-weight="600" fill="#F0D9A8" letter-spacing="-1">K&amp;B</text>
  </svg>`;

  /* Встроенный SVG рисуем сразу — он доступен всегда. Если магазин положил свой
     файл /img/logo.png, один раз проверяем его и подменяем метку на всех местах.
     Так логотип не ломается при отсутствии файла и не мигает при его наличии. */
  function logoMarkup(withText = true) {
    return `<a href="/" class="logo" aria-label="Korean Beauty — на главную">
      <span class="logo-mark">${LOGO_SVG}</span>
      ${withText ? `<span class="logo-text"><strong>Korean Beauty</strong><span>Nukus · Since 2017</span></span>` : ''}
    </a>`;
  }

  function upgradeLogo() {
    const probe = new Image();
    probe.onload = () => {
      if (!probe.naturalWidth) return;
      $$('.logo-mark').forEach((mark) => {
        mark.innerHTML = '<img src="/img/logo.png" alt="Korean Beauty" width="48" height="48">';
      });
    };
    probe.src = '/img/logo.png';
  }

  /* ---------------- META (справочники магазина) ---------------- */
  let metaPromise = null;
  const getMeta = () => (metaPromise ||= api('/api/meta'));

  /* ---------------- шапка ---------------- */
  const NAV = [
    ['/', 'Главная'],
    ['/catalog', 'Каталог'],
    ['/catalog?sale=1', 'Скидки'],
    ['/catalog?new=1', 'Новинки'],
    ['/#about', 'О нас'],
    ['/#contacts', 'Контакты'],
  ];

  function renderHeader(settings) {
    const host = $('#site-header');
    if (!host) return;
    const path = location.pathname.replace(/\/$/, '') || '/';
    const search = location.search;

    const links = NAV.map(([href, label]) => {
      const [lp, lq] = href.split('?');
      const active = (lp.replace(/\/$/, '') || '/') === path
        && (!lq || search.includes(lq)) && !href.includes('#');
      return `<a href="${href}"${active ? ' class="active"' : ''}>${label}</a>`;
    }).join('');

    host.innerHTML = `
      <div class="topbar">
        <div class="wrap">
          <span>Оригинал из Кореи</span>
          <span>Доставка по Нукусу — <b>${esc(settings.delivery_city_price ? money(settings.delivery_city_price) : 'бесплатно')}</b></span>
          <a href="tel:${esc(settings.phone.replace(/\s/g, ''))}"><b>${esc(settings.phone)}</b></a>
        </div>
      </div>
      <header class="site-header">
        <div class="wrap">
          ${logoMarkup()}
          <nav class="nav">${links}</nav>
          <form class="header-search" role="search" action="/catalog">
            ${ICON.search}
            <input type="search" name="search" placeholder="Поиск по каталогу"
                   value="${esc(new URLSearchParams(search).get('search') || '')}" aria-label="Поиск по каталогу">
          </form>
          <div class="header-actions">
            <a class="icon-btn" href="/catalog?fav=1" aria-label="Избранное" title="Избранное">
              ${ICON.heart}<span class="cart-count" id="fav-count"></span>
            </a>
            <button class="icon-btn" id="open-cart" aria-label="Корзина" title="Корзина">
              ${ICON.bag}<span class="cart-count" id="cart-count"></span>
            </button>
            <button class="icon-btn burger" id="open-menu" aria-label="Меню">${ICON.menu}</button>
          </div>
        </div>
      </header>
      <div class="mobile-nav" id="mobile-nav">
        <div class="mn-head">${logoMarkup()}<button class="icon-btn" id="close-menu" aria-label="Закрыть">${ICON.close}</button></div>
        <form class="header-search" action="/catalog" style="display:block;max-width:none;margin:0 0 8px">
          ${ICON.search}
          <input type="search" name="search" placeholder="Поиск по каталогу" aria-label="Поиск по каталогу">
        </form>
        ${NAV.map(([href, label], i) => `<a class="mn-link" href="${href}"><i>${String(i + 1).padStart(2, '0')}</i>${label}</a>`).join('')}
        <div class="mn-foot">
          <a class="btn btn-gold" href="https://t.me/${esc(settings.telegram)}" target="_blank" rel="noopener">Написать в Telegram</a>
          <a class="btn btn-ghost" href="tel:${esc(settings.phone.replace(/\s/g, ''))}">${esc(settings.phone)}</a>
        </div>
      </div>`;

    $('#open-menu')?.addEventListener('click', () => {
      $('#mobile-nav').classList.add('open');
      document.body.classList.add('no-scroll');
    });
    $('#close-menu')?.addEventListener('click', () => {
      $('#mobile-nav').classList.remove('open');
      document.body.classList.remove('no-scroll');
    });
    $('#open-cart')?.addEventListener('click', openCart);
    updateCounters();
  }

  function updateCounters() {
    const c = $('#cart-count');
    if (c) { c.textContent = Cart.count() || ''; c.dataset.n = Cart.count(); }
    const f = $('#fav-count');
    if (f) { f.textContent = Fav.ids.length || ''; f.dataset.n = Fav.ids.length; }
  }

  /* ---------------- подвал ---------------- */
  function renderFooter(settings, meta) {
    const host = $('#site-footer');
    if (!host) return;
    const cats = (meta?.categories || []).slice(0, 6);

    host.innerHTML = `
      <footer class="site-footer" id="contacts">
        <div class="wrap">
          <div class="footer-grid">
            <div class="footer-about">
              <div class="footer-logo">${logoMarkup()}</div>
              <p>${esc(settings.tagline)}. Только оригинальная продукция лучших корейских брендов — с доставкой по Нукусу и всему Узбекистану.</p>
              <div class="socials">
                <a href="https://t.me/${esc(settings.telegram)}" target="_blank" rel="noopener" aria-label="Telegram">${ICON.telegram}</a>
                <a href="https://instagram.com/${esc(settings.instagram)}" target="_blank" rel="noopener" aria-label="Instagram">${ICON.instagram}</a>
                <a href="tel:${esc(settings.phone.replace(/\s/g, ''))}" aria-label="Позвонить">${ICON.phone}</a>
              </div>
            </div>
            <div>
              <h4>Каталог</h4>
              <ul>${cats.map((c) => `<li><a href="/catalog?category=${esc(c.slug)}">${esc(c.name)}</a></li>`).join('')}</ul>
            </div>
            <div>
              <h4>Покупателям</h4>
              <ul>
                <li><a href="/catalog?new=1">Новинки</a></li>
                <li><a href="/catalog?sale=1">Скидки</a></li>
                <li><a href="/catalog?sort=popular">Хиты продаж</a></li>
                <li><a href="/#delivery">Доставка и оплата</a></li>
                <li><a href="/#about">О магазине</a></li>
                <li><a href="/privacy">Обработка данных</a></li>
              </ul>
            </div>
            <div>
              <h4>Контакты</h4>
              <ul>
                <li><a href="tel:${esc(settings.phone.replace(/\s/g, ''))}">${esc(settings.phone)}</a></li>
                <li><a href="https://t.me/${esc(settings.telegram)}" target="_blank" rel="noopener">@${esc(settings.telegram)}</a></li>
                <li>${esc(settings.address)}</li>
                <li>${esc(settings.work_hours)}</li>
              </ul>
            </div>
          </div>
          <div class="footer-bottom">
            <span>© ${new Date().getFullYear()} Korean Beauty — Нукус, Каракалпакстан</span>
            <span>Наличные · Payme · Click · перевод на карту</span>
          </div>
        </div>
      </footer>
      <a class="tg-float" href="https://t.me/${esc(settings.telegram)}" target="_blank" rel="noopener"
         aria-label="Написать в Telegram">${ICON.telegram}</a>`;
  }

  /* ---------------- карточка товара ---------------- */
  function productCard(p) {
    const out = p.stock <= 0;
    const badges = [];
    if (p.discount > 0) badges.push(`<span class="badge badge-sale">−${p.discount}%</span>`);
    if (p.is_new) badges.push('<span class="badge badge-new">Новинка</span>');
    if (p.is_featured && !p.is_new) badges.push('<span class="badge badge-hit">Хит</span>');
    if (out) badges.push('<span class="badge badge-out">Нет в наличии</span>');

    let stockNote = '';
    if (out) stockNote = '<span class="card-stock-out">Под заказ</span>';
    else if (p.stock <= 3) stockNote = `<span class="card-stock-low">Осталось ${p.stock} шт.</span>`;

    return `
    <article class="card${out ? ' is-out' : ''}" data-id="${p.id}">
      <div class="card-media">
        <a href="/product/${esc(p.slug)}" aria-label="${esc(p.name)}">
          <img src="${esc(p.image || '/img/placeholder.svg')}" alt="${esc(p.name)}" loading="lazy" width="400" height="400">
        </a>
        <div class="card-badges">${badges.join('')}</div>
        <button class="card-fav${Fav.has(p.id) ? ' on' : ''}" data-fav="${p.id}"
                aria-label="Добавить в избранное" title="В избранное">${ICON.heart}</button>
      </div>
      <div class="card-body">
        <span class="card-brand">${esc(p.brand_name || 'Korea')}</span>
        <a href="/product/${esc(p.slug)}" class="card-name">${esc(p.name)}</a>
        <div class="card-meta">
          <span class="card-rating">${ICON.star}${Number(p.rating).toFixed(1)}</span>
          ${p.volume ? `<span>${esc(p.volume)}</span>` : ''}
        </div>
        ${stockNote}
        <div class="card-price">
          <b>${money(p.price)}</b>
          ${p.old_price > p.price ? `<s>${money(p.old_price)}</s>` : ''}
        </div>
      </div>
      <!-- Кнопка всегда видна: скрытая за наведением, она недоступна на телефоне -->
      <div class="card-quick">
        <button class="btn${out ? ' btn-ghost' : ''} btn-sm" data-add="${p.id}">
          ${out ? 'Узнать о наличии' : 'В корзину'}
        </button>
      </div>
    </article>`;
  }

  /* Делегированные клики по карточкам */
  const productCache = new Map();
  function cacheProducts(list) { list.forEach((p) => productCache.set(p.id, p)); }

  document.addEventListener('click', async (e) => {
    const favBtn = e.target.closest('[data-fav]');
    if (favBtn) {
      e.preventDefault();
      favBtn.classList.toggle('on', Fav.toggle(favBtn.dataset.fav));
      updateCounters();
      return;
    }
    const addBtn = e.target.closest('[data-add]');
    if (addBtn) {
      e.preventDefault();
      const id = Number(addBtn.dataset.add);
      let p = productCache.get(id);
      if (!p) {
        try { p = (await api(`/api/products/${addBtn.dataset.slug || ''}`)).product; } catch { /* нет данных */ }
      }
      if (!p) { toast('Товар недоступен', 'err'); return; }
      if (p.stock <= 0) {
        const s = (await getMeta()).settings;
        window.open(`https://t.me/${s.telegram}?text=${encodeURIComponent(`Здравствуйте! Подскажите по наличию: ${p.name} (${p.brand_name || ''})`)}`, '_blank');
        return;
      }
      Cart.add(p, Number(addBtn.dataset.qty) || 1);
    }
  });

  /* ---------------- панель корзины ---------------- */
  let drawerReady = false;
  function ensureDrawer() {
    if (drawerReady) return;
    drawerReady = true;
    document.body.insertAdjacentHTML('beforeend', `
      <div class="overlay" id="kb-overlay"></div>
      <aside class="drawer" id="kb-cart" role="dialog" aria-label="Корзина" aria-modal="true">
        <div class="drawer-head">
          <h3>Корзина</h3>
          <button class="icon-btn" id="close-cart" aria-label="Закрыть">${ICON.close}</button>
        </div>
        <div class="drawer-body" id="cart-body"></div>
        <div class="drawer-foot" id="cart-foot"></div>
      </aside>`);
    $('#close-cart').addEventListener('click', closeCart);
    $('#kb-overlay').addEventListener('click', () => { closeCart(); closeFilters(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeCart(); closeFilters(); } });
  }

  function closeFilters() {
    $('.filters')?.classList.remove('open');
    if (!$('#kb-cart')?.classList.contains('open')) {
      $('#kb-overlay')?.classList.remove('show');
      document.body.classList.remove('no-scroll');
    }
  }

  async function openCart() {
    ensureDrawer();
    $('#kb-cart').classList.add('open');
    $('#kb-overlay').classList.add('show');
    document.body.classList.add('no-scroll');
    await renderCartDrawer();
  }

  function closeCart() {
    $('#kb-cart')?.classList.remove('open');
    $('#kb-overlay')?.classList.remove('show');
    document.body.classList.remove('no-scroll');
  }

  async function loadCartLines() {
    if (!Cart.items.length) return [];
    try {
      const { items } = await api('/api/cart/validate', { method: 'POST', body: { items: Cart.items } });
      /* Убираем из корзины позиции, которых больше нет в каталоге */
      const alive = new Set(items.map((i) => i.id));
      if (alive.size !== Cart.items.length) {
        Cart.items = Cart.items.filter((i) => alive.has(i.id));
        store.write('kb_cart', Cart.items);
      }
      return items;
    } catch { return []; }
  }

  async function renderCartDrawer() {
    const body = $('#cart-body'); const foot = $('#cart-foot');
    if (!body) return;
    body.innerHTML = '<div class="skeleton" style="height:90px;margin-bottom:10px"></div>'.repeat(2);

    const lines = await loadCartLines();
    cacheProducts(lines);

    if (!lines.length) {
      body.innerHTML = `<div class="empty">${ICON.emptyBox}
        <h3>Корзина пуста</h3><p>Добавьте средства из каталога — мы соберём заказ и свяжемся с вами.</p>
        <a class="btn" href="/catalog">Перейти в каталог</a></div>`;
      foot.innerHTML = '';
      return;
    }

    body.innerHTML = lines.map((p) => `
      <div class="cart-line">
        <a href="/product/${esc(p.slug)}"><img src="${esc(p.image)}" alt="${esc(p.name)}" loading="lazy"></a>
        <div class="cl-body">
          <span class="cl-brand">${esc(p.brand_name || '')}</span>
          <a href="/product/${esc(p.slug)}" class="cl-name">${esc(p.name)}</a>
          <div class="cl-row">
            <div class="qty-mini">
              <button data-cart-dec="${p.id}" aria-label="Меньше">${ICON.minus}</button>
              <span>${p.qty}</span>
              <button data-cart-inc="${p.id}" aria-label="Больше">${ICON.plus}</button>
            </div>
            <span class="cl-price">${money(p.price * p.qty)}</span>
          </div>
          <button class="cl-remove" data-cart-del="${p.id}" style="margin-top:6px">Удалить</button>
        </div>
      </div>`).join('');

    const settings = (await getMeta()).settings;
    const subtotal = lines.reduce((s, p) => s + p.price * p.qty, 0);
    const freeFrom = Number(settings.free_delivery_from) || 0;
    const left = Math.max(freeFrom - subtotal, 0);

    foot.innerHTML = `
      ${freeFrom ? (left > 0
        ? `<div style="font-size:.82rem;color:var(--ink-3)">До бесплатной доставки: <b style="color:var(--accent)">${money(left)}</b></div>
           <div class="free-ship-bar"><i style="width:${Math.min(100, (subtotal / freeFrom) * 100)}%"></i></div>`
        : `<div class="free-ship" style="color:var(--ok)">Доставка по Нукусу — бесплатно</div>`) : ''}
      <div class="cart-totals">
        <div><span>${lines.reduce((s, p) => s + p.qty, 0)} ${plural(lines.reduce((s, p) => s + p.qty, 0), 'товар', 'товара', 'товаров')}</span><span>${money(subtotal)}</span></div>
        <div class="total"><span>Итого</span><span>${money(subtotal)}</span></div>
      </div>
      <a class="btn btn-block" href="/checkout">Оформить заказ</a>
      <button class="btn btn-ghost btn-block btn-sm" id="cart-clear" style="margin-top:8px">Очистить корзину</button>`;

    $('#cart-clear').addEventListener('click', () => { Cart.clear(); renderCartDrawer(); });
  }

  document.addEventListener('click', (e) => {
    const inc = e.target.closest('[data-cart-inc]');
    const dec = e.target.closest('[data-cart-dec]');
    const del = e.target.closest('[data-cart-del]');
    if (!inc && !dec && !del) return;
    const id = Number((inc || dec || del).dataset.cartInc || (dec || del).dataset.cartDec || del.dataset.cartDel);
    const line = Cart.find(id);
    if (inc) Cart.setQty(id, (line?.qty || 0) + 1);
    if (dec) Cart.setQty(id, (line?.qty || 0) - 1);
    if (del) Cart.remove(id);
    renderCartDrawer();
  });

  document.addEventListener('cart:change', () => {
    updateCounters();
    if ($('#kb-cart')?.classList.contains('open')) renderCartDrawer();
    document.dispatchEvent(new CustomEvent('cart:render'));
  });

  /* ---------------- появление при скролле ---------------- */
  function observeReveals(root = document) {
    const els = $$('.reveal:not(.in)', root);
    if (!els.length) return;
    if (!('IntersectionObserver' in window)) { els.forEach((el) => el.classList.add('in')); return; }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
      });
    }, { rootMargin: '0px 0px -60px 0px' });
    els.forEach((el) => io.observe(el));
  }

  /* ---------------- инициализация страницы ---------------- */
  async function boot() {
    let meta;
    try { meta = await getMeta(); }
    catch {
      document.body.insertAdjacentHTML('afterbegin',
        '<div style="padding:14px;background:#C0473F;color:#fff;text-align:center">Не удалось связаться с сервером магазина. Обновите страницу.</div>');
      return null;
    }
    renderHeader(meta.settings);
    renderFooter(meta.settings, meta);
    upgradeLogo();
    observeReveals();
    return meta;
  }

  /* ---------------- публичный API ---------------- */
  window.KB = {
    $, $$, api, money, esc, plural, toast, store,
    Cart, Fav, ICON, getMeta, boot, ensureDrawer,
    productCard, cacheProducts, observeReveals,
    openCart, closeCart, closeFilters, updateCounters, loadCartLines,
  };
})();
