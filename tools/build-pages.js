#!/usr/bin/env node
/* ==========================================================================
   build-pages.js — генератор HTML-оболочек сайта K0DA.
   Запуск вручную из корня проекта:  node tools/build-pages.js
   Берёт данные из assets/data/content.js, пишет 31 страницу со статичными
   <head>, шапкой, hero-строкой с h1 и подвалом. Остальное содержимое
   страниц рисует assets/js/render.js в браузере. В рантайме не нужен.
   ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const { typo } = require(path.join(ROOT, 'assets/js/typo.js'));
const { codeify } = require(path.join(ROOT, 'assets/js/codeify.js'));

/* --- Данные ---------------------------------------------------------------- */
const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'assets/data/content.js'), 'utf8'), sandbox);
const K = sandbox.window.KODA;
if (!K) throw new Error('content.js не определил window.KODA');

const SITE_NAME = 'KODA';
const OG_IMAGE = 'assets/img/catalog/lineup.webp';
const FONT_URL = 'https://fonts.googleapis.com/css2?family=Fira+Code:wght@300..700&display=swap';
const CSS = ['tokens', 'base', 'components', 'pages', 'configurator'];
const JS = [
  'data/content.js',
  'js/typo.js', 'js/codeify.js', 'js/scramble.js',
  'js/ascii-engine.js', 'js/decode-image.js',
  'js/render.js', 'js/catalog.js', 'js/ingredients.js', 'js/sections.js', 'js/lab-scene.js', 'js/configurator.js', 'js/nav.js', 'js/reveal.js', 'js/cursor.js',
  'js/ticker.js', 'js/clock.js', 'js/transitions.js', 'js/main.js'
];

/* --- Помощники ------------------------------------------------------------- */
const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const t = (s) => esc(typo(s));               // текст из content.js → типограф → HTML
const c = (s, level) => esc(codeify(s, level)); // код-подпись
const navItem = (id) => K.nav.find((n) => n.id === id);
const sectionNo = (id) => String(K.nav.findIndex((n) => n.id === id) + 1).padStart(2, '0');

function clip(str, max = 160) {
  const s = String(str).replace(/\s+/g, ' ').trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  return cut.slice(0, cut.lastIndexOf(' ')).replace(/[,;:—–-]$/, '').trim() + '…';
}

function svgInline(file, attrs) {
  return fs.readFileSync(path.join(ROOT, file), 'utf8')
    .trim()
    .replace(/^<svg /, `<svg ${attrs} `);
}
const SIGN = svgInline('assets/img/brand/koda-sign.svg', 'aria-hidden="true" focusable="false" class="sign"');
const WORDMARK = svgInline('assets/img/brand/koda-wordmark.svg', 'aria-hidden="true" focusable="false" class="wordmark"');

/* --- Описание страниц ------------------------------------------------------ */
// section — какой пункт меню активен; code — служебная hero-строка; h1 — заголовок страницы.
const pages = [];

function add(p) { pages.push(p); }

add({ file: 'index.html', page: 'home', section: null,
  title: `${SITE_NAME} — ${K.brand.slogans[2]}`, desc: K.home.who.text,
  code: `[00] ${K.brand.wordmark} — ${K.brand.slogans[2]}`, h1: K.brand.essence, h1Plain: true });

add({ file: 'about.html', page: 'about', section: 'about',
  title: navItem('about').label, desc: K.about.lead,
  code: `[${sectionNo('about')}] ${navItem('about').label}` });

add({ file: 'catalog.html', page: 'catalog', section: 'catalog',
  title: navItem('catalog').label, desc: K.home.bestsellers.text,
  code: `[${sectionNo('catalog')}] ${navItem('catalog').label} — ${K.products.length} формул`,
  // главное фото рисует render.js — без подсказки браузер найдёт его только после скриптов
  preload: { href: 'assets/img/catalog/lineup.webp', srcset: 'assets/img/catalog-small/lineup-1200.webp 1200w, assets/img/catalog/lineup.webp 2400w', sizes: '100vw' } });

K.products.forEach((p) => add({
  file: `catalog/${p.id}.html`, page: 'product', id: p.id, section: 'catalog',
  title: `${p.type} «${p.name}»`, desc: p.description,
  code: `[${sectionNo('catalog')}] ${navItem('catalog').label} / FORM ${p.form} — ${p.step}`,
  h1: p.name, h1Plain: true, kicker: p.type
}));

add({ file: 'configurator.html', page: 'configurator', section: 'configurator',
  title: navItem('configurator').label, desc: K.home.configurator.text,
  code: `[${sectionNo('configurator')}] ${navItem('configurator').label}`,
  h1: K.configurator.copy.start.title });

add({ file: 'stores.html', page: 'stores', section: 'stores',
  title: navItem('stores').label, desc: K.storesIntro.text[0],
  code: `[${sectionNo('stores')}] ${navItem('stores').label} — ${K.stores.length} лабораторий` });

K.stores.forEach((s) => add({
  file: `stores/${s.id}.html`, page: 'store', id: s.id, section: 'stores',
  title: `${s.city} — ${navItem('stores').label}`, desc: `${s.tagline}. ${s.text[0]}`,
  code: `[${sectionNo('stores')}] LAB/${s.code} — ${s.city}`,
  h1: s.city, h1Plain: true, kicker: s.tagline
}));

add({ file: 'specialists.html', page: 'specialists', section: 'specialists',
  title: navItem('specialists').label, desc: K.specialistsIntro.text[0],
  code: `[${sectionNo('specialists')}] ${navItem('specialists').label} — ${K.specialists.length}` });

K.specialists.forEach((s) => add({
  file: `specialists/${s.id}.html`, page: 'specialist', id: s.id, section: 'specialists',
  title: `${s.name}, ${s.role.toLowerCase()} — ${navItem('specialists').label}`, desc: s.text,
  code: `[${sectionNo('specialists')}] ${s.code} — ${s.role}`,
  h1: s.name, h1Plain: true, kicker: s.role
}));

add({ file: 'refill.html', page: 'refill', section: 'refill',
  title: K.refill.title, desc: `${K.refill.lead} ${K.refill.intro[0]}`,
  code: `[${sectionNo('refill')}] ${K.refill.title}`, h1: K.refill.title });

add({ file: 'refill/return.html', page: 'refill-return', id: 'return', section: 'refill',
  title: `${K.refill.return.title} — ${K.refill.title}`, desc: K.refill.return.text,
  code: `[${sectionNo('refill')}] ${K.refill.title} / 01`, h1: K.refill.return.title });

add({ file: 'refill/refill.html', page: 'refill-refill', id: 'refill', section: 'refill',
  title: `${K.refill.refill.title} — ${K.refill.title}`, desc: K.refill.refill.text,
  code: `[${sectionNo('refill')}] ${K.refill.title} / 02`, h1: K.refill.refill.title });

add({ file: 'ingredients.html', page: 'ingredients', section: 'ingredients',
  title: navItem('ingredients').label, desc: K.home.ingredients.text,
  code: `[${sectionNo('ingredients')}] ${navItem('ingredients').label} — ${K.ingredients.length}` });

add({ file: '404.html', page: 'not-found', section: null, noindex: true,
  title: '404', desc: K.brand.essence,
  code: '[404] ERR/0', h1: '0 — Формула не найдена' });

/* --- Шаблон ---------------------------------------------------------------- */
// На GitHub Pages 404.html отдаётся с любого адреса — ставим <base> на корень репозитория.
const BASE_FIX = `<script>(function(){try{if(/\\.github\\.io$/.test(location.hostname)){var s=location.pathname.split('/').filter(Boolean)[0];var b=document.createElement('base');b.href='/'+(s&&!/\\.html$/.test(s)?s+'/':'');document.head.appendChild(b);}}catch(e){}})();</script>`;

// Ставится до первой отрисовки: класс js и флаги прелоадера/перехода (страница
// прячется под бумагу, пока transitions.js не нарисует свой слой). Страховка — 2.5 с.
const INTRO_FLAGS = `<script>(function(c){c.classList.add('js');try{var s=sessionStorage;if(!matchMedia('(prefers-reduced-motion: reduce)').matches){if(!s.getItem('koda-preloaded'))c.classList.add('is-preloading');else if(s.getItem('koda-transition'))c.classList.add('is-arriving');}}catch(e){}setTimeout(function(){c.classList.remove('is-preloading','is-arriving');},2500);})(document.documentElement);</script>`;

function head(p, r) {
  const title = p.page === 'home' ? p.title : `${p.title} — ${SITE_NAME}`;
  const desc = clip(p.desc);
  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
${p.page === 'not-found' ? BASE_FIX + '\n' : ''}${INTRO_FLAGS}
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
${p.noindex ? '<meta name="robots" content="noindex">\n' : ''}<meta name="theme-color" content="#F4F2EC">
<meta name="color-scheme" content="light">
<meta property="og:type" content="website">
<meta property="og:locale" content="ru_RU">
<meta property="og:site_name" content="${SITE_NAME}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${r}${OG_IMAGE}">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="${r}assets/img/favicon/favicon.svg" type="image/svg+xml">
<link rel="icon" href="${r}assets/img/favicon/favicon-32.png" sizes="32x32" type="image/png">
<link rel="apple-touch-icon" href="${r}assets/img/favicon/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="preload" as="style" href="${FONT_URL}" onload="this.onload=null;this.rel='stylesheet'">
<noscript><link rel="stylesheet" href="${FONT_URL}"></noscript>
${p.preload ? `<link rel="preload" as="image" href="${r}${p.preload.href}" imagesrcset="${p.preload.srcset.replace(/(^|, )assets\//g, `$1${r}assets/`)}" imagesizes="${p.preload.sizes}" fetchpriority="high">\n` : ''}${CSS.map((n) => `<link rel="stylesheet" href="${r}assets/css/${n}.css">`).join('\n')}
${JS.map((n) => `<script defer src="${r}assets/${n}"></script>`).join('\n')}
</head>`;
}

// Пункты меню парами по колонкам сетки
function navLink(n, p, r, cls) {
  const current = p.section === n.id ? ' aria-current="page"' : '';
  const label = codeify(n.label, 1);
  return `<a class="${cls}" href="${r}${n.href}"${current} aria-label="${esc(n.label)}" data-text="${esc(label)}">${esc(label)}</a>`;
}

function header(p, r) {
  const items = K.nav.map((n) => `<li>${navLink(n, p, r, 'nav-link')}</li>`).join('\n        ');
  const panelItems = K.nav.map((n, i) =>
    `<li><span class="menu-panel__no micro" aria-hidden="true">${String(i + 1).padStart(2, '0')}</span>${navLink(n, p, r, 'menu-panel__link')}</li>`
  ).join('\n        ');
  const findLab = codeify('Найти лабораторию', 1);
  return `
<a class="skip-link" href="#main">${t('К содержимому')}</a>
<header class="site-nav" data-nav>
  <nav class="site-nav__bar container" aria-label="Основное меню">
    <a class="site-nav__sign" href="${r}index.html" aria-label="KODA — на главную"${p.page === 'home' ? ' aria-current="page"' : ''}>${SIGN}</a>
    <ul class="site-nav__list">
        ${items}
    </ul>
    <div class="site-nav__tools">
      <button class="nav-link nav-help" type="button" data-help-open aria-haspopup="dialog" aria-label="Справка: как пользоваться сайтом">?</button>
      <a class="nav-link nav-find" href="${r}stores.html" data-find-lab aria-label="Найти лабораторию" data-text="${esc(findLab)}">${esc(findLab)}</a>
    </div>
    <button class="nav-link site-nav__menu-btn" type="button" data-menu-toggle aria-expanded="false" aria-controls="menu-panel"><span data-scramble-target data-text="МЕНЮ">МЕНЮ</span></button>
  </nav>
</header>

<div class="menu-panel" id="menu-panel" data-menu-panel hidden>
  <div class="menu-panel__inner container">
    <ul class="menu-panel__list">
        ${panelItems}
    </ul>
    <div class="menu-panel__foot">
      <a class="btn" href="${r}stores.html" aria-label="Найти лабораторию">${esc(findLab)}</a>
      <p class="micro muted">${t(K.contacts.hotline.label)}</p>
      <a class="menu-panel__tel" href="${K.contacts.hotline.href}">${esc(K.contacts.hotline.value)}</a>
    </div>
  </div>
</div>

<dialog class="help" data-help aria-labelledby="help-title">
  <div class="help__inner" tabindex="-1" autofocus>
    <div class="help__head">
      <p class="micro" id="help-title">? — СПРАВКА</p>
      <button class="nav-link" type="button" data-help-close aria-label="Закрыть справку">ЗАКРЫТЬ ×</button>
    </div>
    <ol class="help__list">
      <li><span class="micro muted">01</span><a class="help__link" href="${r}configurator.html">${c(navItem('configurator').label, 1)} →</a><p>${t(K.home.configurator.text)}</p></li>
      <li><span class="micro muted">02</span><a class="help__link" href="${r}stores.html">${c(navItem('stores').label, 1)} →</a><p>${t(K.home.stores.text)}</p></li>
      <li><span class="micro muted">03</span><a class="help__link" href="${r}refill.html">${c(navItem('refill').label, 1)} →</a><p>${t(K.refill.lead)}</p></li>
    </ol>
    <p class="help__tel"><span class="micro muted">${t(K.contacts.hotline.label)}</span> <a href="${K.contacts.hotline.href}">${esc(K.contacts.hotline.value)}</a></p>
  </div>
</dialog>`;
}

// Главная: первый экран — ASCII-движок, поверх в нижней строке слоган, кнопка и «?»
function homeHero(r) {
  const slogan = K.brand.slogans[2];
  const cta = codeify(K.brand.slogans[1], 2);
  return `
  <section class="hero" data-hero data-cursor="CLICK" aria-labelledby="page-title">
    <canvas class="hero__canvas" aria-hidden="true"></canvas>
    <div class="hero__bar container">
      <h1 id="page-title" class="hero__slogan"><span class="sr-only">KODA — ${t(slogan)}</span><span aria-hidden="true">${c(typo(slogan), 1)}</span></h1>
      <a class="btn hero__cta" href="${r}configurator.html" aria-label="${esc(K.brand.slogans[1])}" data-text="${esc(cta)}">${esc(cta)}</a>
      <button class="btn-icon hero__help" type="button" data-help-open aria-haspopup="dialog" aria-label="Справка: как пользоваться сайтом">?</button>
    </div>
  </section>`;
}

function hero(p) {
  const h1 = p.h1 || navItem(p.section).label;
  const h1Html = p.h1Plain ? t(h1) : c(typo(h1), 1);
  const aria = p.h1Plain ? '' : ` aria-label="${esc(h1)}"`;
  return `
  <section class="page-hero container" aria-labelledby="page-title" data-page-hero>
    <p class="page-hero__code micro" data-decode-text>${c(p.code, 1)}</p>
    ${p.kicker ? `<p class="page-hero__kicker micro">${t(p.kicker)}</p>\n    ` : ''}<h1 id="page-title" class="page-hero__title" data-reveal="words"${aria}>${h1Html}</h1>
  </section>`;
}

// Двухколоночный первый экран (товар, специалист): слева большое фото (sticky,
// у товара — наклон), справа код, подзаголовок, h1, мета. Остальное рисует render.js
// в [data-render-info].
function splitHero(o) {
  return `
  <section class="product container${o.cls ? ' ' + o.cls : ''}" aria-labelledby="page-title" data-page-hero>
    <div class="product__media">
      <div class="product__sticky"${o.tilt ? ' data-tilt' : ''}>
        <figure class="frame">
          ${o.media}
          <span class="ticks" aria-hidden="true"></span>
          <figcaption class="caption">${o.caption}</figcaption>
        </figure>
      </div>
    </div>
    <div class="product__info">
      <p class="page-hero__code micro" data-decode-text>${o.code}</p>
      <p class="page-hero__kicker micro">${o.kicker}</p>
      <h1 id="page-title" class="page-hero__title" data-reveal="words">${o.h1}</h1>
      ${o.meta ? `<p class="product__meta micro">${o.meta}</p>` : ''}
      <div data-render-info></div>
    </div>
  </section>`;
}

function productHero(p, r) {
  const x = K.products.find((q) => q.id === p.id);
  const title = `${x.type} «${x.name}»`;
  const tag = `<span class="tag tag--${x.line}"><span class="tag__dot" aria-hidden="true"></span>${x.line === 'violet' ? 'VIOLET' : 'SAGE'}</span>`;
  return splitHero({
    tilt: true,
    media: `<div class="media media--product" style="aspect-ratio:1600/2000"><img src="${r}${x.image}.webp" srcset="${r}${x.image}-800.webp 800w, ${r}${x.image}.webp 1600w" sizes="(min-width: 1024px) 50vw, 100vw" width="1600" height="2000" alt="${esc(title + ', ' + x.volume)}" decoding="async" fetchpriority="high" data-decode></div>`,
    caption: `<span class="micro" data-decode-text>${esc('FORM ' + x.form + ' — ' + typo(title).toUpperCase())}</span>${tag}`,
    code: c(p.code, 1), kicker: t(x.type), h1: t(x.name), meta: `${esc(x.volume)} ${tag}`
  });
}

// Специалист: портрет (если файла нет — decode-image нарисует ASCII-силуэт)
function specialistHero(p, r) {
  const x = K.specialists.find((q) => q.id === p.id);
  return splitHero({
    cls: 'product--person',
    media: `<div class="media media--portrait" style="aspect-ratio:3/4"><img src="${r}${x.photo}" srcset="${r}${x.photo.replace('.webp', '-800.webp')} 800w, ${r}${x.photo} 1600w" sizes="(min-width: 1024px) 50vw, 100vw" width="1200" height="1600" alt="${esc(x.name + ', ' + x.role.toLowerCase())}" decoding="async" data-decode data-fallback="portrait" data-seed="${x.id}"></div>`,
    caption: `<span class="micro" data-decode-text>${esc(x.code + ' — ' + x.name.toUpperCase())}</span>`,
    code: c(p.code, 1), kicker: t(x.role), h1: t(x.name)
  });
}

// Город: диптих на всю ширину (или ролик assets/video/stores/<id>.mp4), под ним код, город, слоган, время
function storeHero(p, r) {
  const x = K.stores.find((q) => q.id === p.id);
  return `
  <section class="city-hero" aria-labelledby="page-title" data-page-hero>
    <div class="city-hero__media media" data-video-slot="${r}assets/video/stores/${x.id}.mp4">
      <img src="${r}${x.diptych}" srcset="${r}${x.diptych.replace('locations/', 'locations-small/')} 1200w, ${r}${x.diptych} 2397w" sizes="100vw" width="2397" height="1600" alt="${esc(x.city + ': пространство лаборатории K0DA')}" decoding="async" fetchpriority="high" data-decode>
    </div>
    <div class="container city-hero__info">
      <p class="page-hero__code micro" data-decode-text>${c(p.code, 1)}</p>
      <h1 id="page-title" class="page-hero__title" data-reveal="words">${t(x.city)}</h1>
      <p class="city-hero__tagline lead">${t(x.tagline)}</p>
      <p class="city-hero__time micro">${esc(x.code)} <time data-clock="${esc(x.timezone)}">--:--:--</time></p>
    </div>
  </section>`;
}

// Рефил: фон — плакат с годичными кольцами, текст на бумажной плашке
function refillHero(p, r) {
  return `
  <section class="refill-hero" aria-labelledby="page-title" data-page-hero>
    <div class="refill-hero__bg media"><img src="${r}assets/img/posters/poster-rings-logo.webp" width="1396" height="2000" alt="" decoding="async" fetchpriority="high" data-decode></div>
    <div class="container refill-hero__wrap">
      <div class="refill-hero__box">
        <p class="page-hero__code micro" data-decode-text>${c(p.code, 1)}</p>
        <h1 id="page-title" class="page-hero__title" data-reveal="words" aria-label="${esc(K.refill.title)}">${c(K.refill.title, 1)}</h1>
        <p class="refill-hero__lead"><span class="sr-only">${t(K.refill.lead)}</span><span aria-hidden="true">${c(typo(K.refill.lead), 2)}</span></p>
      </div>
    </div>
  </section>`;
}

// 404: поле символов, по центру код ошибки, заголовок и кнопка на главную
function notFoundHero(p, r) {
  const home = codeify('На главную', 1);
  return `
  <section class="nf" aria-labelledby="page-title" data-page-hero>
    <canvas class="nf__field" data-code-field data-variant="paper" aria-hidden="true"></canvas>
    <div class="nf__box">
      <p class="page-hero__code micro" data-decode-text>${c(p.code, 1)}</p>
      <h1 id="page-title" class="nf__title" aria-label="${esc(p.h1)}">${c(typo(p.h1), 1)}</h1>
      <a class="btn" href="${r}index.html" aria-label="На главную" data-text="${esc(home)}">${esc(home)}</a>
    </div>
  </section>`;
}

// Конфигуратор: сцена 70–75% слева (видео A/B поверх canvas-сцены), зона выбора справа.
// Содержимое панели меняет assets/js/configurator.js.
function configuratorHero(p, r) {
  const C = K.configurator.copy;
  const restart = codeify('← Начать заново', 1);
  return `
  <section class="cfg" data-configurator data-state="START" aria-labelledby="page-title">
    <div class="cfg__stage">
      <div class="cfg__bar">
        <ol class="cfg__progress micro" data-cfg-progress aria-label="Этапы"></ol>
        <p class="cfg__loading micro" data-cfg-loading aria-hidden="true" hidden></p>
      </div>
      <div class="cfg__scene" data-cfg-scene>
        <canvas class="cfg__canvas" aria-hidden="true"></canvas>
        <video class="cfg__video" muted playsinline preload="auto" aria-hidden="true"></video>
        <video class="cfg__video" muted playsinline preload="auto" aria-hidden="true"></video>
      </div>
    </div>
    <div class="cfg__panel">
      <p class="cfg__code micro" data-decode-text>${c(p.code, 1)}</p>
      <p class="cfg__step micro" data-cfg-step>01 / 06</p>
      <h1 id="page-title" class="cfg__title" data-cfg-title aria-label="${esc(C.start.title)}">${c(C.start.title, 1)}</h1>
      <p class="cfg__sub" data-cfg-sub>${t(C.start.sub)}</p>
      <ul class="cfg__options" data-cfg-options hidden></ul>
      <div class="cfg__result" data-cfg-result hidden></div>
      <form class="cfg__save" data-cfg-save hidden novalidate></form>
      <div class="cfg__foot">
        <div class="cfg__restart micro" data-cfg-restart>
          <button class="cfg__link" type="button" data-restart aria-label="Начать заново">${esc(restart)}</button>
          <span data-restart-ask hidden>${esc(codeify('Начать заново?', 1))}
            <button class="cfg__link" type="button" data-restart-yes>[ ${esc(codeify('Да', 1))} ]</button>
            <button class="cfg__link" type="button" data-restart-no>[ ${esc(codeify('Нет', 1))} ]</button></span>
        </div>
        <p class="cfg__philosophy micro">${t(C.philosophy)}</p>
      </div>
      <p class="sr-only" aria-live="polite" data-cfg-live></p>
    </div>
    <noscript><p class="cfg__noscript">${t(C.start.sub)}</p></noscript>
  </section>`;
}

const HEROES = {
  configurator: configuratorHero, home: (p, r) => homeHero(r), product: productHero, specialist: specialistHero, store: storeHero, refill: refillHero, 'not-found': notFoundHero };

function footer(p, r) {
  const contacts = ['hotline', 'booking', 'email'].map((k) => {
    const x = K.contacts[k];
    return `<li><span class="micro muted">${t(x.label)}</span><a href="${x.href}">${esc(x.value)}</a></li>`;
  }).join('\n          ');
  const menu = K.nav.map((n) =>
    `<li><a class="nav-link" href="${r}${n.href}" aria-label="${esc(n.label)}" data-text="${esc(codeify(n.label, 1))}">${c(n.label, 1)}</a></li>`
  ).join('\n          ');
  const clocks = K.stores.map((s) =>
    `<li><a href="${r}stores/${s.id}.html" aria-label="${esc(s.city)}">${esc(s.code)}</a> <time data-clock="${esc(s.timezone)}">--:--:--</time></li>`
  ).join('\n        ');
  const cta = codeify('Собрать формулу', 1);
  return `
<footer class="site-footer" aria-labelledby="footer-title">
  <div class="container">
    <h2 class="sr-only" id="footer-title">Контакты и меню</h2>
    <div class="site-footer__top grid">
      <div class="site-footer__slogan">
        <p class="h2">${t(K.brand.slogans[3])}</p>
        <a class="btn" href="${r}configurator.html" aria-label="Собрать формулу" data-text="${esc(cta)}">${esc(cta)}</a>
      </div>
      <nav class="site-footer__menu" aria-label="Меню в подвале">
        <ul>
          ${menu}
        </ul>
      </nav>
      <div class="site-footer__contacts">
        <ul>
          ${contacts}
          <li><span class="micro muted">${t(K.stores[0].city)}</span><address>${t(K.contacts.address)}</address></li>
        </ul>
      </div>
    </div>
    <ul class="site-footer__clocks micro" aria-label="Время в лабораториях">
        ${clocks}
    </ul>
    <a class="site-footer__mark" href="${r}index.html" aria-label="KODA — на главную">${WORDMARK}</a>
    <div class="site-footer__bottom micro">
      <p class="site-footer__copy">© 2026 K0DA beauty lab</p>
      <p>${t(K.contacts.hours)}</p>
    </div>
  </div>
</footer>
<div class="ticker" data-ticker aria-hidden="true"><span class="ticker__line"></span></div>`;
}

function build(p) {
  const depth = p.file.split('/').length - 1;
  const r = '../'.repeat(depth);
  return `${head(p, r)}
<body data-page="${p.page}"${p.id ? ` data-id="${p.id}"` : ''} data-root="${r}">
${header(p, r)}

<main id="main" tabindex="-1">${(HEROES[p.page] || hero)(p, r)}
  <div data-render></div>
</main>
${footer(p, r)}
</body>
</html>
`;
}

/* --- Запись ---------------------------------------------------------------- */
let count = 0;
for (const p of pages) {
  const out = path.join(ROOT, p.file);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, build(p));
  count++;
}
console.log(`build-pages: ${count} страниц записано`);
