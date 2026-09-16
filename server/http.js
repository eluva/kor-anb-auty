'use strict';
/**
 * Асинхронные обработчики для Express 4.
 *
 * Express 4 не замечает ошибку, выброшенную в async-функции: запрос просто
 * повисает до таймаута, а в журнале — «unhandled rejection». Здесь методы
 * роутера (get, post, …) оборачиваются так, чтобы ошибка из любого
 * async-обработчика уходила в общий обработчик ошибок и покупатель
 * получал понятный ответ.
 *
 * Обёртка ставится один раз на роутер — не нужно помнить про каждый маршрут.
 */
const METHODS = ['get', 'post', 'put', 'patch', 'delete', 'all', 'use'];

function wrap(fn) {
  /* Обработчик ошибок (4 аргумента), вложенные роутеры и приложения не трогаем */
  if (typeof fn !== 'function' || fn.length === 4 || fn.stack || fn.handle) return fn;
  const wrapped = function asyncSafe(req, res, next) {
    try {
      const out = fn(req, res, next);
      if (out && typeof out.then === 'function') out.catch(next);
    } catch (e) {
      next(e);
    }
  };
  return wrapped;
}

function asyncSafe(router) {
  for (const method of METHODS) {
    const original = router[method].bind(router);
    router[method] = (...args) => {
      /* app.get('настройка') с одним строковым аргументом — чтение настройки, а не маршрут */
      if (method === 'get' && args.length === 1 && typeof args[0] === 'string') return original(...args);
      return original(...args.map((a) => (Array.isArray(a) ? a.map(wrap) : wrap(a))));
    };
  }
  return router;
}

module.exports = { asyncSafe, wrap };
