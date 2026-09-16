'use strict';
/**
 * Уведомления о заказах в Telegram.
 *
 * Без этого продавец узнаёт о заказе, только если сам зайдёт в админку.
 * Здесь бот пишет в чат сразу, как только покупатель оформил заказ.
 *
 * Настраивается в админке: Настройки → Уведомления в Telegram.
 * Если токен не задан — модуль молча ничего не делает, магазин работает как есть.
 */
const { setting, allSettings } = require('./db');

const API = 'https://api.telegram.org/bot';
const TIMEOUT_MS = 8000;

const money = (n) => new Intl.NumberFormat('ru-RU').format(Math.round(Number(n) || 0)) + ' сум';

/* Telegram ломается на < и >, если указан parse_mode=HTML */
const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

async function config() {
  const s = await allSettings();
  return {
    token: String(s.telegram_bot_token || '').trim(),
    chatId: String(s.telegram_chat_id || '').trim(),
  };
}

async function isConfigured() {
  const { token, chatId } = await config();
  return Boolean(token && chatId);
}

/** Низкоуровневый вызов Telegram API с таймаутом. */
async function call(method, token, payload) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${API}${token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
    const data = await res.json().catch(() => null);
    if (!data?.ok) {
      throw new Error(data?.description || `Telegram ответил ошибкой ${res.status}`);
    }
    return data.result;
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('Telegram не ответил за 8 секунд');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

async function sendMessage(text, cfg) {
  const { token, chatId } = cfg || await config();
  if (!token || !chatId) throw new Error('Не заданы токен бота или чат');
  return call('sendMessage', token, {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
  });
}

/** Проверка настроек кнопкой «Отправить тестовое сообщение». */
async function sendTest(cfg) {
  const shop = (await setting('shop_name')) || 'Korean Beauty';
  await sendMessage(
    `✅ <b>${esc(shop)}</b>\nУведомления о заказах подключены.\n\nЭто тестовое сообщение — так будут приходить новые заказы.`,
    cfg);
}

/**
 * Определить chat_id: продавец пишет боту любое сообщение,
 * а мы находим его чат в свежих обновлениях. Избавляет от ручного поиска id.
 */
async function detectChatId(token) {
  const updates = await call('getUpdates', token, { limit: 20, timeout: 0 });
  const chats = [];
  for (const u of updates || []) {
    const msg = u.message || u.channel_post || u.edited_message;
    if (!msg?.chat?.id) continue;
    const c = msg.chat;
    const title = c.title || [c.first_name, c.last_name].filter(Boolean).join(' ') || c.username || 'без имени';
    if (!chats.some((x) => x.id === String(c.id))) {
      chats.push({ id: String(c.id), title, type: c.type });
    }
  }
  return chats;
}

/** Имя бота — чтобы показать в админке ссылку вида t.me/<bot> */
async function getBotInfo(token) {
  const me = await call('getMe', token);
  return { username: me.username, name: me.first_name };
}

/**
 * Сообщение о новом заказе. Вызывается после успешной записи в базу;
 * ошибки только логируются — покупатель не должен страдать из-за Telegram.
 */
async function notifyNewOrder(order, lines, shipping = 0) {
  if (!(await isConfigured())) return;

  const items = lines
    .map((l) => `• ${esc(l.name)} — ${l.qty} × ${money(l.price)}`)
    .join('\n');

  const text = [
    `🛍 <b>Новый заказ ${esc(order.code)}</b>`,
    '',
    items,
    '',
    `Товары: <b>${money(order.total)}</b>`,
    shipping ? `Доставка: ${money(shipping)}` : null,
    `<b>Итого: ${money(order.total + shipping)}</b>`,
    '',
    `👤 ${esc(order.customer_name)}`,
    `📞 ${esc(order.phone)}`,
    order.telegram ? `✈️ @${esc(order.telegram)}` : null,
    order.delivery === 'delivery'
      ? `🚚 Доставка: ${esc(order.address || 'адрес не указан')}`
      : '🏬 Самовывоз',
    order.comment ? `💬 ${esc(order.comment)}` : null,
  ].filter(Boolean).join('\n');

  /* Не ждём ответа: заказ уже сохранён, покупателя не задерживаем */
  sendMessage(text).catch((e) => {
    console.error('[telegram] не удалось отправить уведомление о заказе:', e.message);
  });
}

module.exports = { isConfigured, sendMessage, sendTest, detectChatId, getBotInfo, notifyNewOrder };
