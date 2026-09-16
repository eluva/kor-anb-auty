/* Главная страница */
(async function () {
  'use strict';
  const { $, $$, api, esc, money, plural, productCard, cacheProducts, observeReveals, boot, ICON } = window.KB;

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

  /* ---------- главный кадр: товары сменяют друг друга ---------- */
  buildHeroSlider([...hits.items, ...fresh.items]);

  function buildHeroSlider(pool) {
    const figure = $('#hero-figure');
    if (!figure) return;

    /* Без повторов, только с картинкой, не больше пяти — чтобы показ не затягивался */
    const seen = new Set();
    const slides = pool.filter((p) => {
      if (!p.image || seen.has(p.id)) return false;
      seen.add(p.id);
      return true;
    }).slice(0, 5);
    if (!slides.length) return;

    figure.innerHTML = `
      <div class="hf-stage">
        ${slides.map((p, i) => `
          <a class="hero-slide${i === 0 ? ' on' : ''}" href="/product/${esc(p.slug)}"
             ${i === 0 ? '' : 'tabindex="-1" aria-hidden="true"'}>
            <img src="${esc(p.image)}" alt="${esc(p.name)}" width="700" height="700"
                 ${i === 0 ? 'fetchpriority="high"' : 'loading="lazy"'}>
          </a>`).join('')}
        ${slides.length > 1 ? `<div class="hero-dots" role="tablist" aria-label="Показ товаров">
          ${slides.map((p, i) => `<button type="button" role="tab" data-go="${i}"
             aria-current="${i === 0}" aria-label="Показать: ${esc(p.name)}"></button>`).join('')}
        </div>` : ''}
      </div>
      <figcaption>
        <span class="hero-cap-text"><b id="hero-cap"></b></span>
        <span class="hero-price tnum" id="hero-price"></span>
      </figcaption>`;

    const slideEls = $$('.hero-slide', figure);
    const dots = $$('.hero-dots button', figure);
    const cap = $('#hero-cap');
    const price = $('#hero-price');
    let index = 0;
    let timer = null;

    const setCaption = (p) => {
      cap.textContent = `${p.brand_name || ''} — ${p.name}`.replace(/^ — /, '');
      price.textContent = money(p.price);
    };
    setCaption(slides[0]);

    function show(next, withFade = true) {
      if (next === index) return;
      const apply = () => {
        slideEls.forEach((el, i) => {
          el.classList.toggle('on', i === next);
          el.toggleAttribute('aria-hidden', i !== next);
          el.tabIndex = i === next ? 0 : -1;
        });
        dots.forEach((d, i) => d.setAttribute('aria-current', String(i === next)));
        setCaption(slides[next]);
        index = next;
        figure.classList.remove('swapping');
      };
      if (!withFade) return apply();
      /* Гасим подпись, меняем её на середине перехода — текст не «прыгает» */
      figure.classList.add('swapping');
      setTimeout(apply, 300);
    }

    /* Интервал случайный, 2–4 секунды: показ не выглядит механическим */
    const nextDelay = () => 2000 + Math.random() * 2000;

    function play() {
      stop();
      timer = setTimeout(() => {
        show((index + 1) % slides.length);
        play();
      }, nextDelay());
    }
    function stop() { clearTimeout(timer); timer = null; }

    if (slides.length < 2) return;

    /* Уважаем системную настройку «меньше движения» — тогда без автосмены */
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)');
    const start = () => { if (!calm.matches) play(); };

    dots.forEach((d) => d.addEventListener('click', () => {
      show(Number(d.dataset.go));
      start();                              // после ручного выбора отсчёт заново
    }));

    /* Не крутим под курсором, при фокусе с клавиатуры и в фоновой вкладке */
    figure.addEventListener('mouseenter', stop);
    figure.addEventListener('mouseleave', start);
    figure.addEventListener('focusin', stop);
    figure.addEventListener('focusout', start);
    document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
    calm.addEventListener?.('change', () => (calm.matches ? stop() : start()));

    start();
  }

  observeReveals();
})();
