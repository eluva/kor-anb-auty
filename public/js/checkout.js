/* Оформление заказа */
(async function () {
  'use strict';
  const { $, $$, api, esc, money, plural, Cart, toast, loadCartLines } = window.KB;

  const meta = await window.KB.boot();
  if (!meta) return;
  const S = meta.settings;

  const SHIP = Number(S.delivery_city_price) || 0;
  const FREE_FROM = Number(S.free_delivery_from) || 0;

  $('#pickup-addr').textContent = S.address || 'Заберёте сами, бесплатно';
  $('#delivery-note').textContent = SHIP
    ? `По Нукусу — ${money(SHIP)}${FREE_FROM ? `, бесплатно от ${money(FREE_FROM)}` : ''}`
    : 'По Нукусу — бесплатно';

  /* ---------- позиции заказа ---------- */
  let lines = await loadCartLines();

  function emptyState() {
    $('#checkout-root').innerHTML = `<div class="empty" style="padding:90px 20px">
      ${window.KB.ICON.emptyBox}<h3>Корзина пуста</h3>
      <p>Добавьте товары из каталога, чтобы оформить заказ.</p>
      <a class="btn" href="/catalog">Перейти в каталог</a></div>`;
  }

  if (!lines.length) { emptyState(); return; }

  function shippingCost() {
    const isDelivery = $('input[name=delivery]:checked')?.value === 'delivery';
    if (!isDelivery) return 0;
    const goods = lines.reduce((s, p) => s + p.price * p.qty, 0);
    if (FREE_FROM && goods >= FREE_FROM) return 0;
    return SHIP;
  }

  function renderSummary() {
    $('#summary-items').innerHTML = lines.map((p) => `
      <div class="summary-line">
        <img src="${esc(p.image)}" alt="" loading="lazy">
        <div class="sl-name">${esc(p.name)}<div class="sl-qty">${p.qty} × ${money(p.price)}</div></div>
        <b>${money(p.price * p.qty)}</b>
      </div>`).join('');

    const goods = lines.reduce((s, p) => s + p.price * p.qty, 0);
    const ship = shippingCost();
    $('#sum-goods').textContent = money(goods);
    $('#sum-ship').textContent = ship ? money(ship)
      : ($('input[name=delivery]:checked')?.value === 'delivery' ? 'Бесплатно' : '—');
    $('#sum-total').textContent = money(goods + ship);
  }
  renderSummary();

  /* ---------- переключение способа получения ---------- */
  $$('#delivery-options input').forEach((r) => r.addEventListener('change', () => {
    $$('.radio-card').forEach((c) => c.classList.toggle('on', c.contains(r) && r.checked));
    $$('#delivery-options .radio-card').forEach((c) =>
      c.classList.toggle('on', c.querySelector('input').checked));
    $('#address-field').classList.toggle('hidden', $('input[name=delivery]:checked').value !== 'delivery');
    renderSummary();
  }));

  /* ---------- маска телефона (мягкая) ---------- */
  $('#f-phone').addEventListener('input', (e) => {
    let v = e.target.value.replace(/[^\d+]/g, '');
    if (!v.startsWith('+') && v.length) v = '+998' + v.replace(/^998/, '');
    e.target.value = v.slice(0, 16);
  });

  /* ---------- отправка ---------- */
  const form = $('#order-form');
  const btn = $('#submit-order');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const name = $('#f-name').value.trim();
    const phone = $('#f-phone').value.trim();
    const delivery = $('input[name=delivery]:checked').value;
    const address = $('#f-address').value.trim();

    if (name.length < 2) { $('#f-name').focus(); return toast('Укажите ваше имя', 'err'); }
    if (phone.replace(/\D/g, '').length < 9) { $('#f-phone').focus(); return toast('Укажите корректный номер телефона', 'err'); }
    if (delivery === 'delivery' && address.length < 5) { $('#f-address').focus(); return toast('Укажите адрес доставки', 'err'); }

    btn.disabled = true;
    btn.textContent = 'Отправляем…';

    let result;
    try {
      result = await api('/api/orders', {
        method: 'POST',
        body: {
          name, phone, delivery, address,
          telegram: $('#f-tg').value.trim(),
          comment: $('#f-comment').value.trim(),
          items: Cart.items,
        },
      });
    } catch (err) {
      btn.disabled = false;
      btn.textContent = 'Подтвердить заказ';
      return toast(err.message || 'Не удалось отправить заказ', 'err');
    }

    /* Готовим сообщение для Telegram — продавец получает заказ мгновенно */
    const ship = shippingCost();
    const tgLines = [
      `🛍 Новый заказ ${result.code}`,
      '',
      ...lines.map((p) => `• ${p.name} — ${p.qty} × ${money(p.price)}`),
      '',
      `Товары: ${money(result.total)}`,
      ship ? `Доставка: ${money(ship)}` : (delivery === 'delivery' ? 'Доставка: бесплатно' : 'Самовывоз'),
      `Итого: ${money(result.total + ship)}`,
      '',
      `Имя: ${name}`,
      `Телефон: ${phone}`,
      delivery === 'delivery' ? `Адрес: ${address}` : 'Самовывоз',
      $('#f-comment').value.trim() ? `Комментарий: ${$('#f-comment').value.trim()}` : '',
    ].filter(Boolean).join('\n');

    const tgUrl = `https://t.me/${S.telegram}?text=${encodeURIComponent(tgLines)}`;

    Cart.clear();

    $('#checkout-root').innerHTML = `
      <div class="panel success-box" style="max-width:640px;margin-inline:auto">
        <div class="s-mark">${window.KB.ICON.check}</div>
        <h2 style="margin-bottom:8px">Заказ принят!</h2>
        <p style="color:var(--ink-3)">Номер вашего заказа</p>
        <div class="order-code">${esc(result.code)}</div>
        <p style="color:var(--ink-2);max-width:46ch;margin-inline:auto">
          Мы свяжемся с вами по номеру <b>${esc(phone)}</b> в течение 15 минут в рабочее время
          (${esc(S.work_hours)}), чтобы подтвердить состав заказа и способ оплаты.
        </p>
        <div class="cart-totals" style="max-width:340px;margin:24px auto;text-align:left">
          <div><span>Товары (${lines.reduce((s, p) => s + p.qty, 0)} ${plural(lines.reduce((s, p) => s + p.qty, 0), 'шт', 'шт', 'шт')}.)</span><span>${money(result.total)}</span></div>
          <div><span>Доставка</span><span>${ship ? money(ship) : (delivery === 'delivery' ? 'Бесплатно' : 'Самовывоз')}</span></div>
          <div class="total"><span>К оплате</span><span>${money(result.total + ship)}</span></div>
        </div>
        <div class="hero-cta" style="justify-content:center;margin-bottom:0">
          <a class="btn btn-gold" href="${esc(tgUrl)}" target="_blank" rel="noopener">Продублировать в Telegram</a>
          <a class="btn btn-ghost" href="/catalog">Продолжить покупки</a>
        </div>
        <p style="font-size:.8rem;color:var(--ink-3);margin-top:18px">
          Совет: отправьте заказ в Telegram — так продавец увидит его мгновенно.
        </p>
      </div>`;

    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  /* Корзина могла измениться в другой вкладке */
  document.addEventListener('cart:render', async () => {
    lines = await loadCartLines();
    if (!lines.length) return emptyState();
    renderSummary();
  });
})();
