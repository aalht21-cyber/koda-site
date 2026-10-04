/* ==========================================================================
   cursor — служебная подпись рядом с системным курсором (курсор не скрываем).
   Элемент с [data-cursor="CLICK"] / [data-cursor="VIEW"] показывает подпись
   в 8px справа от курсора. Только для (hover: hover) and (pointer: fine).
   ========================================================================== */
(function (root) {
  'use strict';

  function initCursor() {
    if (!root.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    var label = document.createElement('div');
    label.className = 'cursor-label';
    label.setAttribute('aria-hidden', 'true');
    document.body.appendChild(label);
    var x = 0, y = 0, raf = 0, current = '';

    function place() {
      raf = 0;
      label.style.transform = 'translate(' + (x + 8) + 'px,' + (y + 8) + 'px)';
    }

    document.addEventListener('pointermove', function (e) {
      if (e.pointerType !== 'mouse') return;
      x = e.clientX; y = e.clientY;
      var host = e.target.closest && e.target.closest('[data-cursor]');
      var inner = e.target.closest && e.target.closest('a, button, input, [role="button"]');
      // над кнопками внутри hero подпись не нужна
      var text = host && !(inner && host.contains(inner) && inner !== host) ? host.getAttribute('data-cursor') : '';
      if (text !== current) {
        current = text;
        label.textContent = text;
        label.classList.toggle('is-on', !!text);
      }
      if (!raf) raf = requestAnimationFrame(place);
    }, { passive: true });

    document.addEventListener('pointerleave', function () {
      current = '';
      label.classList.remove('is-on');
    });
  }

  root.KODA_UTIL = Object.assign(root.KODA_UTIL || {}, { initCursor: initCursor });
})(window);
