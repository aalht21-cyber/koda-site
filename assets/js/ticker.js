/* ==========================================================================
   ticker — фиксированная строка внизу экрана. Символы кода меняются ~10 раз
   в секунду; раз в 8–10 с строка расшифровывается в слоган из brand.slogans,
   держится 2 с и снова рассыпается. Декоративна: aria-hidden, без событий мыши.
   ========================================================================== */
(function (root) {
  'use strict';

  var U = root.KODA_UTIL;
  var NOISE = '0101010101KDAØ:·/_<>+=    ';
  var FRAME = 100;      // 10 fps для шума
  var FRAME_FAST = 50;  // во время расшифровки
  var DECODE = 900;
  var HOLD = 2000;
  var SCATTER = 600;

  function initTicker() {
    var el = document.querySelector('[data-ticker]');
    if (!el) return;
    var line = el.querySelector('.ticker__line') || el;
    var slogans = ((root.KODA && KODA.brand && KODA.brand.slogans) || []).map(function (s) {
      return U.codeify(s, 1);
    });
    var sloganIndex = 0;
    var cols = 0;
    var target = '';   // строка со слоганом посередине, остальное — пробелы
    var reveal = [];   // время раскрытия для каждой позиции
    var phase = 'noise';
    var phaseStart = 0;
    var nextSlogan = 0;
    var timer = 0;

    function charWidth() {
      var probe = document.createElement('span');
      probe.style.cssText = 'position:absolute;visibility:hidden;white-space:pre';
      probe.textContent = '0000000000000000000000000000000000000000';
      line.appendChild(probe);
      var w = probe.getBoundingClientRect().width / 40;
      line.removeChild(probe);
      return w || 7.2;
    }

    function measure() {
      cols = Math.max(8, Math.floor(line.clientWidth / charWidth()));
    }

    function rnd() { return NOISE[Math.floor(Math.random() * NOISE.length)]; }

    function noiseLine() {
      var s = '';
      for (var i = 0; i < cols; i++) s += rnd();
      return s;
    }

    function buildTarget(text) {
      if (text.length > cols) text = text.slice(0, cols);
      var left = Math.floor((cols - text.length) / 2);
      var s = '';
      for (var i = 0; i < cols; i++) {
        var j = i - left;
        s += j >= 0 && j < text.length ? text[j] : ' ';
      }
      return s;
    }

    function randomDelay() { return 8000 + Math.random() * 2000; }

    function render(now) {
      var t = now - phaseStart;
      var out = '';
      var i;
      if (phase === 'noise') {
        out = noiseLine();
        if (slogans.length && now >= nextSlogan) {
          target = buildTarget(slogans[sloganIndex++ % slogans.length]);
          reveal = [];
          for (i = 0; i < cols; i++) reveal.push(Math.random() * DECODE);
          phase = 'decode'; phaseStart = now;
        }
      } else if (phase === 'decode') {
        for (i = 0; i < cols; i++) out += t >= reveal[i] ? target[i] : rnd();
        if (t >= DECODE) { phase = 'hold'; phaseStart = now; out = target; }
      } else if (phase === 'hold') {
        out = target;
        if (t >= HOLD) { phase = 'scatter'; phaseStart = now; }
      } else if (phase === 'scatter') {
        for (i = 0; i < cols; i++) out += t >= reveal[i] * (SCATTER / DECODE) ? rnd() : target[i];
        if (t >= SCATTER) { phase = 'noise'; phaseStart = now; nextSlogan = now + randomDelay(); }
      }
      line.textContent = out;
    }

    function loop() {
      clearTimeout(timer);
      if (document.hidden) return;
      render(performance.now());
      timer = setTimeout(loop, phase === 'noise' || phase === 'hold' ? FRAME : FRAME_FAST);
    }

    measure();

    if (U.reducedMotion()) {
      line.textContent = slogans.length ? buildTarget(slogans[0]) : '';
      return;
    }

    nextSlogan = performance.now() + 2500; // первый слоган — вскоре после загрузки
    loop();
    document.addEventListener('visibilitychange', loop);

    var resizeTimer = 0;
    root.addEventListener('resize', function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        measure();
        if (phase !== 'noise') { phase = 'noise'; nextSlogan = performance.now() + 1000; }
      }, 150);
    });
  }

  root.KODA_UTIL = Object.assign(root.KODA_UTIL || {}, { initTicker: initTicker });
})(window);
