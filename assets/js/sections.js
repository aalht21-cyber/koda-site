/* ==========================================================================
   sections — поведение секций внутренних страниц.
   initCodeFields()   — бинарные поля [data-code-field] (plum-экраны, 404)
   initParallax()     — плакаты [data-parallax] сдвигаются на ±40px при прокрутке
   initSloganScreen() — слоганы по очереди расшифровываются из бинарного поля
   initCityList()     — список городов: рядом с курсором проявляется кадр города
   initVideoSlots()   — ролик города, если файл есть; иначе остаётся фото
   initSteps()        — шаги рефила: номер перебирается от 00, линия рисуется по скроллу
   ========================================================================== */
(function (root) {
  'use strict';

  var U = root.KODA_UTIL;
  var finePointer = root.matchMedia('(hover: hover) and (pointer: fine)');

  function $all(sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); }

  // Один rAF на все обработчики прокрутки
  var scrollers = [];
  var ticking = false;
  function onScroll(fn) {
    if (!scrollers.length) {
      var run = function () {
        ticking = false;
        scrollers.forEach(function (f) { f(); });
      };
      root.addEventListener('scroll', function () {
        if (!ticking) { ticking = true; requestAnimationFrame(run); }
      }, { passive: true });
      root.addEventListener('resize', run);
    }
    scrollers.push(fn);
    fn();
  }

  function initCodeFields() {
    $all('[data-code-field]').forEach(function (c) {
      var paper = c.getAttribute('data-variant') === 'paper';
      U.codeField(c, paper ? { fg: '--ink', alpha: 0.14, hi: '--ink' } : {});
    });
  }

  function initParallax() {
    var els = $all('[data-parallax]');
    if (!els.length || U.reducedMotion()) return;
    onScroll(function () {
      var vh = root.innerHeight;
      els.forEach(function (el) {
        var r = el.getBoundingClientRect();
        if (r.bottom < -100 || r.top > vh + 100) return;
        // -1 … 1: от входа снизу до выхода сверху
        var p = ((r.top + r.height / 2) - vh / 2) / (vh / 2 + r.height / 2);
        var img = el.querySelector('img');
        if (img) img.style.transform = 'translate3d(0,' + (Math.max(-1, Math.min(1, p)) * -40).toFixed(1) + 'px,0)';
      });
    });
  }

  function initSloganScreen() {
    var el = document.querySelector('[data-slogan-screen]');
    if (!el) return;
    var slogans = $all('[data-slogan]').map(function (li) { return li.getAttribute('data-slogan'); });
    if (!slogans.length) return;
    var i = 0, timer = 0, visible = false;
    var longest = slogans.reduce(function (a, b) { return a.length > b.length ? a : b; });
    // бинарная заготовка той же длины — строка не прыгает по ширине
    function bits(len) { var s = ''; for (var k = 0; k < len; k++) s += Math.random() < 0.5 ? '0' : '1'; return s; }
    el.style.minHeight = '1lh';
    el.textContent = slogans[0];
    if (U.reducedMotion()) return;

    function next() {
      clearTimeout(timer);
      if (!visible || document.hidden) return;
      var text = slogans[i++ % slogans.length];
      el.textContent = bits(text.length);
      U.scramble(el, text, { duration: 1100, chars: '01' }).then(function () {
        timer = setTimeout(next, 2600);
      });
    }
    if ('IntersectionObserver' in root) {
      new IntersectionObserver(function (en) {
        var was = visible;
        visible = en[0].isIntersecting;
        if (visible && !was) next();
      }, { threshold: 0.3 }).observe(el);
    }
    document.addEventListener('visibilitychange', function () { if (!document.hidden && visible) next(); });
    el.setAttribute('data-longest', longest);
  }

  function initCityList() {
    var list = document.querySelector('[data-city-list]');
    if (!list || !finePointer.matches) return;
    var box = document.createElement('div');
    box.className = 'city-preview';
    box.setAttribute('aria-hidden', 'true');
    box.innerHTML = '<div class="media"><img alt="" decoding="async" data-decode></div>';
    document.body.appendChild(box);
    var media = box.firstChild, img = media.firstChild;
    var x = 0, y = 0, raf = 0, current = null;

    function place() {
      raf = 0;
      var w = box.offsetWidth, h = box.offsetHeight;
      var left = x + 32 + w > root.innerWidth ? x - w - 32 : x + 32;
      box.style.transform = 'translate(' + left + 'px,' + (y - h / 2) + 'px)';
    }

    list.addEventListener('pointermove', function (e) {
      if (e.pointerType !== 'mouse') return;
      x = e.clientX; y = e.clientY;
      var row = e.target.closest('.city-row');
      if (row !== current) {
        current = row;
        list.classList.toggle('is-hovering', !!row);
        $all('.city-row.is-active').forEach(function (r) { r.classList.remove('is-active'); });
        if (row) {
          row.classList.add('is-active');
          box.classList.add('is-on');
          $all('.city-preview .decode-canvas').forEach(function (c) { c.remove(); });
          img.classList.remove('is-decoded', 'is-decoding');
          media.classList.remove('is-revealed');
          img.src = row.getAttribute('data-preview');
          U.decodeNow(img);
        } else {
          box.classList.remove('is-on');
        }
      }
      if (!raf) raf = requestAnimationFrame(place);
    });
    list.addEventListener('pointerleave', function () {
      current = null;
      list.classList.remove('is-hovering');
      $all('.city-row.is-active').forEach(function (r) { r.classList.remove('is-active'); });
      box.classList.remove('is-on');
    });
  }

  // Ролик города: если файла нет, браузер вернёт ошибку — остаётся фото
  function initVideoSlots() {
    if (U.reducedMotion()) return;
    $all('[data-video-slot]').forEach(function (slot) {
      var src = slot.getAttribute('data-video-slot');
      var img = slot.querySelector('img');
      var v = document.createElement('video');
      v.muted = true;
      v.loop = true;
      v.playsInline = true;
      v.setAttribute('muted', '');
      v.setAttribute('playsinline', '');
      v.setAttribute('aria-hidden', 'true');
      v.preload = 'metadata';
      if (img) v.poster = img.currentSrc || img.src;
      v.className = 'video-slot';
      v.addEventListener('loadeddata', function () {
        slot.classList.add('has-video');
        var p = v.play();
        if (p && p.catch) p.catch(function () {});
      }, { once: true });
      v.addEventListener('error', function () { v.remove(); }, { once: true });
      v.src = src;
      slot.appendChild(v);
    });
  }

  function initSteps() {
    var box = document.querySelector('[data-steps]');
    if (!box) return;
    var line = box.querySelector('.steps__line line');
    var reduced = U.reducedMotion();

    // номер «перебирается» от 00 до своего значения
    var nums = $all('[data-count]');
    var count = function (el) {
      var target = parseInt(el.getAttribute('data-count'), 10) || 0;
      if (reduced) { el.textContent = el.getAttribute('data-count'); return; }
      var k = 0;
      var tick = function () {
        el.textContent = String(k).padStart(2, '0');
        if (k++ < target) setTimeout(tick, 110);
      };
      tick();
    };
    if ('IntersectionObserver' in root) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (!en.isIntersecting) return;
          io.unobserve(en.target);
          count(en.target);
        });
      }, { rootMargin: '0px 0px -15% 0px' });
      nums.forEach(function (n) { n.textContent = '00'; io.observe(n); });
    }

    if (!line) return;
    if (reduced) { line.style.strokeDashoffset = '0'; return; }
    onScroll(function () {
      var r = box.getBoundingClientRect();
      var vh = root.innerHeight;
      var p = Math.max(0, Math.min(1, (vh * 0.75 - r.top) / r.height));
      line.style.strokeDashoffset = String(1 - p);
    });
  }

  function initSections() {
    initCodeFields();
    initParallax();
    initSloganScreen();
    initCityList();
    initVideoSlots();
    initSteps();
  }

  root.KODA_UTIL = Object.assign(root.KODA_UTIL || {}, { initSections: initSections });
})(window);
