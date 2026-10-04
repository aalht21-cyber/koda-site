#!/usr/bin/env node
/* ==========================================================================
   check-links.js — проверка ссылок и ассетов сайта K0DA перед публикацией.
   Запуск из корня проекта:  node tools/check-links.js
   Проверяет:
   1. HTML-страницы: локальные href / src / srcset / poster / data-video-slot /
      data-preview существуют; якоря (#id) есть на целевой странице или среди
      id, которые render.js создаёт из content.js; нет абсолютных путей «/…».
   2. content.js: каждый путь assets/… и *.html существует.
   3. JS и CSS: строковые пути 'assets/…' и url(…) существуют.
   4. Облегчённые копии для srcset (posters-800, locations-small, specialists/*-800).
   5. Ролики конфигуратора и магазинов: отсутствие — предупреждение, не ошибка
      (сайт обязан работать без видео, есть fallback).
   6. Имена файлов: латиница, нижний регистр, дефисы.
   Код выхода 1, если есть ошибки.
   ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const SKIP_DIRS = new Set(['.git', 'node_modules', 'tools']);

const errors = [];
const warnings = [];
const rel = (p) => path.relative(ROOT, p) || '.';
const exists = (p) => fs.existsSync(p);

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.') || SKIP_DIRS.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}
const files = walk(ROOT);

/* --- Данные ---------------------------------------------------------------- */
const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'assets/data/content.js'), 'utf8'), sandbox);
const K = sandbox.window.KODA;
const C = K.configurator;

// id, которые render.js создаёт в рантайме (якоря ingredients.html#<id> и т. п.)
const runtimeIds = new Set(Object.keys(K.ingredients || {}));
if (Array.isArray(K.ingredients)) K.ingredients.forEach((x) => runtimeIds.add(x.id));

/* --- 1. HTML --------------------------------------------------------------- */
const LOCAL = (u) => u && !/^(https?:|mailto:|tel:|data:|javascript:|#)/.test(u) && !u.startsWith('//');
const htmlFiles = files.filter((f) => f.endsWith('.html'));
const idsCache = new Map();
function idsOf(file) {
  if (!idsCache.has(file)) {
    const s = fs.readFileSync(file, 'utf8');
    idsCache.set(file, new Set([...s.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1])));
  }
  return idsCache.get(file);
}

let refCount = 0;
for (const file of htmlFiles) {
  const html = fs.readFileSync(file, 'utf8')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, (m) => (/\ssrc=/.test(m) ? m.replace(/>[\s\S]*<\/script>/, '></script>') : ''));
  const dir = path.dirname(file);
  const refs = [];
  for (const m of html.matchAll(/\s(href|src|poster|data-video-slot|data-preview)="([^"]*)"/g)) refs.push(m[2]);
  for (const m of html.matchAll(/\s(?:image)?srcset="([^"]*)"/g)) m[1].split(',').forEach((part) => refs.push(part.trim().split(/\s+/)[0]));

  for (const raw of refs) {
    const u = raw.replace(/&amp;/g, '&');
    if (u.startsWith('#') && u.length > 1) {
      const id = decodeURIComponent(u.slice(1));
      if (!idsOf(file).has(id) && !runtimeIds.has(id)) errors.push(`${rel(file)}: якорь ${u} не найден`);
      continue;
    }
    if (!LOCAL(u)) continue;
    refCount++;
    if (u.startsWith('/')) { errors.push(`${rel(file)}: абсолютный путь ${u} (нужен относительный)`); continue; }
    const [pathPart, hash] = u.split('?')[0].split('#');
    const target = path.resolve(dir, decodeURIComponent(pathPart));
    if (!exists(target)) {
      // ролик города необязателен — есть фото
      if (/\.mp4$/.test(pathPart)) warnings.push(`${rel(file)}: нет ролика ${u} (останется фото)`);
      else errors.push(`${rel(file)}: нет файла ${u}`);
      continue;
    }
    if (hash && target.endsWith('.html') && !idsOf(target).has(hash) && !runtimeIds.has(hash)) {
      errors.push(`${rel(file)}: якорь #${hash} не найден в ${rel(target)}`);
    }
  }
}

/* --- 2. content.js --------------------------------------------------------- */
const contentPaths = new Set();
(function collect(v) {
  if (typeof v === 'string') {
    if (/^assets\//.test(v) || /^[\w/-]+\.html(#[\w-]+)?$/.test(v)) contentPaths.add(v);
  } else if (v && typeof v === 'object') Object.values(v).forEach(collect);
})(K);
for (const p of contentPaths) {
  const [file, hash] = p.split('#');
  const target = path.join(ROOT, file);
  // фото товара задано базовым именем: код добавляет .webp, -800.webp, -cutout.webp
  if (/^assets\/img\/catalog\/[^.]+$/.test(file)) {
    ['.webp', '-800.webp', '-cutout.webp'].forEach((sfx) => {
      if (!exists(target + sfx)) errors.push(`content.js: нет файла ${file + sfx}`);
    });
    continue;
  }
  if (!exists(target)) { errors.push(`content.js: нет файла ${p}`); continue; }
  if (hash && !idsOf(target).has(hash) && !runtimeIds.has(hash)) errors.push(`content.js: якорь ${p} не найден`);
}

/* --- 3. JS и CSS ----------------------------------------------------------- */
for (const file of files.filter((f) => /assets\/js\/.+\.js$/.test(f))) {
  const s = fs.readFileSync(file, 'utf8');
  for (const m of s.matchAll(/'(assets\/[^'\s]+)'/g)) {
    const p = m[1];
    const target = path.join(ROOT, p);
    if (!exists(target)) errors.push(`${rel(file)}: нет ${p.endsWith('/') ? 'папки' : 'файла'} ${p}`);
  }
}
for (const file of files.filter((f) => f.endsWith('.css'))) {
  const s = fs.readFileSync(file, 'utf8');
  for (const m of s.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)) {
    if (!LOCAL(m[1])) continue;
    if (!exists(path.resolve(path.dirname(file), m[1]))) errors.push(`${rel(file)}: нет файла ${m[1]}`);
  }
}

/* --- 4. Облегчённые копии (правила — как srcsetFor() в render.js) ---------- */
function variantOf(src) {
  let m;
  if ((m = /^assets\/img\/posters\/(.+)$/.exec(src))) return 'assets/img/posters-800/' + m[1];
  if ((m = /^assets\/img\/locations\/(.+)$/.exec(src))) return 'assets/img/locations-small/' + m[1];
  if ((m = /^(assets\/img\/specialists\/[a-z-]+)\.webp$/.exec(src))) return m[1] + '-800.webp';
  return null;
}
const images = files.map((f) => path.relative(ROOT, f).split(path.sep).join('/'))
  .filter((p) => /^assets\/img\/(posters|locations)\/.+\.webp$/.test(p));
contentPaths.forEach((p) => { if (/^assets\/img\/specialists\//.test(p)) images.push(p); });
for (const src of images) {
  const v = variantOf(src);
  if (v && !exists(path.join(ROOT, v))) warnings.push(`нет облегчённой копии ${v} (браузер возьмёт оригинал)`);
}

/* --- 5. Ролики ------------------------------------------------------------- */
const vdir = 'assets/video/configurator/';
const expected = ['lab-idle', 'flask-in', 'flask-idle'];
const preps = new Set(Object.values(C.ingredients).map((x) => x.prep));
preps.forEach((p) => expected.push('prep-' + p));
Object.keys(C.ingredients).forEach((id) => expected.push('ing-' + id));
Object.keys(C.families).forEach((type) => {
  expected.push('stir-' + type);
  C.families[type].forEach((f) => ['final-', 'fill-', 'result-'].forEach((pre) => expected.push(pre + f.id)));
});
let videoMissing = 0;
for (const name of expected) {
  for (const ext of ['.mp4', '.jpg']) {
    if (!exists(path.join(ROOT, vdir + name + ext))) { videoMissing++; warnings.push(`конфигуратор: нет ${vdir}${name}${ext} (сработает Canvas-сцена)`); }
  }
}
for (const s of K.stores || []) {
  if (!exists(path.join(ROOT, `assets/video/stores/${s.id}.mp4`))) warnings.push(`магазин ${s.id}: нет ролика (останется фото)`);
}

/* --- 6. Имена файлов ------------------------------------------------------- */
for (const f of files) {
  const r = path.relative(ROOT, f).split(path.sep).join('/');
  if (/^[a-z0-9._-]+$/.test(path.basename(r)) || /^[A-Z0-9_-]+\.md$/i.test(r)) continue;
  if (r === 'README.md') continue;
  warnings.push(`имя файла не латиница/нижний регистр/дефис: ${r}`);
}

/* --- Итог ------------------------------------------------------------------ */
console.log(`check-links: ${htmlFiles.length} страниц, ${refCount} локальных ссылок, ` +
  `${contentPaths.size} путей в content.js, роликов конфигуратора ${expected.length * 2 - videoMissing}/${expected.length * 2}`);
warnings.forEach((w) => console.log('  ! ' + w));
errors.forEach((e) => console.log('  ✗ ' + e));
if (errors.length) { console.log(`ОШИБОК: ${errors.length}`); process.exit(1); }
console.log('OK — битых ссылок нет' + (warnings.length ? ` (предупреждений: ${warnings.length})` : ''));
