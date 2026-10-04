/* ==========================================================================
   scramble — посимвольная «расшифровка» текста из случайных символов кода.
   scramble(el, finalText, { duration, delay, chars }) → Promise
   bindHoverScramble(el) — короткий перебор при наведении/фокусе (~350 мс).
   Пробелы остаются пробелами, длина строки не меняется (моноширинный шрифт —
   ширина элемента стабильна). При prefers-reduced-motion — сразу финальный текст.
   ========================================================================== */
(function (root) {
  'use strict';

  var U = root.KODA_UTIL || {};
  var CHARS = U.CODE_CHARS || '01KDAØ:·/\\_—<>+=';
  var STEP_MS = 45; // как часто меняется «шумовой» символ

  var mq = root.matchMedia ? root.matchMedia('(prefers-reduced-motion: reduce)') : null;
  function reducedMotion() { return !!(mq && mq.matches); }

  function randChar(chars) {
    return chars[Math.floor(Math.random() * chars.length)];
  }

  function noise(len, chars) {
    chars = chars || CHARS;
    var out = '';
    for (var i = 0; i < len; i++) out += randChar(chars);
    return out;
  }

  function isSpace(ch) { return ch === ' ' || ch === ' ' || ch === '\n'; }

  function cancel(el) {
    if (el.__scramble) {
      cancelAnimationFrame(el.__scramble.raf);
      el.__scramble.resolve();
      el.__scramble = null;
    }
  }

  function scramble(el, finalText, opts) {
    opts = opts || {};
    if (finalText == null) finalText = el.textContent;
    finalText = String(finalText);
    cancel(el);

    if (reducedMotion() || !root.requestAnimationFrame) {
      el.textContent = finalText;
      return Promise.resolve();
    }

    var duration = opts.duration != null ? opts.duration : 600;
    var delay = opts.delay || 0;
    var chars = opts.chars || CHARS;
    var n = finalText.length;
    var reveal = new Array(n);
    var current = new Array(n);
    for (var i = 0; i < n; i++) {
      // слева направо с разбросом — читается как декодирование, а не как волна
      var pos = n > 1 ? i / (n - 1) : 1;
      reveal[i] = duration * (0.25 + 0.75 * (pos * 0.55 + Math.random() * 0.45));
      current[i] = isSpace(finalText[i]) ? finalText[i] : randChar(chars);
    }

    return new Promise(function (resolve) {
      var state = { raf: 0, resolve: resolve };
      el.__scramble = state;
      var start = 0;
      var lastStep = -1;

      function frame(now) {
        if (!start) start = now + delay;
        var t = now - start;
        if (t < 0) { state.raf = requestAnimationFrame(frame); return; }
        var step = Math.floor(t / STEP_MS);
        var done = true;
        for (var i = 0; i < n; i++) {
          var ch = finalText[i];
          if (isSpace(ch)) continue;
          if (t >= reveal[i]) { current[i] = ch; continue; }
          done = false;
          if (step !== lastStep) current[i] = randChar(chars);
        }
        lastStep = step;
        el.textContent = current.join('');
        if (done) {
          el.textContent = finalText;
          el.__scramble = null;
          resolve();
        } else {
          state.raf = requestAnimationFrame(frame);
        }
      }
      state.raf = requestAnimationFrame(frame);
    });
  }

  function bindHoverScramble(el, opts) {
    if (el.__hoverScramble) return;
    el.__hoverScramble = true;
    var target = el.querySelector('[data-scramble-target]') || el;
    var initial = target.textContent;
    var run = function () {
      if (target.__scramble) return; // уже перебирается — не дёргаем
      // финальный текст читаем в момент наведения: подпись могла смениться (МЕНЮ ↔ ЗАКРЫТЬ)
      var finalText = target.getAttribute('data-text') || initial;
      scramble(target, finalText, Object.assign({ duration: 350 }, opts));
    };
    el.addEventListener('pointerenter', function (e) {
      if (e.pointerType === 'mouse' || e.pointerType === 'pen') run();
    });
    el.addEventListener('focus', function () {
      if (el.matches(':focus-visible')) run();
    });
  }

  var api = {
    scramble: scramble,
    bindHoverScramble: bindHoverScramble,
    cancelScramble: cancel,
    noise: noise,
    reducedMotion: reducedMotion
  };
  root.KODA_UTIL = Object.assign(root.KODA_UTIL || {}, api);
})(typeof window !== 'undefined' ? window : globalThis);
