/* ==========================================================================
   transitions — прелоадер и переходы между страницами.
   Прелоадер (первый вход в сессии, ≤1.6 с): вверху слева растёт строка 0/1,
   в конце схлопывается в знак «0» на месте логотипа в шапке.
   Переход: клик по внутренней ссылке → экран за ~350 мс заполняется шумом
   0/1/K/D/A → переход → на новой странице шум рассеивается.
   Флаги — в sessionStorage (в try/catch). Внешние, tel:, mailto:, якоря,
   target=_blank, клики с модификаторами не перехватываются.
   Классы is-preloading / is-arriving ставит inline-скрипт в <head>.
   ========================================================================== */
(function (root) {
  'use strict';

  var U = root.KODA_UTIL;
  var html = document.documentElement;
  var KEY_PRE = 'koda-preloaded';
  var KEY_TR = 'koda-transition';
  var CHARS = '01KDA0';
  var COVER_MS = 350;
  var CLEAR_MS = 450;
  var PX = 13;

  function store(fn) { try { return fn(root.sessionStorage); } catch (e) { return null; } }
  function css(name) { return getComputedStyle(html).getPropertyValue(name).trim(); }

  /* --- Сетка шума поверх экрана -------------------------------------------- */
  function noiseLayer() {
    var canvas = document.createElement('canvas');
    canvas.className = 'noise-layer';
    canvas.setAttribute('aria-hidden', 'true');
    document.body.appendChild(canvas);
    var w = root.innerWidth, h = root.innerHeight;
    var ctx = U.setupCanvas(canvas, w, h);
    var cell = U.measureCell(ctx, PX);
    ctx.font = '400 ' + PX + 'px "Fira Code", ui-monospace, monospace';
    var cols = Math.ceil(w / cell.cw), rows = Math.ceil(h / cell.ch);
    var n = cols * rows;
    var order = new Uint32Array(n);
    for (var i = 0; i < n; i++) order[i] = i;
    for (var j = n - 1; j > 0; j--) {
      var k = (Math.random() * (j + 1)) | 0, t = order[j]; order[j] = order[k]; order[k] = t;
    }
    var paper = css('--paper'), ink = css('--ink');
    return {
      canvas: canvas, n: n, order: order,
      fill: function (i) {
        var x = i % cols, y = (i / cols) | 0;
        var px = Math.floor(x * cell.cw), py = y * cell.ch;
        ctx.fillStyle = paper;
        ctx.fillRect(px, py, Math.ceil(cell.cw) + 1, cell.ch);
        ctx.fillStyle = ink;
        ctx.fillText(CHARS[(Math.random() * CHARS.length) | 0], x * cell.cw, py + (cell.ch - PX) / 2);
      },
      clear: function (i) {
        var x = i % cols, y = (i / cols) | 0;
        ctx.clearRect(Math.floor(x * cell.cw), y * cell.ch, Math.ceil(cell.cw) + 1, cell.ch);
      }
    };
  }

  function animateCells(layer, duration, op, done) {
    var start = performance.now(), count = 0;
    requestAnimationFrame(function frame(now) {
      var p = Math.min(1, (now - start) / duration);
      var target = Math.floor(layer.n * p);
      for (; count < target; count++) layer[op](layer.order[count]);
      if (p < 1) requestAnimationFrame(frame); else if (done) done();
    });
  }

  /* --- Прелоадер ----------------------------------------------------------- */
  function runPreloader() {
    return new Promise(function (resolve) {
      store(function (s) { s.setItem(KEY_PRE, '1'); });
      var el = document.createElement('div');
      el.className = 'preloader';
      el.setAttribute('aria-hidden', 'true');
      var line = document.createElement('span');
      line.className = 'preloader__line';
      el.appendChild(line);
      document.body.appendChild(el);
      html.classList.remove('is-preloading');

      var cw = (U.measureCell(document.createElement('canvas').getContext('2d'), 13).cw) || 7.8;
      var max = Math.max(12, Math.floor((root.innerWidth * (root.innerWidth < 640 ? 0.6 : 0.33)) / cw));
      var bits = '';
      for (var i = 0; i < max; i++) bits += Math.random() < 0.5 ? '0' : '1';

      var real = 0;
      var fontsDone = false, loadDone = document.readyState === 'complete';
      var bump = function () { real = (fontsDone ? 0.5 : 0) + (loadDone ? 0.5 : 0); };
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { fontsDone = true; bump(); });
      else fontsDone = true;
      root.addEventListener('load', function () { loadDone = true; bump(); }, { once: true });
      bump();

      var start = performance.now();
      requestAnimationFrame(function grow(now) {
        var t = now - start;
        var p = Math.min(t / 1050, 0.3 + 0.7 * real);
        if (t > 1250) p = 1; // жёсткий потолок, чтобы уложиться в 1.6 с
        var len = Math.max(1, Math.round(max * p));
        var s = '';
        for (var i = 0; i < len; i++) s += Math.random() < 0.15 ? (Math.random() < 0.5 ? '0' : '1') : bits[i];
        line.textContent = s;
        if (p < 1) { requestAnimationFrame(grow); return; }
        collapse();
      });

      function collapse() {
        var from = line.textContent.length;
        var cStart = performance.now();
        requestAnimationFrame(function shrink(now) {
          var p = Math.min(1, (now - cStart) / 220);
          var len = Math.max(1, Math.round(from * (1 - p * p)));
          line.textContent = len > 1 ? line.textContent.slice(0, len - 1) + '0' : '0';
          if (p < 1) { requestAnimationFrame(shrink); return; }
          el.classList.add('is-done');
          resolve();
          setTimeout(function () { el.remove(); }, 260);
        });
      }
    });
  }

  /* --- Прибытие на страницу ------------------------------------------------ */
  function runArrival() {
    store(function (s) { s.removeItem(KEY_TR); });
    var layer = noiseLayer();
    for (var i = 0; i < layer.n; i++) layer.fill(i);
    html.classList.remove('is-arriving');
    return new Promise(function (resolve) {
      animateCells(layer, CLEAR_MS, 'clear', function () { layer.canvas.remove(); });
      setTimeout(resolve, CLEAR_MS * 0.3);
    });
  }

  function runIntro() {
    var reduced = U.reducedMotion();
    if (html.classList.contains('is-preloading')) {
      if (reduced) { html.classList.remove('is-preloading'); store(function (s) { s.setItem(KEY_PRE, '1'); }); return Promise.resolve(); }
      return runPreloader();
    }
    if (html.classList.contains('is-arriving')) {
      if (reduced) { html.classList.remove('is-arriving'); store(function (s) { s.removeItem(KEY_TR); }); return Promise.resolve(); }
      return runArrival();
    }
    store(function (s) { s.removeItem(KEY_TR); });
    return Promise.resolve();
  }

  /* --- Уход со страницы ---------------------------------------------------- */
  function isInternal(a, e) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return false;
    if (a.target && a.target !== '_self') return false;
    if (a.hasAttribute('download') || a.hasAttribute('data-no-transition')) return false;
    var href = a.getAttribute('href') || '';
    if (!href || href.charAt(0) === '#' || /^(tel:|mailto:|javascript:)/i.test(href)) return false;
    var url;
    try { url = new URL(a.href, location.href); } catch (err) { return false; }
    if (url.protocol !== location.protocol || url.host !== location.host) return false;
    // ссылка на якорь той же страницы
    if (url.pathname === location.pathname && url.search === location.search && url.hash) return false;
    return true;
  }

  function initTransitions() {
    document.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('a[href]');
      if (!a || !isInternal(a, e)) return;
      if (U.reducedMotion()) return;
      e.preventDefault();
      var href = a.href;
      store(function (s) { s.setItem(KEY_TR, '1'); });
      if (U.encodeVisible) U.encodeVisible(COVER_MS);
      var layer = noiseLayer();
      animateCells(layer, COVER_MS, 'fill', function () { location.href = href; });
    });

    // Возврат кнопкой «назад» из bfcache: убрать оставшийся шум
    root.addEventListener('pageshow', function (e) {
      if (!e.persisted) return;
      Array.prototype.forEach.call(document.querySelectorAll('.noise-layer, .preloader'), function (n) { n.remove(); });
      html.classList.remove('is-preloading', 'is-arriving');
      store(function (s) { s.removeItem(KEY_TR); });
    });
  }

  root.KODA_UTIL = Object.assign(root.KODA_UTIL || {}, { runIntro: runIntro, initTransitions: initTransitions });
})(window);
