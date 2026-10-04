/* ==========================================================================
   render — отрисовка содержимого страниц из window.KODA (content.js).
   Роутер по <body data-page data-id>. Пути склеиваются с body[data-root]
   ("" в корне, "../" в подпапках). Все тексты проходят через typo().
   ========================================================================== */
(function (root) {
  'use strict';

  var U = root.KODA_UTIL;
  var K = root.KODA;

  /* --- Помощники ----------------------------------------------------------- */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function tx(s) { return esc(U.typo(s)); }
  function code(s, level) { return esc(U.codeify(s, level || 1)); }
  function base() { return document.body.getAttribute('data-root') || ''; }
  function url(p) { return /^(https?:|tel:|mailto:|#)/.test(p) ? p : base() + p; }
  function byId(list, id) { return list.filter(function (x) { return x.id === id; })[0]; }
  function navLabel(id) { return byId(K.nav, id).label; }

  var uid = 0;
  function pad(n) { return String(n).padStart(2, '0'); }

  // Заголовок раздела: код-подпись + h2 (codeify level 1, появляется по словам).
  // aria-label — нормальный текст.
  function heading(title, codeLine, cls) {
    var id = 'sec-' + (++uid);
    return {
      id: id,
      html: '<div class="section__head ' + (cls || '') + '">' +
        (codeLine ? '<p class="section__code micro" data-decode-text>' + code(codeLine) + '</p>' : '') +
        '<h2 id="' + id + '" aria-label="' + esc(title) + '" data-reveal="words">' + code(U.typo(title)) + '</h2></div>'
    };
  }
  // Секция: заголовок над содержимым
  function section(title, body, cls, codeLine) {
    var h = heading(title, codeLine);
    return '<section class="section container ' + (cls || '') + '" aria-labelledby="' + h.id + '">' + h.html + body + '</section>';
  }
  // Секция со своей раскладкой: inner(headHtml) сам решает, куда поставить заголовок
  function sectionWith(title, codeLine, cls, inner) {
    var h = heading(title, codeLine);
    return '<section class="section ' + (cls || '') + '" aria-labelledby="' + h.id + '">' + inner(h.html) + '</section>';
  }
  function paras(list) {
    return '<div class="text">' + [].concat(list).map(function (p) { return '<p>' + tx(p) + '</p>'; }).join('') + '</div>';
  }
  function btn(label, href, aria, level) {
    var l = U.codeify(label, level || 1);
    return '<a class="btn" href="' + url(href) + '" aria-label="' + esc(aria || label) + '" data-text="' + esc(l) + '">' + esc(l) + '</a>';
  }
  function linkBtn(label, href) {
    var l = U.codeify(label, 1);
    return '<a class="btn-link" href="' + url(href) + '" aria-label="' + esc(label) + '">[ <span data-scramble-target data-text="' + esc(l) + '">' + esc(l) + '</span> ]</a>';
  }
  function plusList(items) {
    return '<ul class="plus-list">' + items.map(function (x) { return '<li>' + tx(x) + '</li>'; }).join('') + '</ul>';
  }
  function lineTag(line) {
    return '<span class="tag tag--' + esc(line) + '"><span class="tag__dot" aria-hidden="true"></span>' + (line === 'violet' ? 'VIOLET' : 'SAGE') + '</span>';
  }
  function productTitle(p) { return p.type + ' «' + p.name + '»'; }
  function actions(html) { return '<div class="actions" data-reveal="fade">' + html + '</div>'; }

  // Облегчённые копии (assets/img/*-800, locations-small, specialists/*-800) для srcset
  function srcsetFor(src) {
    var m;
    if (src === 'assets/img/catalog/lineup.webp') return url('assets/img/catalog-small/lineup-1200.webp') + ' 1200w, ' + url(src) + ' 2400w';
    if ((m = /^assets\/img\/posters\/(.+)$/.exec(src))) return url('assets/img/posters-800/' + m[1]) + ' 800w, ' + url(src) + ' 1396w';
    if ((m = /^assets\/img\/locations\/(.+-diptych\.webp)$/.exec(src))) return url('assets/img/locations-small/' + m[1]) + ' 1200w, ' + url(src) + ' 2397w';
    if ((m = /^assets\/img\/locations\/(.+)$/.exec(src))) return url('assets/img/locations-small/' + m[1]) + ' 800w, ' + url(src) + ' 1600w';
    if ((m = /^(assets\/img\/specialists\/[a-z-]+)\.webp$/.exec(src))) return url(m[1] + '-800.webp') + ' 800w, ' + url(src) + ' 1600w';
    return '';
  }

  // Фото с проявлением из символов. opts: { eager, fallback, seed, extra, sizes }
  function media(src, alt, w, h, cls, opts) {
    opts = opts || {};
    var set = srcsetFor(src);
    return '<div class="media ' + (cls || '') + '" style="aspect-ratio:' + w + '/' + h + '">' +
      '<img src="' + url(src) + '" alt="' + esc(alt) + '" width="' + w + '" height="' + h + '"' +
      (set ? ' srcset="' + set + '" sizes="' + (opts.sizes || '(min-width: 1024px) 40vw, 90vw') + '"' : '') +
      (opts.eager ? '' : ' loading="lazy"') + ' decoding="async" data-decode' +
      (opts.fallback ? ' data-fallback="' + opts.fallback + '" data-seed="' + esc(opts.seed || '') + '"' : '') + '>' +
      (opts.extra || '') + '</div>';
  }
  // Кадр: засечки по углам, подпись-код под изображением
  function frame(mediaHtml, caption, attrs) {
    return '<figure class="frame"' + (attrs || '') + '>' + mediaHtml +
      '<span class="ticks" aria-hidden="true"></span>' +
      (caption ? '<figcaption class="caption">' + caption + '</figcaption>' : '') + '</figure>';
  }
  // Подпись-код: служебный код — codeify, имя/название — только верхний регистр (без замен букв)
  function capCode(codePart, name) {
    var text = U.codeify(codePart, 1) + (name ? ' — ' + U.typo(name).toUpperCase() : '');
    return '<span class="micro" data-decode-text>' + esc(text) + '</span>';
  }

  // Силуэты тары конфигуратора (линии --paper)
  var TARA = {
    mask: '<svg viewBox="0 0 120 120" aria-hidden="true"><rect x="22" y="44" width="76" height="12" rx="2"/><path d="M26 56h68v34c0 9-8 14-34 14S26 99 26 90z"/><path d="M40 74h40" opacity=".5"/></svg>',
    serum: '<svg viewBox="0 0 120 120" aria-hidden="true"><path d="M54 6h12v8c6 0 8 3 8 8v6H46v-6c0-5 2-8 8-8z"/><path d="M60 28v12"/><rect x="40" y="40" width="40" height="74" rx="3"/><path d="M48 70h24" opacity=".5"/></svg>',
    peeling: '<svg viewBox="0 0 120 120" aria-hidden="true"><path d="M36 10h48l-6 76H42z"/><rect x="46" y="86" width="28" height="22" rx="2"/><path d="M48 46h24" opacity=".5"/></svg>'
  };

  /* --- Каталог и товар ----------------------------------------------------- */
  function uniq(list) { return list.filter(function (x, i) { return list.indexOf(x) === i; }); }

  // «12 ФОРМУЛ», «3 ФОРМУЛЫ», «1 ФОРМУЛА»
  function formulas(n) {
    var m10 = n % 10, m100 = n % 100;
    var word = m10 === 1 && m100 !== 11 ? 'формула' : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? 'формулы' : 'формул';
    return U.codeify(n + ' ' + word, 1);
  }

  // Название на упаковке → карточка ингредиента (только среди ingredientIds товара)
  var ING_MATCH = {
    oat: /овс|ов[её]с/i, fig: /инжир/i, violet: /фиал/i, 'green-tea': /зел[её]н\S* ча/i,
    niacinamide: /ниацинамид/i, aloe: /алоэ/i, peptides: /пептид/i, caffeine: /кофеин/i,
    'grape-seed-oil': /виноградн/i, shea: /(^|\s)ши($|\s)/i, clay: /глин/i, papain: /папаин/i
  };
  function ingredientFor(name, p) {
    for (var i = 0; i < p.ingredientIds.length; i++) {
      var id = p.ingredientIds[i];
      if (ING_MATCH[id] && ING_MATCH[id].test(name)) return byId(K.ingredients, id);
    }
    return null;
  }

  // Тот же этап ухода, затем — общие ингредиенты
  function related(p) {
    return K.products
      .filter(function (q) { return q.id !== p.id; })
      .map(function (q, i) {
        var shared = q.ingredientIds.filter(function (x) { return p.ingredientIds.indexOf(x) >= 0; }).length;
        return { q: q, s: (q.step === p.step ? 10 : 0) + shared, i: i };
      })
      .sort(function (a, b) { return b.s - a.s || a.i - b.i; })
      .slice(0, 3)
      .map(function (x) { return x.q; });
  }

  // labelHtml — готовая разметка подписи, если в ней есть имя (имена без замен букв)
  function infoBlock(label, body, labelHtml) {
    var id = 'info-' + (++uid);
    return '<section class="product__block" aria-labelledby="' + id + '">' +
      '<h2 class="product__label micro" id="' + id + '" aria-label="' + esc(label) + '">' + (labelHtml || code(label)) + '</h2>' + body + '</section>';
  }

  // Правая колонка страницы товара (под h1)
  function productInfo(id) {
    var p = byId(K.products, id);
    if (!p) return '';
    var inci = '<ul class="plus-list inci">' + p.ingredients.map(function (name) {
      var g = ingredientFor(name, p);
      return '<li>' + (g
        ? '<a class="inci__link" href="' + url('ingredients.html#' + g.id) + '"><span>' + tx(name) + '</span> <span class="micro muted">ING/' + esc(g.n) + ' ↗</span></a>'
        : tx(name)) + '</li>';
    }).join('') + '</ul>';
    var find = U.codeify('Найти в лаборатории', 1);
    return '<p class="lead product__lead">' + tx(p.description) + '</p>' +
      '<div class="actions">' +
      '<button class="btn" type="button" data-lab-open aria-haspopup="dialog" aria-label="Найти в лаборатории" data-text="' + esc(find) + '">' + esc(find) + '</button>' +
      linkBtn('Собрать свою формулу', 'configurator.html') + '</div>' +
      infoBlock('Состав на упаковке', inci) +
      infoBlock('Как работает', '<p>' + tx(p.details) + '</p>') +
      infoBlock('Применение', '<p>' + tx(p.usage) + '</p>') +
      infoBlock('Шаг ритуала', '<p class="product__step"><span aria-hidden="true">' + code(p.step) + '</span><span class="sr-only">' + tx(p.step) + '</span></p>');
  }

  // Боковая панель: 5 лабораторий, живое время, часы работы, горячая линия
  function labDrawer(p) {
    var labs = K.stores.map(function (s) {
      return '<li class="lab-list__item">' +
        '<div class="lab-list__top"><a class="lab-list__city" href="' + url('stores/' + s.id + '.html') + '">' +
        '<span class="micro muted">LAB/' + esc(s.code) + '</span> <span>' + tx(s.city) + '</span> <span aria-hidden="true">→</span></a>' +
        '<time class="micro" data-clock="' + esc(s.timezone) + '">--:--:--</time></div>' +
        '<p class="micro muted">' + tx(K.contacts.hours) + '</p>' +
        (s.address ? '<address class="lab-list__addr">' + tx(s.address) + '</address>' : '') + '</li>';
    }).join('');
    return '<dialog class="help drawer" data-lab-drawer aria-labelledby="lab-title">' +
      '<div class="help__inner" tabindex="-1" autofocus>' +
      '<div class="help__head"><p class="micro" id="lab-title">' + code('Найти в лаборатории') + '</p>' +
      '<button class="nav-link" type="button" data-drawer-close aria-label="Закрыть панель">' + code('Закрыть') + ' ×</button></div>' +
      '<p class="lead">' + tx('Формулу можно протестировать и забрать в любой лаборатории Коды') + '</p>' +
      '<p class="micro muted drawer__product">FORM ' + esc(p.form) + ' — ' + esc(U.typo(productTitle(p)).toUpperCase()) + '</p>' +
      '<ul class="lab-list">' + labs + '</ul>' +
      '<p class="help__tel"><span class="micro muted">' + tx(K.contacts.hotline.label) + '</span> <a href="' + K.contacts.hotline.href + '">' + esc(K.contacts.hotline.value) + '</a></p>' +
      '</div></dialog>';
  }

  /* --- Ингредиенты: группы для фильтра ------------------------------------ */
  var ING_GROUPS = [
    { id: 'botany', label: 'Ботаника', ids: ['oat', 'fig', 'violet', 'green-tea', 'aloe'] },
    { id: 'actives', label: 'Активы', ids: ['niacinamide', 'peptides', 'caffeine', 'papain'] },
    { id: 'oils', label: 'Масла', ids: ['grape-seed-oil', 'shea'] },
    { id: 'minerals', label: 'Минералы', ids: ['clay'] }
  ];

  /* --- Магазины, специалисты: тексты с плакатов и падежи ------------------
     Даты и подписи — с плакатов poster-xray-spb, poster-rings-almaty,
     poster-rings-hours. Творительный падеж имён — для «С … можно:». */
  var OPENINGS = [
    { store: 'saint-petersburg', poster: 'poster-xray-spb', code: 'X-RAY/SPB', date: '27/07/2026', text: 'Новая лаборатория в Санкт-Петербурге' },
    { store: 'almaty', poster: 'poster-rings-almaty', code: 'RINGS/ALA', date: '01/09/2026', text: 'Новое пространство в Алматы' }
  ];
  var HOURS = { text: 'Собери свою формулу с нашим специалистом' };
  var SPEC_INSTR = { kristina: 'Кристиной', dmitry: 'Дмитрием', olesya: 'Олесей' };

  /* --- Главная ------------------------------------------------------------- */
  function homeWho() {
    var W = K.home.who;
    return sectionWith(W.title, '[01] K0DA', 'home-who', function (head) {
      return '<div class="container grid">' +
        '<div class="home-who__text">' + head + '<p class="lead">' + tx(W.text) + '</p>' +
        actions(linkBtn(navLabel('about'), 'about.html')) + '</div>' +
        '<div class="home-who__poster">' +
        frame(media('assets/img/posters/poster-xray-hand.webp', 'Плакат K0DA: рентгеновский снимок руки', 1396, 2000), capCode('X-RAY/01', 'K0DA beauty lab')) +
        '</div></div>';
    });
  }

  function homeConfigurator() {
    var C = K.home.configurator;
    var keys = Object.keys(K.configurator.productTypes);
    var h = heading(C.title, '[02] ' + navLabel('configurator'));
    var toggles = C.types.map(function (label, i) {
      return '<li><button class="code-toggle" type="button" data-tara="' + keys[i] + '" aria-pressed="' + (i === 0) + '">' +
        '<span class="micro">' + pad(i + 1) + '</span> <span data-scramble-target data-text="' + code(label) + '">' + code(label) + '</span></button></li>';
    }).join('');
    var tara = keys.map(function (k, i) {
      return '<figure class="tara' + (i === 0 ? ' is-active' : '') + '" data-tara-figure="' + k + '">' + TARA[k] +
        '<figcaption class="micro">' + code(K.configurator.productTypes[k].name) + '</figcaption></figure>';
    }).join('');
    return '<section class="code-screen home-config" aria-labelledby="' + h.id + '">' +
      '<canvas class="code-screen__field" data-code-field aria-hidden="true"></canvas>' +
      '<div class="code-screen__inner container">' + h.html +
      '<p class="code-screen__text" data-scroll-decode>' + tx(C.text) + '</p>' +
      '<div class="home-config__row">' +
      '<ul class="home-config__toggles">' + toggles + '</ul>' +
      '<div class="home-config__tara">' + tara + '</div></div>' +
      actions(btn(C.cta, 'configurator.html')) +
      '</div></section>';
  }

  function homeValues() {
    var items = K.brand.values.map(function (v, i) {
      var word = U.codeify(v.title, 2);
      return '<li class="values__item" data-hover-scramble>' +
        '<span class="micro muted">' + pad(i + 1) + '</span>' +
        '<h3 class="values__word" aria-label="' + esc(v.title) + '"><span data-scramble-target data-text="' + esc(word) + '">' + esc(word) + '</span></h3>' +
        '<p>' + tx(v.text) + '</p></li>';
    }).join('');
    return section(K.home.valuesTitle, '<ol class="values">' + items + '</ol>', 'home-values', '[03] VALUES');
  }

  function homeSpecialists() {
    var S = K.home.specialists;
    return sectionWith(navLabel('specialists'), '[04] S-01…S-03', 'home-spec', function (head) {
      var cards = K.specialists.map(function (s) {
        return '<li><a class="card" href="' + url('specialists/' + s.id + '.html') + '" aria-label="' + esc(s.name + ', ' + s.role) + '">' +
          frame(media(s.photo, s.name + ', ' + s.role.toLowerCase(), 600, 800, 'media--portrait', { fallback: 'portrait', seed: s.id, sizes: '(min-width: 1024px) 16vw, 30vw' }),
            capCode(s.code, s.name), ' data-cursor="VIEW"') + '</a></li>';
      }).join('');
      return '<div class="container grid">' +
        '<div class="home-spec__text">' + head + '<p class="lead">' + tx(S.text) + '</p>' + actions(linkBtn(S.cta, 'specialists.html')) + '</div>' +
        '<ul class="home-spec__list">' + cards + '</ul></div>';
    });
  }

  function productCard(p, eager) {
    var hot = '<span class="hotspot micro" aria-hidden="true">+ ' + esc(p.volume) + '</span>';
    return '<a class="card" href="' + url('catalog/' + p.id + '.html') + '" aria-label="' + esc(productTitle(p)) + '">' +
      frame(media(p.image + '-800.webp', productTitle(p) + ', ' + p.volume, 800, 1000, 'media--product', { eager: eager, extra: hot }),
        capCode('FORM ' + p.form, productTitle(p)) + lineTag(p.line), ' data-cursor="VIEW"') + '</a>';
  }

  function homeBestsellers() {
    var B = K.home.bestsellers;
    var cards = B.ids.map(function (id) {
      return '<li class="best__item">' + productCard(byId(K.products, id)) + '</li>';
    }).join('');
    return sectionWith(B.title, '[05] ' + navLabel('catalog') + ' — ' + B.ids.length + '/' + K.products.length, 'home-best', function (head) {
      return '<div class="container">' +
        '<div class="grid home-best__head">' + head + '<p class="home-best__text">' + tx(B.text) + '</p></div>' +
        '<ul class="best">' + cards + '</ul>' +
        actions(linkBtn(B.cta, 'catalog.html')) + '</div>';
    });
  }

  function homeStores() {
    var S = K.home.stores;
    var items = K.stores.map(function (s) {
      return '<li class="strip__item"><a class="card" href="' + url('stores/' + s.id + '.html') + '" aria-label="' + esc(s.city + ' — ' + s.tagline) + '">' +
        frame(media(s.diptych, s.city + ': пространство лаборатории K0DA', 2397, 1600),
          capCode('LAB/' + s.code, s.city) + '<time class="micro" data-clock="' + esc(s.timezone) + '">--:--:--</time>',
          ' data-cursor="VIEW"') + '</a></li>';
    }).join('');
    return sectionWith(S.title, '[06] LAB × ' + K.stores.length, 'home-stores', function (head) {
      return '<div class="container grid home-stores__head">' + head + '<p class="home-stores__text">' + tx(S.text) + '</p></div>' +
        '<div class="strip" data-strip>' +
        '<ul class="strip__track" data-strip-track tabindex="0" aria-label="' + esc(navLabel('stores')) + '">' + items + '</ul>' +
        '<div class="strip__bar container">' +
        '<div class="strip__nav"><button class="btn-icon" type="button" data-strip-prev aria-label="Предыдущая лаборатория">←</button>' +
        '<button class="btn-icon" type="button" data-strip-next aria-label="Следующая лаборатория">→</button></div>' +
        actions(linkBtn(S.cta, 'stores.html')) + '</div></div>';
    });
  }

  function homeIngredients() {
    var I = K.home.ingredients;
    function list(hidden) {
      return '<ul class="marquee__list"' + (hidden ? ' aria-hidden="true"' : '') + '>' + K.ingredients.map(function (g) {
        return '<li><a class="marquee__item" href="' + url('ingredients.html#' + g.id) + '"' + (hidden ? ' tabindex="-1"' : '') + ' aria-label="' + esc(g.title) + '">' +
          '<span class="marquee__img"><img src="' + url('assets/img/ingredients/' + g.id + '.svg') + '" alt="" width="600" height="800" loading="lazy" decoding="async"></span>' +
          '<span class="micro">ING/' + esc(g.n) + ' — ' + esc(g.title.toUpperCase()) + '</span></a></li>';
      }).join('') + '</ul>';
    }
    return sectionWith(navLabel('ingredients'), '[07] ING × ' + K.ingredients.length, 'home-ing', function (head) {
      return '<div class="container">' + head + '</div>' +
        '<div class="marquee"><div class="marquee__track">' + list(false) + list(true) + '</div></div>' +
        '<div class="container grid home-ing__foot"><p class="lead">' + tx(I.text) + '</p>' + actions(linkBtn(I.cta, 'ingredients.html')) + '</div>';
    });
  }

  function homeEco() {
    var E = K.home.eco;
    return sectionWith(E.title, '[08] ' + K.refill.title, 'home-eco', function (head) {
      return '<div class="container grid">' +
        '<div class="home-eco__poster">' +
        frame(media('assets/img/posters/poster-rings-logo.webp', 'Плакат K0DA: годичные кольца среза дерева', 1396, 2000), capCode('RINGS/01', E.title)) +
        '</div><div class="home-eco__text">' + head + paras(E.text) + actions(linkBtn(E.cta, 'refill.html')) + '</div></div>';
    });
  }

  // Поведение секций главной: переключатели тары, лента лабораторий, бинарное поле
  function bindHome(mount) {
    var toggles = mount.querySelectorAll('[data-tara]');
    function activate(key) {
      Array.prototype.forEach.call(toggles, function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-tara') === key)); });
      Array.prototype.forEach.call(mount.querySelectorAll('[data-tara-figure]'), function (f) {
        f.classList.toggle('is-active', f.getAttribute('data-tara-figure') === key);
      });
    }
    Array.prototype.forEach.call(toggles, function (b) {
      var key = b.getAttribute('data-tara');
      b.addEventListener('pointerenter', function () { activate(key); });
      b.addEventListener('focus', function () { activate(key); });
      b.addEventListener('click', function () { activate(key); });
      U.bindHoverScramble(b);
    });

    var track = mount.querySelector('[data-strip-track]');
    if (track) {
      var step = function (dir) {
        var item = track.querySelector('.strip__item');
        var gap = parseFloat(getComputedStyle(track).columnGap) || 0;
        track.scrollBy({ left: dir * (item.getBoundingClientRect().width + gap), behavior: U.reducedMotion() ? 'auto' : 'smooth' });
      };
      mount.querySelector('[data-strip-prev]').addEventListener('click', function () { step(-1); });
      mount.querySelector('[data-strip-next]').addEventListener('click', function () { step(1); });
    }

  }

  /* --- Страницы ------------------------------------------------------------ */
  var pages = {
    home: function () {
      return homeWho() + homeConfigurator() + homeValues() + homeSpecialists() +
        homeBestsellers() + homeStores() + homeIngredients() + homeEco();
    },

    about: function () {
      var A = K.about;
      // горизонтальные рентген-плакаты между блоками (параллакс ±40px)
      var POSTERS = [
        { src: 'assets/img/posters/poster-xray-configurator.webp', alt: 'Плакат K0DA: рентгеновский снимок шеи', code: 'X-RAY/02' },
        { src: 'assets/img/posters/poster-xray-spb.webp', alt: 'Плакат K0DA: рентгеновский снимок позвоночника', code: 'X-RAY/03' },
        { src: 'assets/img/posters/poster-xray-hand.webp', alt: 'Плакат K0DA: рентгеновский снимок руки', code: 'X-RAY/01' }
      ];
      var after = { 0: 0, 2: 1, 3: 2 }; // после какого блока какой плакат
      function band(pst) {
        return '<figure class="frame band" data-parallax>' +
          '<div class="media band__media"><img src="' + url(pst.src) + '" alt="' + esc(pst.alt) + '" width="1396" height="2000" loading="lazy" decoding="async" data-decode></div>' +
          '<span class="ticks" aria-hidden="true"></span>' +
          '<figcaption class="caption">' + capCode(pst.code, 'K0DA beauty lab') + '</figcaption></figure>';
      }
      var blocks = A.blocks.map(function (b, i) {
        var id = 'about-' + (++uid);
        return '<section class="row-2 about-block" aria-labelledby="' + id + '">' +
          '<p class="micro muted" data-decode-text>' + pad(i + 1) + '</p>' +
          '<h2 class="about-block__title" id="' + id + '" aria-label="' + esc(b.title) + '" data-reveal="words">' + code(U.typo(b.title)) + '</h2>' +
          paras(b.text) + '</section>' + (after[i] != null ? band(POSTERS[after[i]]) : '');
      }).join('');
      var uniq = A.uniqueness.map(function (u, i) {
        return '<li><span class="micro muted" data-decode-text>U-' + pad(i + 1) + '</span><p>' + tx(u) + '</p></li>';
      }).join('');
      var sl = heading('Слоганы', '[S] ' + K.brand.wordmark + ' × ' + K.brand.slogans.length);
      var sloganList = K.brand.slogans.map(function (s) {
        return '<li data-slogan="' + esc(U.codeify(U.typo(s), 2)) + '">' + tx(s) + '</li>';
      }).join('');
      return '<div class="container page-lead"><p class="about-lead" data-reveal="fade">' + tx(A.lead) + '</p></div>' +
        '<div class="container about-blocks">' + blocks + '</div>' +
        section('Уникальность', '<ul class="code-list">' + uniq + '</ul>', 'about-uniq', 'U-01…U-' + pad(A.uniqueness.length)) +
        '<section class="code-screen about-slogans" aria-labelledby="' + sl.id + '">' +
        '<canvas class="code-screen__field" data-code-field aria-hidden="true"></canvas>' +
        '<div class="code-screen__inner container">' + sl.html.replace('<h2 ', '<h2 class="sr-only" ') +
        '<ul class="sr-only">' + sloganList + '</ul>' +
        '<p class="slogan-screen" data-slogan-screen aria-hidden="true"></p>' +
        '</div></section>' +
        '<div class="container about-mood">' +
        frame(media('assets/img/moodboard/moodboard.webp', 'Мудборд K0DA: материалы, текстуры, свет', 1280, 720), capCode('MOODBOARD', 'K0DA')) +
        '</div>';
    },

    catalog: function () {
      var steps = uniq(K.products.map(function (p) { return p.step; }));
      function toggle(group, value, label, aria, pressed, extra) {
        return '<button class="code-toggle" type="button" data-filter="' + group + '" data-value="' + esc(value) + '" aria-pressed="' + pressed + '"' +
          (aria ? ' aria-label="' + esc(aria) + '"' : '') + '>' + (extra || '') + '<span data-scramble-target data-text="' + esc(label) + '">' + esc(label) + '</span></button>';
      }
      var all = U.codeify('Все', 1);
      var stepBtns = toggle('step', 'all', all, 'Все этапы', true) + steps.map(function (s) {
        return toggle('step', s, U.codeify(s, 1), s, false);
      }).join('');
      var lineBtns = toggle('line', 'all', all, 'Все линии', true) +
        ['sage', 'violet'].map(function (l) {
          return toggle('line', l, l.toUpperCase(), 'Линия ' + l, false, '<span class="tag tag--' + l + '"><span class="tag__dot" aria-hidden="true"></span></span>');
        }).join('');
      var items = K.products.map(function (p) {
        return '<li class="cat-item" data-id="' + esc(p.id) + '" data-step="' + esc(p.step) + '" data-line="' + esc(p.line) + '" data-cutout="' + url(p.image + '-cutout.webp') + '">' +
          '<a class="cat-item__link" href="' + url('catalog/' + p.id + '.html') + '" aria-label="' + esc(productTitle(p) + ', ' + p.volume) + '">' +
          '<span class="cat-item__figure frame" data-cursor="VIEW">' + media(p.image + '-800.webp', productTitle(p), 800, 1000, 'media--product') +
          '<span class="ticks" aria-hidden="true"></span></span>' +
          '<span class="cat-item__form micro">FORM ' + esc(p.form) + '</span>' +
          '<span class="cat-item__title"><span class="cat-item__type">' + tx(p.type) + '</span> <span class="cat-item__name">«' + tx(p.name) + '»</span></span>' +
          '<span class="cat-item__inci"><span>' + tx(p.ingredients.join(' · ')) + '</span></span>' +
          '<span class="cat-item__vol micro">' + tx(p.volume) + '</span>' +
          '<span class="cat-item__tag">' + lineTag(p.line) + '</span>' +
          '<span class="cat-item__arrow" aria-hidden="true">→</span>' +
          '</a></li>';
      }).join('');
      return '<div class="container cat-banner">' +
        frame(media('assets/img/catalog/lineup.webp', 'Вся линейка K0DA: ' + K.products.length + ' продуктов', 2400, 1596, '', { eager: true, sizes: '100vw' }),
          capCode('LINEUP/' + K.products.length, 'K0DA')) + '</div>' +
        '<div class="cat-bar" data-cat-bar><div class="container cat-bar__inner">' +
        '<p class="cat-bar__count micro" data-cat-count aria-live="polite">' + esc(formulas(K.products.length)) + '</p>' +
        '<div class="cat-bar__filters">' +
        '<div class="cat-filter" role="group" aria-label="Этап ухода">' + stepBtns + '</div>' +
        '<div class="cat-filter" role="group" aria-label="Линия">' + lineBtns + '</div></div>' +
        '<div class="cat-view" role="group" aria-label="Вид каталога">' +
        '<button class="code-toggle" type="button" data-view="grid" aria-pressed="true"><span data-scramble-target data-text="GRID">GRID</span></button>' +
        '<span class="micro muted" aria-hidden="true">/</span>' +
        '<button class="code-toggle" type="button" data-view="list" aria-pressed="false"><span data-scramble-target data-text="LIST">LIST</span></button>' +
        '</div></div></div>' +
        '<div class="container cat-wrap">' +
        '<div class="cat-head micro" aria-hidden="true"><span>FORM</span><span>' + code('Название') + '</span><span>' + code('Тип') + '</span><span>' + code('Состав') + '</span><span>' + code('Объём') + '</span><span></span></div>' +
        '<ul class="catalog" data-catalog data-view="grid">' + items + '</ul>' +
        '<div class="cat-empty" data-cat-empty hidden><p class="micro">' + esc(formulas(0)) + '</p>' +
        '<button class="btn-link" type="button" data-cat-reset>[ <span data-scramble-target data-text="' + code('Сбросить фильтры') + '">' + code('Сбросить фильтры') + '</span> ]</button></div>' +
        '</div>';
    },

    // Под hero товара: «Из того же ритуала», соседние формулы, панель лабораторий
    product: function (id) {
      var p = byId(K.products, id);
      if (!p) return '';
      var i = K.products.indexOf(p), n = K.products.length;
      var prev = K.products[(i - 1 + n) % n], next = K.products[(i + 1) % n];
      var rel = related(p).map(function (q) { return '<li>' + productCard(q) + '</li>'; }).join('');
      function pagerLink(q, rel, label) {
        return '<a class="pager__link pager__link--' + rel + '" href="' + url('catalog/' + q.id + '.html') + '" rel="' + rel + '" data-hover-scramble>' +
          '<span class="micro" data-scramble-target data-text="' + esc(label) + '">' + esc(label) + '</span>' +
          '<span class="pager__name">FORM ' + esc(q.form) + ' — ' + tx(productTitle(q)) + '</span></a>';
      }
      return section('Из того же ритуала', '<ul class="related">' + rel + '</ul>', 'product-related', 'RITUAL/' + p.step) +
        '<nav class="pager container" aria-label="Другие формулы">' +
        pagerLink(prev, 'prev', '← ' + U.codeify('Предыдущая формула', 1)) +
        pagerLink(next, 'next', U.codeify('Следующая', 1) + ' →') + '</nav>' +
        labDrawer(p);
    },

    // конфигуратор целиком строит assets/js/configurator.js в разметке из генератора
    configurator: function () { return ''; },

    stores: function () {
      var I = K.storesIntro;
      var rows = K.stores.map(function (s, i) {
        return '<li><a class="city-row" href="' + url('stores/' + s.id + '.html') + '" data-preview="' + url(s.images[0]) + '" aria-label="' + esc(s.city + ' — ' + s.tagline) + '">' +
          '<span class="city-row__code micro">' + esc(s.code) + '</span>' +
          '<span class="city-row__city">' + esc(s.city.toUpperCase()) + '</span>' +
          '<span class="city-row__tag">— ' + tx(s.tagline) + '</span>' +
          '<time class="city-row__time micro" data-clock="' + esc(s.timezone) + '">--:--:--</time>' +
          '<span class="city-row__arrow" aria-hidden="true">→</span></a></li>';
      }).join('');
      var openings = OPENINGS.map(function (o) {
        var s = byId(K.stores, o.store);
        return '<li class="opening">' +
          frame(media('assets/img/posters/' + o.poster + '.webp', 'Плакат K0DA: ' + o.text.toLowerCase(), 1396, 2000), capCode(o.code, o.date)) +
          '<p class="opening__date micro" data-decode-text>' + esc(o.date) + '</p>' +
          '<p class="opening__text lead">' + tx(o.text) + '</p>' +
          '<a class="btn-link" href="' + url('stores/' + s.id + '.html') + '" aria-label="' + esc(s.city) + '">[ <span data-scramble-target data-text="' + esc('LAB/' + s.code) + '">' + esc('LAB/' + s.code) + '</span> → ]</a></li>';
      }).join('');
      return '<div class="container page-lead"><p class="lead">' + tx(I.title) + '</p>' + paras(I.text) + '</div>' +
        section('Лаборатории', '<ul class="city-list" data-city-list>' + rows + '</ul>', 'stores-list', U.codeify(K.stores.length + ' лабораторий', 1)) +
        section('Открытия', '<ul class="openings">' + openings + '</ul>', 'stores-open', 'NEW/' + OPENINGS.length) +
        sectionWith(HOURS.text, 'RINGS/' + K.contacts.hours, 'stores-hours', function (head) {
          return '<div class="container grid">' +
            '<div class="stores-hours__poster">' + frame(media('assets/img/posters/poster-rings-hours.webp', 'Плакат K0DA: годичные кольца', 1396, 2000), capCode('RINGS/02', 'K0DA')) + '</div>' +
            '<div class="stores-hours__text">' + head +
            '<p class="lead">' + tx(K.contacts.hours) + '</p>' +
            '<p class="micro muted">' + tx(K.contacts.booking.label) + '</p>' +
            '<p class="stores-hours__tel"><a href="' + K.contacts.booking.href + '">' + esc(K.contacts.booking.value) + '</a></p>' +
            actions(linkBtn(navLabel('specialists'), 'specialists.html')) + '</div></div>';
        });
    },

    store: function (id) {
      var s = byId(K.stores, id);
      if (!s) return '';
      var i = K.stores.indexOf(s), n = K.stores.length;
      var prev = K.stores[(i - 1 + n) % n], next = K.stores[(i + 1) % n];
      var gallery = s.images.map(function (src, k) {
        return '<li>' + frame(media(src, s.city + ': лаборатория K0DA, кадр ' + (k + 1), 1600, 2149), capCode('LAB/' + s.code + '/0' + (k + 1))) + '</li>';
      }).join('');
      var contacts = '<ul class="code-list">' +
        '<li><span class="micro muted">' + esc(s.code) + '</span><span>' + tx(K.contacts.hours) + '</span><time class="micro" data-clock="' + esc(s.timezone) + '">--:--:--</time></li>' +
        (s.address ? '<li><span class="micro muted">' + code('Адрес') + '</span><address>' + tx(s.address) + '</address></li>' : '') +
        '<li><span class="micro muted">TEL</span><span>' + tx(K.contacts.hotline.label) + '</span><a href="' + K.contacts.hotline.href + '">' + esc(K.contacts.hotline.value) + '</a></li>' +
        '<li><span class="micro muted">TEL</span><span>' + tx(K.contacts.booking.label) + '</span><a href="' + K.contacts.booking.href + '">' + esc(K.contacts.booking.value) + '</a></li>' +
        '</ul>';
      return '<div class="container city-text">' + paras(s.text) + '</div>' +
        section('Здесь можно:', plusList(s.can), 'city-can', 'LAB/' + s.code) +
        '<div class="container"><ul class="city-gallery">' + gallery + '</ul></div>' +
        section('Контакты', contacts, 'city-contacts', 'LAB/' + s.code + ' — ' + K.contacts.hours) +
        '<nav class="pager container" aria-label="Другие лаборатории">' +
        neighbor(prev, 'prev', '← ' + prev.city.toUpperCase()) + neighbor(next, 'next', next.city.toUpperCase() + ' →') + '</nav>';
    },

    specialists: function () {
      var I = K.specialistsIntro;
      var cards = K.specialists.map(function (s) {
        return '<li class="spec-card">' +
          '<a class="card" href="' + url('specialists/' + s.id + '.html') + '" tabindex="-1" aria-hidden="true">' +
          frame(media(s.photo, s.name + ', ' + s.role.toLowerCase(), 600, 800, 'media--portrait', { fallback: 'portrait', seed: s.id }),
            capCode(s.code, s.name), ' data-cursor="VIEW"') + '</a>' +
          '<h2 class="spec-card__name">' + tx(s.name) + '</h2>' +
          '<p class="micro muted">' + tx(s.role) + '</p>' +
          '<p class="spec-card__text">' + tx(s.text) + '</p>' +
          '<a class="btn-link" href="' + url('specialists/' + s.id + '.html') + '" aria-label="' + esc('Подробнее: ' + s.name) + '">[ <span data-scramble-target data-text="' + code('Подробнее') + '">' + code('Подробнее') + '</span> ]</a>' +
          '</li>';
      }).join('');
      return '<div class="container page-lead"><p class="lead">' + tx(I.title) + '</p>' + paras(I.text) + '</div>' +
        '<div class="container"><ul class="spec-list">' + cards + '</ul></div>';
    },

    // Под hero специалиста: соседние специалисты
    specialist: function (id) {
      var s = byId(K.specialists, id);
      if (!s) return '';
      var i = K.specialists.indexOf(s), n = K.specialists.length;
      var prev = K.specialists[(i - 1 + n) % n], next = K.specialists[(i + 1) % n];
      function link(q, rel, label) {
        return '<a class="pager__link pager__link--' + rel + '" href="' + url('specialists/' + q.id + '.html') + '" rel="' + rel + '" data-hover-scramble>' +
          '<span class="micro" data-scramble-target data-text="' + esc(label) + '">' + esc(label) + '</span>' +
          '<span class="pager__name">' + esc(q.code) + ' — ' + tx(q.name) + ', ' + tx(q.role.toLowerCase()) + '</span></a>';
      }
      return '<nav class="pager container" aria-label="Другие специалисты">' +
        link(prev, 'prev', '← ' + prev.code) + link(next, 'next', next.code + ' →') + '</nav>';
    },

    refill: function () {
      var R = K.refill;
      function branch(B, href, n) {
        return '<li><a class="branch" href="' + url(href) + '" data-hover-scramble aria-label="' + esc(B.title) + '">' +
          '<span class="micro muted">' + pad(n) + ' / ' + B.steps.length + ' ' + code('шага') + '</span>' +
          '<span class="branch__title" data-scramble-target data-text="' + code(B.title) + '">' + code(B.title) + '</span>' +
          '<span class="branch__text">' + tx(B.text) + '</span>' +
          '<span class="branch__arrow" aria-hidden="true">→</span></a></li>';
      }
      return '<div class="container page-lead">' + paras(R.intro) + '</div>' +
        '<div class="container"><ul class="branches">' + branch(R.return, 'refill/return.html', 1) + branch(R.refill, 'refill/refill.html', 2) + '</ul></div>' +
        section(R.outro.title, paras(R.outro.text), 'refill-outro', 'CYCLE/' + K.stores.length);
    },

    'refill-return': function () { return refillSub(K.refill.return, K.refill.refill, 'refill/refill.html'); },
    'refill-refill': function () { return refillSub(K.refill.refill, K.refill.return, 'refill/return.html'); },

    ingredients: function () {
      var all = U.codeify('Все', 1);
      function toggle(value, label, aria, pressed) {
        return '<button class="code-toggle" type="button" data-ing-filter="' + value + '" aria-pressed="' + pressed + '" aria-label="' + esc(aria) + '">' +
          '<span data-scramble-target data-text="' + esc(label) + '">' + esc(label) + '</span></button>';
      }
      var filters = toggle('all', all, 'Все ингредиенты', true) + ING_GROUPS.map(function (g) {
        return toggle(g.id, U.codeify(g.label, 1), g.label, false);
      }).join('');

      var cards = K.ingredients.map(function (g) {
        var title = U.codeify(g.title, 1);
        var group = ING_GROUPS.filter(function (x) { return x.ids.indexOf(g.id) >= 0; })[0];
        var products = g.products.map(function (pid) {
          var p = byId(K.products, pid);
          if (!p) return '';
          return '<li><a class="ing__product" href="' + url('catalog/' + p.id + '.html') + '" tabindex="-1" aria-label="' + esc('FORM ' + p.form + ' — ' + productTitle(p)) + '" title="' + esc(productTitle(p)) + '">' +
            '<img src="' + url(p.image + '-cutout.webp') + '" alt="" width="509" height="1560" loading="lazy" decoding="async"></a></li>';
        }).join('');
        return '<li class="ing" id="' + esc(g.id) + '" data-group="' + (group ? group.id : '') + '">' +
          '<div class="ing__card">' +
          // Лицевая сторона: вся карточка — кнопка-переключатель
          '<div class="ing__face ing__front" role="button" tabindex="0" aria-pressed="false" aria-controls="' + esc(g.id) + '-back" aria-label="' + esc(g.title + '. Перевернуть карточку') + '">' +
          '<span class="ing__flip" aria-hidden="true">↻</span>' +
          '<div class="ing__text"><span class="micro">' + esc(g.n) + '</span>' +
          '<h2 class="ing__title" data-text="' + esc(title) + '">' + esc(title) + '</h2>' +
          '<p class="ing__texture micro">' + tx(g.texture) + '</p></div>' +
          '<img class="ing__img" src="' + url('assets/img/ingredients/' + g.id + '.svg') + '" alt="" width="600" height="800" loading="lazy" decoding="async">' +
          '</div>' +
          // Оборот: описание, текстура, продукты с этим ингредиентом
          '<div class="ing__face ing__back" id="' + esc(g.id) + '-back" role="group" aria-label="' + esc(g.title) + '">' +
          '<p class="ing__code micro" data-text="' + esc('ING/' + g.n + ' — ' + g.title.toUpperCase()) + '">' + esc('ING/' + g.n + ' — ' + g.title.toUpperCase()) + '</p>' +
          '<p class="ing__desc">' + tx(g.back) + '</p>' +
          '<p class="micro"><span class="muted">' + code('Текстура') + ':</span> ' + tx(g.texture) + '</p>' +
          '<p class="micro muted">' + code('В формулах') + ':</p>' +
          '<ul class="ing__products">' + products + '</ul>' +
          '<button class="btn-link ing__back-btn" type="button" tabindex="-1" aria-pressed="true" aria-label="' + esc(g.title + '. Вернуть лицевую сторону') + '">[ ↻ <span data-scramble-target data-text="' + code('Перевернуть') + '">' + code('Перевернуть') + '</span> ]</button>' +
          '</div></div></li>';
      }).join('');

      return '<div class="container page-lead"><p class="lead">' + tx(K.home.ingredients.text) + '</p></div>' +
        '<div class="ing-bar"><div class="container ing-bar__inner">' +
        '<p class="micro ing-bar__count" data-ing-count aria-live="polite">' + K.ingredients.length + '/' + K.ingredients.length + '</p>' +
        '<div class="cat-filter" role="group" aria-label="Группы ингредиентов">' + filters + '</div></div></div>' +
        '<div class="container ing-wrap"><ul class="ing-grid" data-ing-grid>' + cards + '</ul></div>';
    },

    'not-found': function () { return ''; }
  };

  // Ветка рефила: шаги вертикальной шкалой, номер «перебирается» от 00, линия прорисовывается по скроллу
  function refillSub(R, other, otherHref) {
    var steps = R.steps.map(function (s) {
      return '<li class="step"><span class="step__n" data-count="' + esc(s.n) + '" aria-hidden="true">' + esc(s.n) + '</span>' +
        '<div class="step__body"><h2 class="step__title" aria-label="' + esc(s.n + '. ' + s.title) + '">' + code(s.title) + '</h2>' +
        '<p>' + tx(s.text) + '</p></div></li>';
    }).join('');
    return '<div class="container page-lead"><p class="lead">' + tx(R.text) + '</p></div>' +
      '<div class="container"><div class="steps" data-steps>' +
      '<svg class="steps__line" viewBox="0 0 2 100" preserveAspectRatio="none" aria-hidden="true"><line x1="1" y1="0" x2="1" y2="100" pathLength="1"/></svg>' +
      '<ol class="steps__list">' + steps + '</ol></div>' +
      (R.note ? '<p class="lead page-note">' + tx(R.note) + '</p>' : '') +
      actions(btn('Найти ближайшую лабораторию', 'stores.html') + linkBtn(other.title, otherHref)) + '</div>';
  }

  function neighbor(s, rel, label) {
    return '<a class="pager__link pager__link--' + rel + '" href="' + url('stores/' + s.id + '.html') + '" rel="' + rel + '" data-hover-scramble>' +
      '<span class="micro" data-scramble-target data-text="' + esc(label) + '">' + esc(label) + '</span>' +
      '<span class="pager__name">LAB/' + esc(s.code) + ' — ' + tx(s.tagline) + '</span></a>';
  }

  // Правая колонка специалиста (под h1)
  function specialistInfo(id) {
    var s = byId(K.specialists, id);
    if (!s) return '';
    var instr = SPEC_INSTR[s.id] || s.name;
    var withName = 'С ' + instr + ' можно:';
    // имя без цифровых замен, служебные слова — кодом; предлог «С» привязан к имени, как в typo()
    var withNameHtml = code('С') + '\u00A0' + esc(instr.toUpperCase()) + ' ' + code('можно:');
    var book = U.codeify('Записаться на консультацию', 1);
    return '<p class="lead product__lead">' + tx(s.text) + '</p>' +
      '<div class="actions">' +
      '<a class="btn" href="' + K.contacts.booking.href + '" aria-label="Записаться на консультацию: ' + esc(K.contacts.booking.value) + '" data-text="' + esc(book) + '">' + esc(book) + '</a>' +
      linkBtn('Собрать формулу', 'configurator.html') + '</div>' +
      '<p class="micro muted spec-booking">' + tx(K.contacts.booking.label) + ': <a href="' + K.contacts.booking.href + '">' + esc(K.contacts.booking.value) + '</a></p>' +
      infoBlock(withName, plusList(s.can), withNameHtml);
  }

  /* --- Доступные имена (WCAG 2.5.3) ----------------------------------------
     Видимый текст ссылок и кнопок часто «закодирован» (КАТАЛ0Г), а нормальное
     имя лежит в aria-label (Каталог). Такое расхождение мешает голосовому
     управлению. Решение: видимое оформление прячем от скринридера, нормальный
     текст кладём рядом невидимым, aria-label убираем. Иконки без букв не трогаем. */
  function norm(t) { return String(t || '').replace(/[\s\u00A0]+/g, ' ').trim().toLowerCase(); }
  function fixLabels(scope) {
    var els = (scope || document).querySelectorAll('a[aria-label], button[aria-label], [role="button"][aria-label]');
    Array.prototype.forEach.call(els, function (el) {
      if (el.hasAttribute('data-label-fixed')) return;
      var label = el.getAttribute('aria-label');
      var visible = norm(el.textContent);
      if (!/[a-zа-яё0-9]/i.test(visible) || norm(label).indexOf(visible) >= 0) return;
      var block = el.querySelector('div, figure, ul, ol, p, h2, h3');
      var wrap = document.createElement(block ? 'div' : 'span');
      wrap.className = 'vis-label';
      wrap.setAttribute('aria-hidden', 'true');
      // перебор символов идёт по видимой части
      if (!el.querySelector('[data-scramble-target]') && el.hasAttribute('data-text')) {
        wrap.setAttribute('data-scramble-target', '');
        wrap.setAttribute('data-text', el.getAttribute('data-text'));
        el.removeAttribute('data-text');
      }
      while (el.firstChild) wrap.appendChild(el.firstChild);
      el.appendChild(wrap);
      var sr = document.createElement('span');
      sr.className = 'sr-only';
      sr.textContent = label;
      el.appendChild(sr);
      el.removeAttribute('aria-label');
      el.setAttribute('data-label-fixed', '');
    });
  }

  function renderPage() {
    var mount = document.querySelector('[data-render]');
    if (!mount || !K) return;
    var page = document.body.getAttribute('data-page');
    var fn = pages[page];
    if (fn) mount.innerHTML = fn(document.body.getAttribute('data-id'));
    if (page === 'home') bindHome(mount);
    var info = document.querySelector('[data-render-info]');
    if (info && page === 'product') info.innerHTML = productInfo(document.body.getAttribute('data-id'));
    if (info && page === 'specialist') info.innerHTML = specialistInfo(document.body.getAttribute('data-id'));
  }

  root.KODA_UTIL = Object.assign(root.KODA_UTIL || {}, {
    renderPage: renderPage,
    fixLabels: fixLabels,
    render: { esc: esc, tx: tx, code: code, url: url, byId: byId, section: section, sectionWith: sectionWith, heading: heading, btn: btn, linkBtn: linkBtn, lineTag: lineTag, media: media, frame: frame, capCode: capCode, productCard: productCard, paras: paras, actions: actions, formulas: formulas, TARA: TARA }
  });
})(window);
