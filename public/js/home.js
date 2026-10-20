/* Главная страница */
(async function () {
  'use strict';
  const { $, $$, api, esc, money, plural, productCard, cacheProducts, observeReveals, boot, ICON } = window.KB;

  /* Анимированный логотип в hero запускает hero-logo.js — сразу, не дожидаясь данных */

  const meta = await boot();
  if (!meta) return;

  const { settings, categories, brands, skinTypes, concerns } = meta;
  const tgUrl = `https://t.me/${settings.telegram}`;

  /* ---------- показатели ---------- */
  const totalProducts = categories.reduce((s, c) => s + c.count, 0);
  const brandCount = brands.filter((b) => b.count > 0).length || brands.length;
  $('#stat-products').textContent = totalProducts || '—';
  $('#stat-products-label').textContent =
    `${plural(totalProducts, 'средство', 'средства', 'средств')} в наличии`;
  $('#stat-brands').textContent = brandCount;
  $('#stat-brands-label').textContent =
    `${plural(brandCount, 'корейский бренд', 'корейских бренда', 'корейских брендов')}`;
  $('#hero-arrow').innerHTML = ICON.arrowRight;

  /* ---------- гарантии ---------- */
  const ship = Number(settings.delivery_city_price);
  const freeFrom = Number(settings.free_delivery_from);
  $('#promise').innerHTML = [
    [ICON.seal, '100% оригинал', 'Прямые поставки из Кореи'],
    [ICON.truck, 'Доставка по Нукусу', ship ? `${money(ship)}${freeFrom ? `, от ${money(freeFrom)} — бесплатно` : ''}` : 'Бесплатно'],
    [ICON.chat, 'Подбор ухода', 'Бесплатная консультация'],
    [ICON.card, 'Оплата как удобно', 'Наличные · Payme · Click'],
  ].map(([icon, title, note]) => `<div>${icon}<b>${esc(title)}</b><span>${esc(note)}</span></div>`).join('');

  /* ---------- доставка ---------- */
  $('#delivery-tg').href = tgUrl;
  $('#step-ship').textContent = ship
    ? `По Нукусу — в день заказа, ${money(ship)}${freeFrom ? `; от ${money(freeFrom)} бесплатно` : ''}. По Узбекистану — курьерской службой, 2–4 дня.`
    : 'По Нукусу — в день заказа, бесплатно. По Узбекистану — курьерской службой, 2–4 дня.';

  /* ---------- о нас: иконки и часы работы из настроек ---------- */
  $$('#about i[data-icon]').forEach((el) => { el.innerHTML = ICON[el.dataset.icon] || ''; });
  $('#about-hours').textContent = settings.work_hours || '';

  /* ---------- индекс брендов ---------- */
  $('#brand-index').innerHTML = brands
    .filter((b) => b.count > 0)
    .map((b) => `<a href="/catalog?brand=${esc(b.slug)}">${esc(b.name)}<span class="bi-count">${b.count}</span></a>`)
    .join('');

  /* ---------- разделы: первый — крупный ---------- */
  $('#categories').innerHTML = categories.map((c, i) => `
    <a class="cat-tile${i === 0 ? ' feature' : ''}" href="/catalog?category=${esc(c.slug)}">
      <span class="ct-num">${String(i + 1).padStart(2, '0')}</span>
      ${ICON.category(c.slug)}
      <span class="ct-name">${esc(c.name)}</span>
      <span class="ct-count">${c.count} ${plural(c.count, 'средство', 'средства', 'средств')}</span>
    </a>`).join('')
    /* Замыкающая плитка: добивает ряд и ведёт в общий каталог */
    + `<a class="cat-tile ct-all" href="/catalog">
         <span class="ct-num">—</span>
         ${ICON.arrowRight}
         <span class="ct-name">Весь каталог</span>
         <span class="ct-count">${totalProducts} ${plural(totalProducts, 'средство', 'средства', 'средств')}</span>
       </a>`;

  /* ---------- подбор ухода ---------- */
  const quiz = { skin: '', concern: '' };
  function options(host, list, key) {
    $(host).innerHTML = list.map((x) =>
      `<button type="button" class="quiz-opt" data-val="${esc(x.id)}">${esc(x.name)}</button>`).join('');
    $$(`${host} .quiz-opt`).forEach((btn) => btn.addEventListener('click', () => {
      quiz[key] = quiz[key] === btn.dataset.val ? '' : btn.dataset.val;
      $$(`${host} .quiz-opt`).forEach((b) => b.classList.toggle('on', b.dataset.val === quiz[key]));
      const params = new URLSearchParams();
      if (quiz.skin) params.set('skin', quiz.skin);
      if (quiz.concern) params.set('concern', quiz.concern);
      $('#quiz-go').href = `/catalog${params.toString() ? '?' + params : ''}`;
    }));
  }
  options('#quiz-skin', skinTypes, 'skin');
  options('#quiz-concern', concerns, 'concern');

  /* ---------- товарные блоки ---------- */
  const skeleton = '<div class="skeleton sk-card"></div>'.repeat(4);
  $('#featured').innerHTML = skeleton;
  $('#fresh').innerHTML = skeleton;

  const [hits, fresh] = await Promise.all([
    api('/api/products?featured=1&sort=popular&limit=8').catch(() => ({ items: [] })),
    api('/api/products?sort=new&limit=4').catch(() => ({ items: [] })),
  ]);

  cacheProducts([...hits.items, ...fresh.items]);

  $('#featured').innerHTML = hits.items.length
    ? hits.items.map(productCard).join('')
    : `<div class="empty">${ICON.emptyBox}<h3>Скоро здесь появятся товары</h3>
       <p>Добавьте первые позиции через админ-панель.</p></div>`;
  $('#fresh').innerHTML = fresh.items.map(productCard).join('');

  observeReveals();
})();
