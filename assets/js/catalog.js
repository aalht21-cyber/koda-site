/* ==========================================================================
   catalog — поведение каталога и страницы товара.
   initCatalog(): фильтры по этапу и линии без перезагрузки (FLIP-анимация
     перестройки сетки), переключатель GRID / LIST, плавающее превью
     *-cutout.webp рядом с курсором в LIST. Состояние — в адресе (?step=&line=&view=).
   initProduct(): наклон фото ±3° за курсором, панель «Найти в лаборатории»
     (кнопка товара и пункт меню «Найти лабораторию»).
   ========================================================================== */
(function (root) {
  'use strict';

  var U = root.KODA_UTIL;
  var EASE = 'cubic-bezier(.2,.7,.2,1)';
  var finePointer = root.matchMedia('(hover: hover) and (pointer: fine)');

  function $all(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }

  /* --- Фильтр с FLIP-анимацией (каталог, ингредиенты) ---------------------
     Уходящие гаснут → оставшиеся плавно переезжают на новые места → новые
     проявляются. Повторный вызов отменяет незаконченную перестройку. */
  var flipRun = 0;
  function flipFilter(items, matches, animate) {
    var my = ++flipRun;
    var leaving = items.filter(function (it) { return !it.hidden && !matches(it); });
    var entering = items.filter(function (it) { return it.hidden && matches(it); });
    var staying = items.filter(function (it) { return !it.hidden && matches(it); });

    if (!animate || U.reducedMotion() || !document.body.animate) {
      items.forEach(function (it) { it.hidden = !matches(it); });
      return Promise.resolve();
    }

    var fades = leaving.map(function (it) {
      return it.animate([{ opacity: 1 }, { opacity: 0, transform: 'scale(.97)' }], { duration: 180, easing: EASE, fill: 'forwards' }).finished;
    });
    return Promise.all(fades).then(function () {
      if (my !== flipRun) return;
      var first = staying.map(function (it) { return it.getBoundingClientRect(); });
      leaving.forEach(function (it) {
        it.hidden = true;
        it.getAnimations().forEach(function (a) { a.cancel(); });
      });
      entering.forEach(function (it) { it.hidden = false; });
      staying.forEach(function (it, i) {
        var a = first[i], b = it.getBoundingClientRect();
        var dx = a.left - b.left, dy = a.top - b.top;
        if (dx || dy) {
          it.animate([{ transform: 'translate(' + dx + 'px,' + dy + 'px)' }, { transform: 'none' }], { duration: 520, easing: EASE });
        }
      });
      entering.forEach(function (it, i) {
        it.animate([{ opacity: 0, transform: 'translateY(16px)' }, { opacity: 1, transform: 'none' }],
          { duration: 420, delay: 140 + i * 40, easing: EASE, fill: 'backwards' });
      });
    });
  }

  /* --- Каталог ------------------------------------------------------------- */
  function initCatalog() {
    var list = document.querySelector('[data-catalog]');
    if (!list) return;
    var items = $all('.cat-item', list);
    var count = document.querySelector('[data-cat-count]');
    var empty = document.querySelector('[data-cat-empty]');
    var state = { step: 'all', line: 'all', view: 'grid' };

    // начальное состояние из адреса
    try {
      var q = new URLSearchParams(location.search);
      ['step', 'line', 'view'].forEach(function (k) { if (q.get(k)) state[k] = q.get(k); });
    } catch (e) {}
    if (state.view !== 'list') state.view = 'grid';

    function matches(it) {
      return (state.step === 'all' || it.getAttribute('data-step') === state.step) &&
        (state.line === 'all' || it.getAttribute('data-line') === state.line);
    }

    function syncUI() {
      $all('[data-filter]').forEach(function (b) {
        b.setAttribute('aria-pressed', String(state[b.getAttribute('data-filter')] === b.getAttribute('data-value')));
      });
      $all('button[data-view]').forEach(function (b) {
        b.setAttribute('aria-pressed', String(b.getAttribute('data-view') === state.view));
      });
      list.setAttribute('data-view', state.view);
      document.querySelector('.cat-wrap').setAttribute('data-view', state.view);
      var n = items.filter(matches).length;
      var text = U.render.formulas(n);
      if (count.textContent !== text) U.scramble(count, text, { duration: 400 });
      empty.hidden = n > 0;
    }

    function saveURL() {
      try {
        var q = new URLSearchParams();
        if (state.step !== 'all') q.set('step', state.step);
        if (state.line !== 'all') q.set('line', state.line);
        if (state.view !== 'grid') q.set('view', state.view);
        var s = q.toString();
        history.replaceState(null, '', location.pathname + (s ? '?' + s : '') + location.hash);
      } catch (e) {}
    }

    function apply(animate) {
      syncUI();
      saveURL();
      flipFilter(items, matches, animate);
    }

    function setView(view) {
      if (view === state.view) return;
      state.view = view;
      if (U.reducedMotion() || !list.animate) { syncUI(); saveURL(); return; }
      list.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160, easing: EASE }).finished.then(function () {
        syncUI(); saveURL();
        list.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 360, easing: EASE });
      });
    }

    document.addEventListener('click', function (e) {
      var f = e.target.closest('[data-filter]');
      if (f) {
        state[f.getAttribute('data-filter')] = f.getAttribute('data-value');
        apply(true);
        return;
      }
      var v = e.target.closest('button[data-view]');
      if (v) { setView(v.getAttribute('data-view')); return; }
      if (e.target.closest('[data-cat-reset]')) {
        state.step = 'all'; state.line = 'all';
        apply(true);
      }
    });

    $all('.cat-bar .code-toggle, [data-cat-reset]').forEach(function (b) { U.bindHoverScramble(b); });

    apply(false);
    initPreview(list);
  }

  // LIST: плавающее превью вырезанного флакона рядом с курсором
  function initPreview(list) {
    if (!finePointer.matches) return;
    var box = document.createElement('div');
    box.className = 'cat-preview';
    box.setAttribute('aria-hidden', 'true');
    var img = document.createElement('img');
    img.alt = '';
    img.decoding = 'async';
    box.appendChild(img);
    document.body.appendChild(box);
    var x = 0, y = 0, raf = 0, current = null;

    function place() {
      raf = 0;
      box.style.transform = 'translate(' + (x + 24) + 'px,' + (y - box.offsetHeight / 2) + 'px)';
    }

    list.addEventListener('pointermove', function (e) {
      if (list.getAttribute('data-view') !== 'list' || e.pointerType !== 'mouse') return;
      x = e.clientX; y = e.clientY;
      var it = e.target.closest('.cat-item');
      if (it !== current) {
        current = it;
        if (it) {
          var src = it.getAttribute('data-cutout');
          if (img.getAttribute('src') !== src) img.src = src;
          box.classList.add('is-on');
        } else {
          box.classList.remove('is-on');
        }
      }
      if (!raf) raf = requestAnimationFrame(place);
    });
    list.addEventListener('pointerleave', function () {
      current = null;
      box.classList.remove('is-on');
    });
  }

  /* --- Товар --------------------------------------------------------------- */
  function initTilt() {
    var el = document.querySelector('[data-tilt]');
    if (!el || !finePointer.matches || U.reducedMotion()) return;
    var target = el.querySelector('.frame') || el;
    var host = el.parentElement;
    var raf = 0, rx = 0, ry = 0;
    function set() {
      raf = 0;
      target.style.transform = 'rotateX(' + rx.toFixed(2) + 'deg) rotateY(' + ry.toFixed(2) + 'deg)';
    }
    host.addEventListener('pointermove', function (e) {
      var r = el.getBoundingClientRect();
      var px = (e.clientX - r.left) / r.width - 0.5;
      var py = (e.clientY - r.top) / r.height - 0.5;
      ry = Math.max(-3, Math.min(3, px * 6));
      rx = Math.max(-3, Math.min(3, -py * 6));
      if (!raf) raf = requestAnimationFrame(set);
    });
    host.addEventListener('pointerleave', function () {
      rx = ry = 0;
      if (!raf) raf = requestAnimationFrame(set);
    });
  }

  function initLabDrawer() {
    var dialog = document.querySelector('[data-lab-drawer]');
    if (!dialog || typeof dialog.showModal !== 'function') return;
    function open(e) {
      if (e) e.preventDefault();
      dialog.showModal();
      document.body.classList.add('is-locked');
      if (U.tickClock) U.tickClock();
    }
    // кнопка товара и пункт меню «Найти лабораторию» открывают панель, а не уводят на страницу
    $all('[data-lab-open], [data-find-lab]').forEach(function (b) { b.addEventListener('click', open); });
    dialog.addEventListener('close', function () { document.body.classList.remove('is-locked'); });
    dialog.addEventListener('click', function (e) {
      if (e.target === dialog || e.target.closest('[data-drawer-close]')) dialog.close();
    });
  }

  function initProduct() {
    if (document.body.getAttribute('data-page') !== 'product') return;
    initTilt();
    initLabDrawer();
  }

  root.KODA_UTIL = Object.assign(root.KODA_UTIL || {}, { initCatalog: initCatalog, initProduct: initProduct, flipFilter: flipFilter });
})(window);
