'use strict';
/**
 * Простой ограничитель частоты запросов — в памяти, без зависимостей.
 *
 * Скользящее окно: помним время последних N запросов с каждого адреса.
 * Для одного сервера этого достаточно. Перезапуск сбрасывает счётчики —
 * для защиты от спама это нормально.
 */

const { isPrivate, isCloudflare } = require('./proxy');
const isProd = process.env.NODE_ENV === 'production';

/* Если на боевом сервере вместо покупательницы виден адрес прокси, значит
   KB_TRUST_PROXY не подходит хостингу: все посетители сливаются в один адрес
   и лимит начинает отклонять настоящие заказы. Сообщаем в журнал один раз. */
let proxyWarned = false;
function clientKey(req) {
  const ip = req.ip || req.socket?.remoteAddress || 'unknown';
  if (isProd && !proxyWarned && (isPrivate(ip) || isCloudflare(ip))) {
    proxyWarned = true;
    console.warn(`[ratelimit] IP покупателя не определён: виден адрес прокси ${ip} ` +
      `(X-Forwarded-For: ${req.get('x-forwarded-for') || 'нет'}). ` +
      'Проверьте KB_TRUST_PROXY — на Render должно быть cloudflare.');
  }
  return ip;
}

function createLimiter({ windowMs, max, message }) {
  const hits = new Map();                      // ключ -> массив отметок времени

  /* Раз в окно выбрасываем устаревшие записи, чтобы память не росла */
  setInterval(() => {
    const edge = Date.now() - windowMs;
    for (const [key, list] of hits) {
      const fresh = list.filter((t) => t > edge);
      if (fresh.length) hits.set(key, fresh); else hits.delete(key);
    }
  }, windowMs).unref();

  return function limiter(req, res, next) {
    /* req.ip уже учитывает доверенный прокси (trust proxy) */
    const key = clientKey(req);
    const now = Date.now();
    const list = (hits.get(key) || []).filter((t) => t > now - windowMs);

    if (list.length >= max) {
      const retry = Math.ceil((list[0] + windowMs - now) / 1000);
      res.setHeader('Retry-After', String(retry));
      return res.status(429).json({ error: message(retry) });
    }

    list.push(now);
    hits.set(key, list);
    next();
  };
}

const minutes = (sec) => {
  const m = Math.ceil(sec / 60);
  const a = m % 100; const b = m % 10;
  const word = a > 10 && a < 20 ? 'минут' : b === 1 ? 'минуту' : b > 1 && b < 5 ? 'минуты' : 'минут';
  return `${m} ${word}`;
};

/* Заказы: живой покупатель не оформит больше пяти за 10 минут,
   а бот, засыпающий магазин и Telegram продавца, упрётся в лимит. */
const orderLimiter = createLimiter({
  windowMs: 10 * 60 * 1000,
  max: 5,
  message: (sec) => `Слишком много заказов подряд. Попробуйте через ${minutes(sec)} или напишите нам в Telegram.`,
});

/* Загрузка фото в админке — защита от случайного зацикливания */
const uploadLimiter = createLimiter({
  windowMs: 60 * 1000,
  max: 30,
  message: () => 'Слишком много загрузок подряд, подождите минуту.',
});

module.exports = { createLimiter, orderLimiter, uploadLimiter };
