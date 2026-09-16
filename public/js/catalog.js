/* Каталог: фильтры, сортировка, пагинация, синхронизация с URL */
(async function () {
  'use strict';
  const { $, $$, api, esc, plural, productCard, cacheProducts, Fav, closeFilters } = window.KB;

  const meta = await window.KB.boot();
  if (!meta) return;

  const PER_PAGE = 12;

  /* ---------- состояние из URL ---------- */
  const url = new URLSearchParams(location.search);
  const state = {
    category: (url.get('category') || '').split(',').filter(Boolean),
    brand:    (url.get('brand') || '').split(',').filter(Boolean),
    skin:     (url.get('skin') || '').split(',').filter(Boolean),
    concern:  (url.get('concern') || '').split(',').filter(Boolean),
    min: url.get('min') || '',
    max: url.get('max') || '',
    instock: url.get('instock') === '1',
    sale:    url.get('sale') === '1',
    new:     url.get('new') === '1',
    fav:     url.get('fav') === '1',
    search:  url.get('search') || '',
    sort:    url.get('sort') || 'popular',
    page:    Math.max(parseInt(url.get('page'), 10) || 1, 1),
  };

  /* ---------- построение списков фильтров ---------- */
  /* Значение чекбокса — всегда слаг: с ним работают и URL, и API.
     У разделов и брендов есть и числовой id, и slug — берём именно slug;
     у типов кожи и задач slug нет, там идентификатор и есть id («dry», «acne»). */
  const filterValue = (x) => String(x.slug ?? x.id);

  function checkList(host, items, key, labelKey = 'name') {
    $(host).innerHTML = items.map((x) => `
      <label class="check">
        <input type="checkbox" value="${esc(filterValue(x))}" data-key="${key}"
               ${state[key].includes(filterValue(x)) ? 'checked' : ''}>
        <span class="box"></span>
        <span>${esc(x[labelKey])}</span>
        ${x.count !== undefined ? `<span class="cnt">${x.count}</span>` : ''}
      </label>`).join('');
  }

  checkList('#f-category', meta.categories.filter((c) => c.count > 0), 'category');
  checkList('#f-brand', meta.brands.filter((b) => b.count > 0), 'brand');
  checkList('#f-skin', meta.skinTypes, 'skin');
  checkList('#f-concern', meta.concerns, 'concern');

  $('#f-min').value = state.min;
  $('#f-max').value = state.max;
  $('#f-instock').checked = state.instock;
  $('#f-sale').checked = state.sale;
  $('#f-new').checked = state.new;
  $('#f-fav').checked = state.fav;
  $('#sort').value = state.sort;

  /* ---------- заголовок страницы ---------- */
  function updateHeading() {
    let title = 'Каталог';
    let sub = 'Оригинальная корейская косметика в наличии в Нукусе';
    if (state.search) { title = `Поиск: «${state.search}»`; sub = 'Результаты по вашему запросу'; }
    else if (state.fav) { title = 'Избранное'; sub = 'Товары, которые вы отметили сердечком'; }
    else if (state.sale) { title = 'Скидки'; sub = 'Специальные цены на оригинальные средства'; }
    else if (state.new) { title = 'Новинки'; sub = 'Свежая партия прямиком из Кореи'; }
    else if (state.category.length === 1) {
      const c = meta.categories.find((x) => x.slug === state.category[0]);
      if (c) { title = c.name; sub = c.description || sub; }
    } else if (state.brand.length === 1) {
      const b = meta.brands.find((x) => x.slug === state.brand[0]);
      if (b) { title = b.name; sub = b.description || sub; }
    }
    $('#catalog-title').textContent = title;
    $('#catalog-sub').textContent = sub;
    $('#crumb').textContent = title;
    document.title = `${title} — Korean Beauty, Нукус`;
  }

  /* ---------- URL ---------- */
  function syncUrl() {
    const p = new URLSearchParams();
    for (const k of ['category', 'brand', 'skin', 'concern']) if (state[k].length) p.set(k, state[k].join(','));
    for (const k of ['min', 'max', 'search']) if (state[k]) p.set(k, state[k]);
    for (const k of ['instock', 'sale', 'new', 'fav']) if (state[k]) p.set(k, '1');
    if (state.sort !== 'popular') p.set('sort', state.sort);
    if (state.page > 1) p.set('page', state.page);
    history.replaceState(null, '', `/catalog${p.toString() ? '?' + p : ''}`);
  }

  /* ---------- активные фильтры (чипсы) ---------- */
  function renderChips() {
    const chips = [];
    const push = (label, onClear) => chips.push({ label, onClear });

    state.category.forEach((s) => push(meta.categories.find((c) => c.slug === s)?.name || s,
      () => { state.category = state.category.filter((x) => x !== s); }));
    state.brand.forEach((s) => push(meta.brands.find((b) => b.slug === s)?.name || s,
      () => { state.brand = state.brand.filter((x) => x !== s); }));
    state.skin.forEach((s) => push(meta.skinTypes.find((t) => t.id === s)?.name || s,
      () => { state.skin = state.skin.filter((x) => x !== s); }));
    state.concern.forEach((s) => push(meta.concerns.find((t) => t.id === s)?.name || s,
      () => { state.concern = state.concern.filter((x) => x !== s); }));
    if (state.min) push(`от ${Number(state.min).toLocaleString('ru-RU')}`, () => { state.min = ''; });
    if (state.max) push(`до ${Number(state.max).toLocaleString('ru-RU')}`, () => { state.max = ''; });
    if (state.instock) push('В наличии', () => { state.instock = false; });
    if (state.sale) push('Со скидкой', () => { state.sale = false; });
    if (state.new) push('Новинки', () => { state.new = false; });
    if (state.fav) push('Избранное', () => { state.fav = false; });
    if (state.search) push(`«${state.search}»`, () => { state.search = ''; });

    const host = $('#active-chips');
    if (!chips.length) { host.innerHTML = ''; return; }
    host.innerHTML = chips.map((c, i) =>
      `<span class="chip">${esc(c.label)}<button data-chip="${i}" aria-label="Убрать фильтр">${window.KB.ICON.close}</button></span>`).join('')
      + '<button class="chip" id="clear-all">Сбросить всё</button>';

    $$('#active-chips [data-chip]').forEach((btn) => btn.addEventListener('click', () => {
      chips[Number(btn.dataset.chip)].onClear();
      state.page = 1;
      syncFormFromState();
      load();
    }));
    $('#clear-all')?.addEventListener('click', resetAll);
  }

  function syncFormFromState() {
    $$('.filters input[type=checkbox][data-key]').forEach((cb) => {
      cb.checked = state[cb.dataset.key].includes(cb.value);
    });
    $('#f-min').value = state.min;
    $('#f-max').value = state.max;
    $('#f-instock').checked = state.instock;
    $('#f-sale').checked = state.sale;
    $('#f-new').checked = state.new;
    $('#f-fav').checked = state.fav;
  }

  function resetAll() {
    Object.assign(state, {
      category: [], brand: [], skin: [], concern: [],
      min: '', max: '', instock: false, sale: false, new: false, fav: false,
      search: '', page: 1,
    });
    syncFormFromState();
    load();
  }

  /* ---------- загрузка ---------- */
  let requestId = 0;
  async function load() {
    const my = ++requestId;
    syncUrl();
    updateHeading();
    renderChips();

    $('#grid').innerHTML = '<div class="skeleton sk-card"></div>'.repeat(PER_PAGE);
    $('#count').textContent = 'Загружаем…';

    /* Избранное фильтруем на клиенте — оно живёт в браузере покупателя */
    const p = new URLSearchParams();
    for (const k of ['category', 'brand', 'skin', 'concern']) if (state[k].length) p.set(k, state[k].join(','));
    for (const k of ['min', 'max', 'search']) if (state[k]) p.set(k, state[k]);
    for (const k of ['instock', 'sale', 'new']) if (state[k]) p.set(k, '1');
    p.set('sort', state.sort);
    p.set('limit', state.fav ? 60 : PER_PAGE);
    p.set('page', state.fav ? 1 : state.page);

    let data;
    try { data = await api('/api/products?' + p); }
    catch { $('#grid').innerHTML = `<div class="empty">${window.KB.ICON.alert}<h3>Не удалось загрузить каталог</h3><p>Проверьте соединение и обновите страницу.</p></div>`; return; }
    if (my !== requestId) return;

    let items = data.items;
    let total = data.total;
    let pages = data.pages;

    if (state.fav) {
      items = items.filter((x) => Fav.has(x.id));
      total = items.length;
      pages = Math.ceil(total / PER_PAGE) || 1;
      state.page = Math.min(state.page, pages);
      items = items.slice((state.page - 1) * PER_PAGE, state.page * PER_PAGE);
    }

    cacheProducts(items);

    $('#count').textContent = total
      ? `${total} ${plural(total, 'товар', 'товара', 'товаров')}`
      : 'Ничего не найдено';

    $('#grid').innerHTML = items.length
      ? items.map(productCard).join('')
      : `<div class="empty">
           ${window.KB.ICON.emptySearch}
           <h3>По этим фильтрам ничего нет</h3>
           <p>Попробуйте убрать часть условий или напишите нам — привезём под заказ.</p>
           <button class="btn btn-ghost btn-sm" onclick="document.getElementById('clear-all')?.click()">Сбросить фильтры</button>
         </div>`;

    renderPagination(pages);
  }

  function renderPagination(pages) {
    const host = $('#pagination');
    if (pages <= 1) { host.innerHTML = ''; return; }
    const cur = state.page;
    const nums = new Set([1, pages, cur, cur - 1, cur + 1]);
    const list = [...nums].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b);

    let html = `<button ${cur === 1 ? 'disabled' : ''} data-page="${cur - 1}" aria-label="Назад">${window.KB.ICON.arrowLeft}</button>`;
    let prev = 0;
    for (const n of list) {
      if (prev && n - prev > 1) html += '<button disabled>…</button>';
      html += `<button data-page="${n}" class="${n === cur ? 'active' : ''}">${n}</button>`;
      prev = n;
    }
    html += `<button ${cur === pages ? 'disabled' : ''} data-page="${cur + 1}" aria-label="Вперёд">${window.KB.ICON.arrowRight}</button>`;
    host.innerHTML = html;

    $$('#pagination [data-page]').forEach((b) => b.addEventListener('click', () => {
      state.page = Number(b.dataset.page);
      load();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }));
  }

  /* ---------- события фильтров ---------- */
  let debounce;
  const reload = (delay = 0) => {
    clearTimeout(debounce);
    debounce = setTimeout(() => { state.page = 1; load(); }, delay);
  };

  $$('.filters input[type=checkbox][data-key]').forEach((cb) => cb.addEventListener('change', () => {
    const key = cb.dataset.key;
    state[key] = cb.checked
      ? [...state[key], cb.value]
      : state[key].filter((v) => v !== cb.value);
    reload();
  }));

  $('#f-min').addEventListener('input', (e) => { state.min = e.target.value; reload(500); });
  $('#f-max').addEventListener('input', (e) => { state.max = e.target.value; reload(500); });
  ['instock', 'sale', 'new', 'fav'].forEach((k) => {
    $(`#f-${k}`).addEventListener('change', (e) => { state[k] = e.target.checked; reload(); });
  });
  $('#sort').addEventListener('change', (e) => { state.sort = e.target.value; reload(); });
  $('#reset-filters').addEventListener('click', resetAll);

  /* Мобильная панель фильтров */
  $('#open-filters').addEventListener('click', () => {
    $('#filters').classList.add('open');
    $('#close-filters').style.display = 'grid';
    $('#apply-filters').style.display = 'block';
    window.KB.ensureDrawer();
    $('#kb-overlay').classList.add('show');
    document.body.classList.add('no-scroll');
  });
  const hideFilters = () => { closeFilters(); };
  $('#close-filters').innerHTML = window.KB.ICON.close;
  $('#close-filters').addEventListener('click', hideFilters);
  $('#apply-filters').addEventListener('click', hideFilters);

  /* Избранное могло измениться — обновим при активном фильтре */
  document.addEventListener('fav:change', () => { if (state.fav) load(); });

  load();
})();
