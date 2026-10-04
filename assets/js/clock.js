/* ==========================================================================
   clock — живые часы лабораторий. Любой элемент [data-clock="<IANA timezone>"]
   показывает текущее время этого пояса (ЧЧ:ММ:СС). Один таймер на страницу,
   выровнен по границе секунды; на скрытой вкладке не тикает.
   ========================================================================== */
(function (root) {
  'use strict';

  var formatters = {};
  var timer = 0;

  function fmt(tz) {
    if (!formatters[tz]) {
      try {
        formatters[tz] = new Intl.DateTimeFormat('ru-RU', {
          timeZone: tz, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
        });
      } catch (e) {
        formatters[tz] = new Intl.DateTimeFormat('ru-RU', {
          hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
        });
      }
    }
    return formatters[tz];
  }

  function tick() {
    var now = new Date();
    var nodes = document.querySelectorAll('[data-clock]');
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var value = fmt(el.getAttribute('data-clock')).format(now);
      if (el.textContent !== value) el.textContent = value;
      if (el.tagName === 'TIME') el.setAttribute('datetime', value);
    }
  }

  function schedule() {
    clearTimeout(timer);
    if (document.hidden) return;
    tick();
    timer = setTimeout(schedule, 1000 - (Date.now() % 1000) + 5);
  }

  function initClock() {
    schedule();
    document.addEventListener('visibilitychange', schedule);
  }

  root.KODA_UTIL = Object.assign(root.KODA_UTIL || {}, { initClock: initClock, tickClock: tick });
})(window);
