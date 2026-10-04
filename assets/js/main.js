/* ==========================================================================
   main — точка входа.
   1) контент страницы и «тихие» модули (часы, бегущая строка, курсор, переходы);
   2) интро: прелоадер при первом входе или рассеивание шума после перехода;
   3) после интро — входные анимации: меню, hero, заголовки, фото.
   Ошибка одного модуля не ломает остальные.
   ========================================================================== */
(function (root) {
  'use strict';

  var U = root.KODA_UTIL || {};

  function run(name) {
    try {
      if (typeof U[name] === 'function') return U[name]();
    } catch (e) {
      if (root.console) console.error('[K0DA] ' + name + ':', e);
    }
  }

  function start() {
    document.documentElement.classList.add('js');
    run('renderPage');
    run('fixLabels');
    run('initCatalog');
    run('initProduct');
    run('initClock');
    run('initTicker');
    run('initCursor');
    run('initTransitions');

    var intro = run('runIntro');
    if (!intro || typeof intro.then !== 'function') intro = Promise.resolve();
    intro.then(function () {
      run('initNav');
      run('initHero');
      run('initReveal');
      run('initDecodeImages');
      run('initIngredients');
      run('initSections');
      run('initConfigurator');
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})(window);
