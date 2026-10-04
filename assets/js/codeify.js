/* ==========================================================================
   codeify(text, level) — «цифры вместо букв».
   level 1 — меню, кнопки, коды подписей: кириллическая О → 0.
   level 2 — крупные заголовки и кодовые экраны: + 1–2 замены на слово,
             детерминированно (seed = само слово), чтобы не менялось между загрузками.
   level 3 — только в анимациях: см. CODE_CHARS (набор для scramble).
   Результат всегда UPPERCASE. aria-label и <title> — нормальный текст, не codeify.
   ========================================================================== */
(function (root) {
  'use strict';

  var CODE_CHARS = '01KDAØ:·/\\_—<>+=';
  var L2_MAP = { 'А': '4', 'Е': '3', 'З': '3', 'Б': '6', 'Т': '7', 'И': '1', 'Ч': '4' };

  // Утверждённые написания (имеют приоритет над хэшем)
  var PRESETS = {
    'СОБЕРИ СЕБЯ': 'С06ЕРИ С36Я'
  };

  function hash(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function mulberry32(seed) {
    return function () {
      seed = (seed + 0x6D2B79F5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function level1(s) {
    return s.replace(/О/g, '0');
  }

  function level2Word(word) {
    // Первую букву и короткие слова не трогаем — слово должно читаться
    if (word.length < 4) return word;
    var candidates = [];
    for (var i = 1; i < word.length; i++) {
      if (L2_MAP[word[i]]) candidates.push(i);
    }
    if (!candidates.length) return word;
    var rnd = mulberry32(hash(word));
    var count = Math.min(candidates.length, word.length >= 6 && rnd() > .5 ? 2 : 1);
    var chars = word.split('');
    for (var k = 0; k < count; k++) {
      var pick = Math.floor(rnd() * candidates.length);
      var idx = candidates.splice(pick, 1)[0];
      chars[idx] = L2_MAP[chars[idx]];
    }
    return chars.join('');
  }

  // Типограф до замен: «Д0» он уже не узнает как «до» и не привяжет к соседнему слову
  function typoFn() {
    var U = root.KODA_UTIL;
    if (U && U.typo) return U.typo;
    if (typeof require === 'function') { try { return require('./typo.js').typo; } catch (e) { /* без типографа */ } }
    return function (x) { return x; };
  }

  function codeify(text, level) {
    if (text == null) return '';
    var s = typoFn()(String(text)).toUpperCase();
    level = level || 1;
    if (level >= 2) {
      var key = s.replace(/\s+/g, ' ').trim();
      if (PRESETS[key]) return PRESETS[key];
      s = s.replace(/[А-ЯЁ]+/g, level2Word);
    }
    return level1(s);
  }

  var api = { codeify: codeify, CODE_CHARS: CODE_CHARS, hash: hash, mulberry32: mulberry32 };
  root.KODA_UTIL = Object.assign(root.KODA_UTIL || {}, api);
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
