/* Анимированный логотип в hero: видео с розовым фоном → прозрачный фон.

   MP4 не хранит прозрачность, поэтому видео играет невидимым, а каждый его
   кадр перерисовывается на холст через WebGL, и розовый фон вырезается.

   Качество:
   • холст рисуется в настоящем разрешении экрана (на телефоне — вдвое-втрое
     больше самого видео), а не растягивается браузером;
   • кадр увеличивается бикубически (Catmull-Rom) — края остаются чёткими;
   • фон отделяется по разнице зелёного и синего: у розового она около нуля,
     у золота +45…+60 из 255. На краях букв цвет смешан с розовым — зная цвет
     фона в этом месте, смесь раскладываем обратно и оставляем чистое золото;
   • лёгкая резкость возвращает фактуру золота. */
(function () {
  'use strict';

  const DEFAULTS = {
    t0: 0.012, t1: 0.10,       // порог: ниже — фон, выше — буква (доли от 255)
    sharpen: 0.35,             // сила резкости
    rich: 0.08,                // чуть насыщеннее золото на светлом фоне
    maxSide: 1400,             // предел размера холста — бережём слабые телефоны
  };

  function createKeyer(canvas, options = {}) {
    const o = { ...DEFAULTS, ...options };
    const gl = canvas.getContext('webgl', {
      alpha: true, premultipliedAlpha: true, antialias: false,
      preserveDrawingBuffer: Boolean(o.preserve),
    });
    if (!gl) return null;

    const shader = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null;
    };
    const vs = shader(gl.VERTEX_SHADER, `
      attribute vec2 p;
      varying vec2 uv;
      void main() { uv = vec2(p.x + 1.0, 1.0 - p.y) * 0.5; gl_Position = vec4(p, 0.0, 1.0); }`);
    const fs = shader(gl.FRAGMENT_SHADER, `
      #ifdef GL_FRAGMENT_PRECISION_HIGH
      precision highp float;
      #else
      precision mediump float;
      #endif
      uniform sampler2D tex;
      uniform vec2 size;          // размер видео в пикселях
      uniform vec2 key;           // пороги t0, t1
      uniform float sharpen;
      uniform float rich;
      varying vec2 uv;

      /* Бикубическая интерполяция Catmull-Rom за 9 выборок */
      vec3 bicubic(vec2 at) {
        vec2 pos = at * size;
        vec2 p1 = floor(pos - 0.5) + 0.5;
        vec2 f = pos - p1;
        vec2 w0 = f * (-0.5 + f * (1.0 - 0.5 * f));
        vec2 w1 = 1.0 + f * f * (-2.5 + 1.5 * f);
        vec2 w2 = f * (0.5 + f * (2.0 - 1.5 * f));
        vec2 w3 = f * f * (-0.5 + 0.5 * f);
        vec2 w12 = w1 + w2;
        vec2 p0 = (p1 - 1.0) / size;
        vec2 p3 = (p1 + 2.0) / size;
        vec2 p12 = (p1 + w2 / w12) / size;
        vec3 c =
            texture2D(tex, vec2(p0.x,  p0.y)).rgb  * w0.x  * w0.y
          + texture2D(tex, vec2(p12.x, p0.y)).rgb  * w12.x * w0.y
          + texture2D(tex, vec2(p3.x,  p0.y)).rgb  * w3.x  * w0.y
          + texture2D(tex, vec2(p0.x,  p12.y)).rgb * w0.x  * w12.y
          + texture2D(tex, vec2(p12.x, p12.y)).rgb * w12.x * w12.y
          + texture2D(tex, vec2(p3.x,  p12.y)).rgb * w3.x  * w12.y
          + texture2D(tex, vec2(p0.x,  p3.y)).rgb  * w0.x  * w3.y
          + texture2D(tex, vec2(p12.x, p3.y)).rgb  * w12.x * w3.y
          + texture2D(tex, vec2(p3.x,  p3.y)).rgb  * w3.x  * w3.y;
        return clamp(c, 0.0, 1.0);
      }

      /* Цвет розового фона в этой точке: плавный переход между углами кадра */
      vec3 backdrop(vec2 at) {
        vec3 top = mix(vec3(0.859, 0.682, 0.690), vec3(0.875, 0.710, 0.729), at.x);
        vec3 bottom = mix(vec3(0.729, 0.486, 0.498), vec3(0.773, 0.545, 0.561), at.x);
        return mix(top, bottom, at.y);
      }

      void main() {
        vec3 c = bicubic(uv);

        /* Резкость: разница с размытым соседством, только для цвета */
        vec2 px = 1.0 / size;
        vec3 blur = 0.25 * (
            texture2D(tex, uv + vec2( px.x,  px.y)).rgb + texture2D(tex, uv + vec2(-px.x,  px.y)).rgb
          + texture2D(tex, uv + vec2( px.x, -px.y)).rgb + texture2D(tex, uv + vec2(-px.x, -px.y)).rgb);
        vec3 sharp = clamp(c + sharpen * (c - blur), 0.0, 1.0);

        float a = smoothstep(key.x, key.y, c.g - c.b);

        /* Край буквы — смесь золота и фона: убираем розовую часть смеси */
        vec3 gold = clamp((sharp - (1.0 - a) * backdrop(uv)) / max(a, 0.08), 0.0, 1.0);
        gold = pow(gold, vec3(1.0 + rich));

        gl_FragColor = vec4(gold * a, a);
      }`);
    if (!vs || !fs) return null;

    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
    gl.useProgram(prog);

    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    const u = (name) => gl.getUniformLocation(prog, name);
    gl.uniform2f(u('key'), o.t0, o.t1);
    gl.uniform1f(u('sharpen'), o.sharpen);
    gl.uniform1f(u('rich'), o.rich);
    const uSize = u('size');

    /* Холст — в настоящих пикселях экрана */
    function fit() {
      const side = Math.round(canvas.getBoundingClientRect().width * Math.min(window.devicePixelRatio || 1, 3));
      const target = Math.max(1, Math.min(o.maxSide, side || canvas.width));
      if (canvas.width !== target) { canvas.width = target; canvas.height = target; }
      gl.viewport(0, 0, canvas.width, canvas.height);
    }
    fit();

    return {
      fit,
      draw(video) {
        if (video.readyState < 2 || !video.videoWidth) return false;
        gl.uniform2f(uSize, video.videoWidth, video.videoHeight);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        return true;
      },
    };
  }

  /* Запуск в hero: неподвижный кадр виден сразу, анимация сменяет его,
     когда видео пошло. При «уменьшить движение» и без WebGL — только кадр,
     видео даже не скачивается. */
  function start(figure) {
    if (!figure) return;
    const video = figure.querySelector('.hero-logo-src');
    const canvas = figure.querySelector('.hero-logo-canvas');
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)');
    const keyer = createKeyer(canvas);
    if (!keyer) return;

    let started = false;
    let frameId = 0;

    const draw = () => {
      /* Холст сменяет картинку только после первого настоящего кадра */
      if (keyer.draw(video) && !started) { started = true; figure.classList.add('animated'); }
      frameId = video.requestVideoFrameCallback
        ? video.requestVideoFrameCallback(draw)
        : requestAnimationFrame(draw);
    };
    const stopDrawing = () => {
      if (video.cancelVideoFrameCallback) video.cancelVideoFrameCallback(frameId);
      cancelAnimationFrame(frameId);
    };
    const play = () => {
      if (calm.matches || document.hidden) return;
      if (video.preload !== 'auto') { video.preload = 'auto'; video.load(); }
      /* Браузер может отказать (режим экономии заряда) — тогда остаётся кадр */
      video.play().then(() => { stopDrawing(); draw(); }).catch(() => {});
    };
    const pause = () => { video.pause(); stopDrawing(); };

    play();
    document.addEventListener('visibilitychange', () => (document.hidden ? pause() : play()));
    calm.addEventListener?.('change', () => (calm.matches ? pause() : play()));
    canvas.addEventListener('webglcontextlost', () => { pause(); figure.classList.remove('animated'); });
    /* Поворот телефона, смена масштаба — холст подстраивается под новый размер */
    if ('ResizeObserver' in window) new ResizeObserver(() => keyer.fit()).observe(canvas);
  }

  window.KBHeroLogo = { createKeyer, start, DEFAULTS };
  start(document.getElementById('hero-logo'));
})();
