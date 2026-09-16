/* Страница товара */
(async function () {
  'use strict';
  const { $, $$, api, esc, money, productCard, cacheProducts, Cart, Fav, toast, ICON } = window.KB;

  const meta = await window.KB.boot();
  if (!meta) return;

  const slug = decodeURIComponent(location.pathname.split('/').filter(Boolean).pop() || '');

  let data;
  try { data = await api(`/api/products/${encodeURIComponent(slug)}`); }
  catch {
    $('#product-root').innerHTML = `<div class="empty" style="padding:100px 20px">
      ${window.KB.ICON.emptyBox}<h3>Товар не найден</h3>
      <p>Возможно, он закончился или ссылка устарела.</p>
      <a class="btn" href="/catalog">Вернуться в каталог</a></div>`;
    return;
  }

  const p = data.product;
  cacheProducts([p, ...data.related]);

  /* ---------- SEO ---------- */
  document.title = `${p.name} — ${p.brand_name || 'Korean Beauty'} | Korean Beauty, Нукус`;
  document.querySelector('meta[name=description]')
    ?.setAttribute('content', `${p.short_desc || p.name}. Оригинал из Кореи, ${money(p.price)}. Доставка по Нукусу.`);

  const ld = document.createElement('script');
  ld.type = 'application/ld+json';
  ld.textContent = JSON.stringify({
    '@context': 'https://schema.org', '@type': 'Product',
    name: p.name, image: [location.origin + p.image], description: p.short_desc,
    brand: { '@type': 'Brand', name: p.brand_name || 'Korean Beauty' },
    offers: {
      '@type': 'Offer', priceCurrency: 'UZS', price: p.price,
      availability: p.stock > 0 ? 'https://schema.org/InStock' : 'https://schema.org/PreOrder',
    },
    aggregateRating: { '@type': 'AggregateRating', ratingValue: p.rating, reviewCount: Math.max(p.sold_count, 1) },
  });
  document.head.appendChild(ld);

  /* ---------- хлебные крошки ---------- */
  $('#crumbs').innerHTML = `<a href="/">Главная</a> <span>/</span> <a href="/catalog">Каталог</a>`
    + (p.category_slug ? ` <span>/</span> <a href="/catalog?category=${esc(p.category_slug)}">${esc(p.category_name)}</a>` : '')
    + ` <span>/</span> <span>${esc(p.name)}</span>`;

  /* ---------- вспомогательное ---------- */
  const skinNames = p.skin_types.map((s) => meta.skinTypes.find((t) => t.id === s)?.name).filter(Boolean);
  const concernNames = p.concerns.map((s) => meta.concerns.find((t) => t.id === s)?.name).filter(Boolean);
  const images = p.images.length ? p.images : ['/img/placeholder.svg'];
  const out = p.stock <= 0;

  const badges = [];
  if (p.discount > 0) badges.push(`<span class="badge badge-sale">−${p.discount}%</span>`);
  if (p.is_new) badges.push('<span class="badge badge-new">Новинка</span>');
  if (p.is_featured) badges.push('<span class="badge badge-hit">Хит продаж</span>');

  const stockLine = out
    ? '<span class="low-stock">Под заказ — уточните срок</span>'
    : p.stock <= 3
      ? `<span class="low-stock">Осталось ${p.stock} шт.</span>`
      : `<span class="in-stock">${ICON.check} В наличии в Нукусе</span>`;

  /* ---------- разметка ---------- */
  $('#product-root').innerHTML = `
  <div class="product-layout">
    <div class="gallery">
      <div class="gallery-main">
        <img id="main-img" src="${esc(images[0])}" alt="${esc(p.name)}" width="700" height="700">
      </div>
      ${images.length > 1 ? `<div class="gallery-thumbs">${images.map((src, i) =>
        `<button data-img="${esc(src)}" class="${i === 0 ? 'active' : ''}" aria-label="Фото ${i + 1}">
           <img src="${esc(src)}" alt="" loading="lazy"></button>`).join('')}</div>` : ''}
    </div>

    <div class="pd-head">
      <div class="pd-badges">${badges.join('')}</div>
      <a class="pd-brand" href="/catalog?brand=${esc(p.brand_slug || '')}">${esc(p.brand_name || 'Korea')}</a>
      <h1 class="pd-title">${esc(p.name)}</h1>

      <div class="pd-meta">
        <span class="card-rating">${ICON.star}${Number(p.rating).toFixed(1)}</span>
        <span>Куплено ${p.sold_count} раз</span>
        ${stockLine}
      </div>

      <div class="pd-price">
        <b>${money(p.price)}</b>
        ${p.old_price > p.price ? `<s>${money(p.old_price)}</s>
          <span class="badge badge-sale">Выгода ${money(p.old_price - p.price)}</span>` : ''}
      </div>

      ${p.short_desc ? `<p class="pd-lead">${esc(p.short_desc)}</p>` : ''}

      ${(skinNames.length || concernNames.length) ? `<div class="pd-tags">
        ${skinNames.map((n) => `<span class="tag">${esc(n)}</span>`).join('')}
        ${concernNames.map((n) => `<span class="tag">${esc(n)}</span>`).join('')}
      </div>` : ''}

      <div class="pd-buy">
        <div class="qty">
          <button id="q-dec" aria-label="Меньше">${ICON.minus}</button>
          <span id="q-val">1</span>
          <button id="q-inc" aria-label="Больше">${ICON.plus}</button>
        </div>
        <button class="btn" id="add-cart">${out ? 'Уточнить наличие' : 'Добавить в корзину'}</button>
        <button class="icon-btn" id="fav-btn" aria-label="В избранное"
                style="width:52px;height:52px;${Fav.has(p.id) ? 'border-color:var(--accent)' : ''}">${ICON.heart}</button>
      </div>

      <a class="btn btn-ghost btn-block" id="tg-order" href="#" target="_blank" rel="noopener">Быстрый заказ в Telegram</a>

      <dl class="pd-specs">
        ${p.volume ? `<div><dt>Объём</dt><dd>${esc(p.volume)}</dd></div>` : ''}
        ${p.category_name ? `<div><dt>Раздел</dt><dd>${esc(p.category_name)}</dd></div>` : ''}
        <div><dt>Страна</dt><dd>Южная Корея</dd></div>
        <div><dt>Доставка по Нукусу</dt><dd>${Number(meta.settings.delivery_city_price) ? money(meta.settings.delivery_city_price) : 'Бесплатно'}</dd></div>
        <div><dt>Оплата</dt><dd>Наличные · Payme · Click</dd></div>
      </dl>

      <div class="tabs" role="tablist">
        <button class="active" data-tab="desc">Описание</button>
        ${p.how_to_use ? '<button data-tab="use">Применение</button>' : ''}
        ${p.ingredients ? '<button data-tab="ing">Состав</button>' : ''}
        <button data-tab="ship">Доставка и оплата</button>
      </div>
      <div class="tab-panel active" id="tab-desc">${esc(p.description || p.short_desc)}</div>
      ${p.how_to_use ? `<div class="tab-panel" id="tab-use">${esc(p.how_to_use)}</div>` : ''}
      ${p.ingredients ? `<div class="tab-panel" id="tab-ing">${esc(p.ingredients)}</div>` : ''}
      <div class="tab-panel" id="tab-ship">Доставка по Нукусу — в день заказа${Number(meta.settings.free_delivery_from) ? `, бесплатно при заказе от ${money(meta.settings.free_delivery_from)}` : ''}.
По Узбекистану отправляем курьерскими службами, 2–4 дня.
Оплата: наличными при получении, Payme, Click или переводом на карту.
Вопросы по товару — пишите в Telegram @${esc(meta.settings.telegram)}.</div>
    </div>
  </div>`;

  /* ---------- галерея ---------- */
  $$('[data-img]').forEach((btn) => btn.addEventListener('click', () => {
    $('#main-img').src = btn.dataset.img;
    $$('[data-img]').forEach((b) => b.classList.toggle('active', b === btn));
  }));

  /* ---------- вкладки ---------- */
  $$('.tabs button').forEach((btn) => btn.addEventListener('click', () => {
    $$('.tabs button').forEach((b) => b.classList.toggle('active', b === btn));
    $$('.tab-panel').forEach((panel) =>
      panel.classList.toggle('active', panel.id === `tab-${btn.dataset.tab}`));
  }));

  /* ---------- количество ---------- */
  let qty = 1;
  const maxQty = out ? 1 : Math.max(p.stock, 1);
  const setQty = (n) => { qty = Math.min(Math.max(n, 1), maxQty); $('#q-val').textContent = qty; };
  $('#q-inc').addEventListener('click', () => {
    if (qty >= maxQty) return toast(`Доступно только ${maxQty} шт.`);
    setQty(qty + 1);
  });
  $('#q-dec').addEventListener('click', () => setQty(qty - 1));

  /* ---------- действия ---------- */
  const tgText = `Здравствуйте! Хочу заказать:\n${p.name} (${p.brand_name || ''})\nЦена: ${money(p.price)}\n${location.href}`;
  $('#tg-order').href = `https://t.me/${meta.settings.telegram}?text=${encodeURIComponent(tgText)}`;

  $('#add-cart').addEventListener('click', () => {
    if (out) { window.open($('#tg-order').href, '_blank'); return; }
    Cart.add(p, qty);
    window.KB.openCart();
  });

  $('#fav-btn').addEventListener('click', (e) => {
    const on = Fav.toggle(p.id);
    e.currentTarget.style.borderColor = on ? 'var(--accent)' : '';
    e.currentTarget.querySelector('svg').style.fill = on ? 'var(--accent)' : 'none';
    window.KB.updateCounters();
  });
  if (Fav.has(p.id)) $('#fav-btn').querySelector('svg').style.fill = 'var(--accent)';

  /* ---------- похожие ---------- */
  if (data.related.length) {
    $('#related-section').style.display = '';
    $('#related').innerHTML = data.related.map(productCard).join('');
  }
})();
