/* ==========================================================================
   ingredients — 12 переворачиваемых карточек.
   Переворот: клик/тап по лицевой стороне, Enter/Space; на обороте — клик по
   свободному месту или кнопка «Перевернуть». Открыта только одна карточка.
   При перевороте название перебирается. Якорь #oat, #fig… — прокрутка к
   карточке и переворот. Фильтр по группам — с той же FLIP-анимацией, что в каталоге.
   ========================================================================== */
(function (root) {
  'use strict';

  var U = root.KODA_UTIL;

  function initIngredients() {
    var grid = document.querySelector('[data-ing-grid]');
    if (!grid) return;
    var items = Array.prototype.slice.call(grid.querySelectorAll('.ing'));
    var count = document.querySelector('[data-ing-count]');
    var filter = 'all';

    function parts(li) {
      return {
        front: li.querySelector('.ing__front'),
        back: li.querySelector('.ing__back'),
        backBtn: li.querySelector('.ing__back-btn'),
        links: li.querySelectorAll('.ing__back a'),
        title: li.querySelector('.ing__title'),
        code: li.querySelector('.ing__code')
      };
    }

    function setHash(id) {
      try {
        history.replaceState(null, '', location.pathname + location.search + (id ? '#' + id : ''));
      } catch (e) {}
    }

    function flip(li, on, focus) {
      var p = parts(li);
      if (li.classList.contains('is-flipped') === on) return;
      if (on) {
        items.forEach(function (other) { if (other !== li) flip(other, false, false); });
      }
      li.classList.toggle('is-flipped', on);
      p.front.setAttribute('aria-pressed', String(on));
      p.front.tabIndex = on ? -1 : 0;
      p.backBtn.tabIndex = on ? 0 : -1;
      Array.prototype.forEach.call(p.links, function (a) { a.tabIndex = on ? 0 : -1; });
      if (on) {
        U.scramble(p.code, p.code.getAttribute('data-text'), { duration: 600 });
        setHash(li.id);
        if (focus) p.backBtn.focus({ preventScroll: true });
      } else {
        U.scramble(p.title, p.title.getAttribute('data-text'), { duration: 500 });
        if (location.hash === '#' + li.id) setHash('');
        if (focus) p.front.focus({ preventScroll: true });
      }
    }

    items.forEach(function (li) {
      var p = parts(li);
      p.front.addEventListener('click', function () { flip(li, true, false); });
      p.front.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          flip(li, true, true);
        }
      });
      p.back.addEventListener('click', function (e) {
        if (e.target.closest('a')) return;
        var viaButton = !!e.target.closest('.ing__back-btn');
        flip(li, false, viaButton && e.detail === 0); // фокус возвращаем только при работе с клавиатуры
      });
      li.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && li.classList.contains('is-flipped')) flip(li, false, true);
      });
    });

    function applyFilter(value, animate) {
      filter = value;
      document.querySelectorAll('[data-ing-filter]').forEach(function (b) {
        b.setAttribute('aria-pressed', String(b.getAttribute('data-ing-filter') === value));
      });
      var match = function (li) { return value === 'all' || li.getAttribute('data-group') === value; };
      items.forEach(function (li) { if (!match(li)) flip(li, false, false); });
      var n = items.filter(match).length;
      U.scramble(count, n + '/' + items.length, { duration: 300 });
      return U.flipFilter(items, match, animate);
    }

    document.querySelectorAll('[data-ing-filter]').forEach(function (b) {
      U.bindHoverScramble(b);
      b.addEventListener('click', function () { applyFilter(b.getAttribute('data-ing-filter'), true); });
    });

    // Заход по якорю: прокрутить к карточке и перевернуть её
    function openFromHash() {
      var id = decodeURIComponent(location.hash.slice(1));
      if (!id) return;
      var li = document.getElementById(id);
      if (!li || !li.classList.contains('ing')) return;
      var go = function () {
        var reduced = U.reducedMotion();
        li.scrollIntoView({ block: 'center', inline: 'center', behavior: reduced ? 'auto' : 'smooth' });
        setTimeout(function () { flip(li, true, false); }, reduced ? 0 : 650);
      };
      if (filter !== 'all' && li.getAttribute('data-group') !== filter) applyFilter('all', false).then(go);
      else go();
    }
    root.addEventListener('hashchange', openFromHash);
    openFromHash();
  }

  root.KODA_UTIL = Object.assign(root.KODA_UTIL || {}, { initIngredients: initIngredients });
})(window);
