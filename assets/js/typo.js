/* ==========================================================================
   typo(text) — типограф. Применяется ко всем текстам из content.js перед вставкой.
   Неразрывные пробелы после коротких слов и перед частицами, тире, диапазоны,
   «ёлочки», число + единица. Идемпотентна. Работает в браузере и в Node.
   ========================================================================== */
(function (root) {
  'use strict';

  var NBSP = ' ';
  var SHORT = toSet('в во к ко с со у о об а и но на по за из от до не ни для без при про над под что как это или');
  var PARTICLES = toSet('же ли бы');
  var ABBR = toSet('ул д корп стр г пр пер');

  function toSet(list) {
    var o = {};
    list.split(' ').forEach(function (w) { o[w] = true; });
    return o;
  }

  // Слово без обрамляющей пунктуации: «(и» → «и», «бы,» → «бы»
  function bare(token) {
    return token.toLowerCase().replace(/^[(«"„—–-]+/, '').replace(/[.,!?:;»")]+$/, '');
  }

  // Разбор по токенам: решение о неразрывном пробеле принимается для каждого
  // промежутка отдельно, поэтому цепочки «и в 60» обрабатываются целиком.
  function bindShortWords(s) {
    var parts = s.split(/([ \t ]+)/);
    for (var i = 1; i < parts.length - 1; i += 2) {
      var prev = parts[i - 1];
      var next = parts[i + 1];
      if (!prev || !next) continue;
      var endsWithPunct = /[.,!?:;»")]$/.test(prev);
      var glue =
        (!endsWithPunct && SHORT[bare(prev)]) ||
        (/\.$/.test(prev) && ABBR[bare(prev.slice(0, -1))]) ||
        PARTICLES[bare(next)];
      if (glue) parts[i] = NBSP;
    }
    return parts.join('');
  }

  function typo(input) {
    if (input == null) return '';
    var s = String(input);

    // «Ёлочки» из прямых кавычек
    s = s.replace(/(^|[\s(\[—–-])"(?=\S)/g, '$1«').replace(/"/g, '»');

    // Диапазоны 2-3 → 2–3, но не цепочки вроде телефонов 345-67-89
    s = s.replace(/(^|[^\d-])(\d+)\s?-\s?(\d+)(?![\d-])/g, '$1$2–$3');

    // Тире: дефис или двойной дефис между пробелами → длинное тире
    s = s.replace(/(\s)--?(\s)/g, '$1—$2');

    // Неразрывный пробел перед тире и после тире в начале фразы
    s = s.replace(/[ \t ]+—/g, NBSP + '—');
    s = s.replace(/(^|[.!?]\s+)—[ \t]+/g, '$1—' + NBSP);
    // Разделитель «·» не начинает строку: «экстракт · пудра»
    s = s.replace(/[ \t ]+·/g, NBSP + '·');

    // Короткие слова и сокращения — к следующему слову, частицы же/ли/бы — к предыдущему
    s = bindShortWords(s);

    // Число + единица / слово: «50 ML», «60 ШТ.», «10–15 минут»
    s = s.replace(/(\d)[ \t]+(?=[A-Za-zА-Яа-яЁё%])/g, '$1' + NBSP);

    return s;
  }

  var api = { typo: typo, NBSP: NBSP };
  root.KODA_UTIL = Object.assign(root.KODA_UTIL || {}, api);
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
