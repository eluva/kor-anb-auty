/* ==========================================================================
   Korean Beauty — набор SVG-иконок (контурные, штрих 1.3–1.4, сетка 24)
   Эмодзи в интерфейсе не используются: они по-разному рисуются в Windows,
   Android и iOS и выглядят как случайная картинка, а не как знак системы.
   ========================================================================== */
(function () {
  'use strict';

  const s = (body, extra = '') =>
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"
          stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${body}</svg>`;

  const ICON = {
    /* --- интерфейс --- */
    search: s('<circle cx="11" cy="11" r="6.5"/><path d="m20 20-3.7-3.7"/>'),
    bag: s('<path d="M6 7h12l1 13H5z"/><path d="M9 7V5.5a3 3 0 0 1 6 0V7"/>'),
    heart: s('<path d="M12 20.2 4.7 13a4.4 4.4 0 0 1 6.2-6.2l1.1 1.1 1.1-1.1A4.4 4.4 0 1 1 19.3 13z"/>'),
    menu: s('<path d="M3 7h18M3 12h18M3 17h18"/>'),
    close: s('<path d="M6 6l12 12M18 6 6 18"/>'),
    minus: s('<path d="M5 12h14"/>'),
    plus: s('<path d="M12 5v14M5 12h14"/>'),
    arrowRight: s('<path d="M4 12h16M14 6l6 6-6 6"/>'),
    arrowLeft: s('<path d="M20 12H4M10 6l-6 6 6 6"/>'),
    check: s('<path d="M4 12.5 9.5 18 20 6.5"/>'),
    star: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2.8l2.7 5.9 6.4.7-4.8 4.3 1.3 6.3L12 16.8 6.4 20l1.3-6.3L2.9 9.4l6.4-.7z"/></svg>`,
    alert: s('<path d="M12 3.6 21.4 20H2.6z"/><path d="M12 10v4.2M12 17.2h.01"/>'),
    sliders: s('<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>'),
    chevronDown: s('<path d="m6 9 6 6 6-6"/>'),

    /* --- гарантии магазина --- */
    seal: s('<path d="M12 3.2 14.3 6l3.6.3-1 3.5 2 3-3.3 1.5-1 3.5-3.6-.9-3.6.9-1-3.5L2.1 12.8l2-3-1-3.5L6.7 6z"/><path d="M9.3 12.2 11.2 14l3.6-3.7"/>'),
    truck: s('<path d="M2 7h11v9H2zM13 10h4.5l2.5 3v3h-7z"/><circle cx="6" cy="18" r="1.8"/><circle cx="16.5" cy="18" r="1.8"/>'),
    chat: s('<path d="M20 15a2.5 2.5 0 0 1-2.5 2.5H9L5 21v-3.5H4A2.5 2.5 0 0 1 1.5 15V6A2.5 2.5 0 0 1 4 3.5h13.5A2.5 2.5 0 0 1 20 6z" transform="translate(1.2 .4)"/>'),
    card: s('<rect x="2.5" y="5.5" width="19" height="13" rx="1.6"/><path d="M2.5 10h19M6 14.5h3"/>'),

    /* --- социальные --- */
    telegram: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M21.9 4.3 18.9 19c-.2 1-.8 1.3-1.7.8l-4.6-3.4-2.2 2.1c-.3.3-.5.5-1 .5l.3-4.7L18.3 6c.4-.3-.1-.5-.6-.2L7.1 12.5l-4.5-1.4c-1-.3-1-1 .2-1.4l17.6-6.8c.8-.3 1.5.2 1.2 1.4z"/></svg>`,
    instagram: s('<rect x="3.2" y="3.2" width="17.6" height="17.6" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17" cy="7" r="1.1" fill="currentColor" stroke="none"/>'),
    phone: s('<path d="M6.8 3.5h3.1l1.5 3.9-2 1.4a12.4 12.4 0 0 0 5.6 5.6l1.4-2 3.9 1.5v3.1a2 2 0 0 1-2.2 2A17.3 17.3 0 0 1 4.8 5.7a2 2 0 0 1 2-2.2z"/>'),
    pin: s('<path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11z"/><circle cx="12" cy="10" r="2.6"/>'),
    clock: s('<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5.2l3.2 2"/>'),

    /* --- разделы каталога (по слагу) --- */
    cleansing: s('<path d="M9 3.5h6M10 3.5v3M14 3.5v3"/><path d="M8 6.5h8l1 11.5a2.5 2.5 0 0 1-2.5 2.5h-5A2.5 2.5 0 0 1 7 18z"/><path d="M9.6 13.4c1 .8 1.8.8 2.4 0s1.4-.9 2.4 0"/>'),
    toners: s('<path d="M12 3.2c3 3.7 5.2 6.6 5.2 9.1A5.2 5.2 0 1 1 6.8 12.3c0-2.5 2.2-5.4 5.2-9.1z"/>'),
    serums: s('<path d="M10 3h4M11 3v4.2L7.6 17a2.6 2.6 0 0 0 2.4 3.6h4a2.6 2.6 0 0 0 2.4-3.6L13 7.2V3"/><path d="M9.2 14h5.6"/>'),
    moisturizers: s('<path d="M5.5 9.5h13v8a3 3 0 0 1-3 3h-7a3 3 0 0 1-3-3z"/><path d="M4.5 6.2h15v3.3h-15z"/><path d="M9.5 14.4h5"/>'),
    masks: s('<path d="M4.6 5.5h14.8v9.1c0 3.2-3.3 5.9-7.4 5.9s-7.4-2.7-7.4-5.9z"/><path d="M9 10.4h.01M15 10.4h.01M10 15.2c1.3.9 2.7.9 4 0"/>'),
    suncare: s('<circle cx="12" cy="12" r="4"/><path d="M12 2.6v2.2M12 19.2v2.2M21.4 12h-2.2M4.8 12H2.6M18.6 5.4l-1.6 1.6M7 17l-1.6 1.6M18.6 18.6 17 17M7 7 5.4 5.4"/>'),
    'eye-care': s('<path d="M2.6 12S6.4 6.2 12 6.2 21.4 12 21.4 12 17.6 17.8 12 17.8 2.6 12 2.6 12z"/><circle cx="12" cy="12" r="2.8"/>'),
    body: s('<path d="M10 2.8h4v2.6h-4z"/><path d="M8.4 5.4h7.2A2.4 2.4 0 0 1 18 7.8v10.4a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3V7.8a2.4 2.4 0 0 1 2.4-2.4z"/><path d="M6 11.5h12"/>'),
    hair: s('<path d="M4.5 20c0-7 2.4-16.4 7.5-16.4S19.5 13 19.5 20"/><path d="M8.6 20c0-5.2 1.2-11.4 3.4-11.4s3.4 6.2 3.4 11.4"/>'),
    makeup: s('<path d="m4 20 3.4-9.4 3.6 3.6L4 20z" /><path d="m11 14.2 7.1-7.1a2.2 2.2 0 0 0-3.1-3.1L7.9 11"/>'),
    fallback: s('<path d="M12 3.4 20 8v8l-8 4.6L4 16V8z"/><path d="M12 12.2 20 8M12 12.2v8.4M12 12.2 4 8"/>'),

    /* --- состояния --- */
    emptyBox: s('<path d="M3.5 8.2 12 4l8.5 4.2v7.6L12 20l-8.5-4.2z"/><path d="M12 12.4 20.5 8.2M12 12.4V20M12 12.4 3.5 8.2"/>'),
    emptySearch: s('<circle cx="10.8" cy="10.8" r="6.4"/><path d="m19.6 19.6-4.3-4.3M8.6 10.8h4.4"/>'),
  };

  ICON.category = (slug) => ICON[slug] || ICON.fallback;

  window.KB_ICONS = ICON;
})();
