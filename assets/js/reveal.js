/* ==========================================================================
   reveal — появление при прокрутке.
   [data-reveal="words"]  — заголовок появляется по словам (подъём на 0.4em, шаг 50 мс)
   [data-reveal="fade"]   — кнопки и блоки мягко проявляются после заголовка
   [data-decode-text]     — подписи-коды расшифровываются при появлении
   [data-hover-scramble]  — подпись перебирается при наведении
   [data-scroll-decode]   — текст проступает из 0/1 по мере прокрутки
   ========================================================================== */
(function (root) {
  'use strict';

  var U = root.KODA_UTIL;

  function splitWords(el) {
    var i = 0;
    Array.prototype.slice.call(el.childNodes).forEach(function (node) {
      if (node.nodeType !== 3) return;
      // режем только по обычным пробелам: слова, связанные неразрывным, едут вместе
      var parts = node.textContent.split(/( +)/);
      var frag = document.createDocumentFragment();
      parts.forEach(function (part) {
        if (!part) return;
        if (/^ +$/.test(part)) { frag.appendChild(document.createTextNode(part)); return; }
        var w = document.createElement('span');
        w.className = 'w';
        w.style.setProperty('--i', i++);
        w.textContent = part;
        frag.appendChild(w);
      });
      node.parentNode.replaceChild(frag, node);
    });
    el.setAttribute('data-split', '');
    el.style.setProperty('--words', i);
  }

  function observe(els, onEnter, opts) {
    if (!els.length) return;
    if (!('IntersectionObserver' in root)) { Array.prototype.forEach.call(els, onEnter); return; }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        io.unobserve(en.target);
        onEnter(en.target);
      });
    }, opts || { rootMargin: '0px 0px -10% 0px' });
    Array.prototype.forEach.call(els, function (el) { io.observe(el); });
  }

  function initScrollDecode() {
    var els = document.querySelectorAll('[data-scroll-decode]');
    if (!els.length) return;
    var items = Array.prototype.map.call(els, function (el) {
      var text = el.textContent;
      el.textContent = '';
      var real = document.createElement('span');
      real.className = 'sr-only';
      real.textContent = text;
      var vis = document.createElement('span');
      vis.setAttribute('aria-hidden', 'true');
      el.appendChild(real);
      el.appendChild(vis);
      var thr = new Float32Array(text.length);
      var bits = '';
      for (var i = 0; i < text.length; i++) {
        thr[i] = (i / text.length) * 0.7 + Math.random() * 0.3;
        bits += Math.random() < 0.5 ? '0' : '1';
      }
      return { el: el, vis: vis, text: text, thr: thr, bits: bits, last: -1 };
    });

    function update() {
      var vh = root.innerHeight;
      items.forEach(function (it) {
        var r = it.el.getBoundingClientRect();
        // 0 — верх блока на 90% высоты экрана, 1 — на 35%
        var p = U.reducedMotion() ? 1 : Math.max(0, Math.min(1, (vh * 0.9 - r.top) / (vh * 0.55)));
        var q = Math.round(p * 200);
        if (q === it.last) return;
        it.last = q;
        var out = '';
        for (var i = 0; i < it.text.length; i++) {
          var ch = it.text[i];
          out += ch === ' ' || ch === ' ' || p >= it.thr[i] ? ch : it.bits[i];
        }
        it.vis.textContent = out;
      });
    }
    var ticking = false;
    root.addEventListener('scroll', function () {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () { ticking = false; update(); });
    }, { passive: true });
    root.addEventListener('resize', update);
    update();
  }

  function initReveal() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-reveal="words"]'), splitWords);

    observe(document.querySelectorAll('[data-reveal]'), function (el) { el.classList.add('is-in'); });

    observe(document.querySelectorAll('[data-decode-text]'), function (el) {
      var text = el.getAttribute('data-text') || el.textContent;
      el.setAttribute('data-decoded', '');
      U.scramble(el, text, { duration: 500 + Math.min(text.length * 12, 500) });
    }, { rootMargin: '0px 0px -5% 0px' });

    Array.prototype.forEach.call(document.querySelectorAll('[data-hover-scramble]'), function (el) {
      U.bindHoverScramble(el);
    });

    initScrollDecode();
    document.documentElement.classList.add('reveal-ready');
  }

  root.KODA_UTIL = Object.assign(root.KODA_UTIL || {}, { initReveal: initReveal });
})(window);
