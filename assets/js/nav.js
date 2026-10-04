/* ==========================================================================
   nav — шапка, мобильная панель «Меню», справка «?».
   - при загрузке пункты «расшифровываются» из шума с задержкой по порядку;
   - при наведении/фокусе коротко перебираются (scramble ~350 мс);
   - мобильная панель: полноэкранная, пункты появляются по одному, Esc и
     ловушка фокуса; справка — нативный <dialog>.
   ========================================================================== */
(function (root) {
  'use strict';

  var U = root.KODA_UTIL;

  function focusables(container) {
    return Array.prototype.filter.call(
      container.querySelectorAll('a[href], button:not([disabled]), input, [tabindex]:not([tabindex="-1"])'),
      function (el) { return el.offsetParent !== null || el === document.activeElement; }
    );
  }

  function initDecodeOnLoad() {
    var links = document.querySelectorAll('.site-nav__list .nav-link, .site-nav__tools .nav-find');
    Array.prototype.forEach.call(links, function (el, i) {
      var target = el.querySelector('[data-scramble-target]') || el;
      var finalText = target.getAttribute('data-text') || target.textContent;
      U.scramble(target, finalText, { duration: 700, delay: 80 + i * 45 });
    });
  }

  function initHover() {
    var els = document.querySelectorAll('.nav-link, .menu-panel__link, .btn');
    Array.prototype.forEach.call(els, function (el) { U.bindHoverScramble(el); });
  }

  function initMenu() {
    var toggle = document.querySelector('[data-menu-toggle]');
    var panel = document.querySelector('[data-menu-panel]');
    if (!toggle || !panel) return;
    var label = toggle.querySelector('[data-scramble-target]');
    var links = panel.querySelectorAll('.menu-panel__link');
    var lastFocus = null;

    function setLabel(text) {
      label.setAttribute('data-text', text);
      U.scramble(label, text, { duration: 300 });
    }

    function open() {
      lastFocus = document.activeElement;
      panel.hidden = false;
      document.body.classList.add('is-menu-open', 'is-locked');
      toggle.setAttribute('aria-expanded', 'true');
      setLabel('ЗАКРЫТЬ ×');
      // пункты появляются по одному, каждый расшифровывается
      Array.prototype.forEach.call(links, function (a, i) {
        var target = a.querySelector('[data-scramble-target]') || a;
        a.style.setProperty('--i', i);
        U.scramble(target, target.getAttribute('data-text'), { duration: 500, delay: 60 + i * 60 });
      });
      requestAnimationFrame(function () { panel.classList.add('is-open'); });
      if (links[0]) links[0].focus({ preventScroll: true });
    }

    function close(restoreFocus) {
      panel.classList.remove('is-open');
      document.body.classList.remove('is-menu-open', 'is-locked');
      toggle.setAttribute('aria-expanded', 'false');
      setLabel('МЕНЮ');
      panel.hidden = true;
      if (restoreFocus !== false && lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
    }

    toggle.addEventListener('click', function () {
      if (panel.hidden) open(); else close();
    });

    document.addEventListener('keydown', function (e) {
      if (panel.hidden) return;
      if (e.key === 'Escape') { e.preventDefault(); close(); return; }
      if (e.key === 'Tab') {
        // ловушка фокуса: панель + кнопка «Закрыть»
        var items = [toggle].concat(focusables(panel));
        var first = items[0];
        var last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });

    panel.addEventListener('click', function (e) {
      if (e.target.closest('a')) close(false);
    });

    // на десктопе панель не нужна
    var mq = root.matchMedia('(min-width: 1024px)');
    var onChange = function () { if (mq.matches && !panel.hidden) close(false); };
    if (mq.addEventListener) mq.addEventListener('change', onChange); else mq.addListener(onChange);
  }

  function initHelp() {
    var dialog = document.querySelector('[data-help]');
    if (!dialog || typeof dialog.showModal !== 'function') return;
    var openers = document.querySelectorAll('[data-help-open]');
    Array.prototype.forEach.call(openers, function (btn) {
      btn.addEventListener('click', function () {
        dialog.showModal();
        document.body.classList.add('is-locked');
      });
    });
    dialog.addEventListener('close', function () { document.body.classList.remove('is-locked'); });
    dialog.addEventListener('click', function (e) {
      if (e.target === dialog || e.target.closest('[data-help-close]')) dialog.close();
    });
  }

  function initNav() {
    initHover();
    initDecodeOnLoad();
    initMenu();
    initHelp();
  }

  root.KODA_UTIL = Object.assign(root.KODA_UTIL || {}, { initNav: initNav });
})(window);
