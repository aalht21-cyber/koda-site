/* ==========================================================================
   decode-image — изображения «проявляются» из символов.
   Для каждого img[data-decode] внутри .media: при входе во вьюпорт поверх
   рисуется ASCII-версия фото (яркость по сетке → символы --olive-900), затем
   за ~900 мс клетки в случайном порядке открывают настоящее фото.
   encodeVisible() — обратный эффект при уходе со страницы.
   img[data-fallback="portrait"] без файла заменяется ASCII-силуэтом.
   prefers-reduced-motion — простой fade.
   ========================================================================== */
(function (root) {
  'use strict';

  var U = root.KODA_UTIL;
  var RAMP = ' .·:-=+<>!?01KDA0';
  var PX = 11;
  var HOLD = 220;
  var REVEAL = 900;

  function css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

  function loaded(img) {
    return new Promise(function (resolve, reject) {
      if (img.complete) return img.naturalWidth ? resolve() : reject();
      img.addEventListener('load', function () { resolve(); }, { once: true });
      img.addEventListener('error', function () { reject(); }, { once: true });
    });
  }

  // Сетка яркости с учётом object-fit: cover (тот же кадр, что видит пользователь)
  function sample(img, cols, rows, boxW, boxH) {
    var nw = img.naturalWidth, nh = img.naturalHeight;
    var scale = Math.max(boxW / nw, boxH / nh);
    var sw = boxW / scale, sh = boxH / scale;
    var pos = (getComputedStyle(img).objectPosition || '50% 50%').split(' ');
    var fx = parseFloat(pos[0]) / 100, fy = parseFloat(pos[1] || pos[0]) / 100;
    if (isNaN(fx)) fx = 0.5;
    if (isNaN(fy)) fy = 0.5;
    var sx = (nw - sw) * fx, sy = (nh - sh) * fy;
    var off = document.createElement('canvas');
    off.width = cols; off.height = rows;
    var c = off.getContext('2d', { willReadFrequently: true });
    c.drawImage(img, sx, sy, sw, sh, 0, 0, cols, rows);
    try {
      var d = c.getImageData(0, 0, cols, rows).data;
      var lum = new Float32Array(cols * rows);
      for (var i = 0; i < lum.length; i++) {
        var a = d[i * 4 + 3] / 255;
        // прозрачное (cutout) — как светлый фон
        lum[i] = (1 - a) + a * (0.2126 * d[i * 4] + 0.7152 * d[i * 4 + 1] + 0.0722 * d[i * 4 + 2]) / 255;
      }
      return lum;
    } catch (e) {
      return null; // file:// — холст «испорчен», читаем без яркости
    }
  }

  function makeLayer(media) {
    var r = media.getBoundingClientRect();
    var w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
    var canvas = document.createElement('canvas');
    canvas.className = 'decode-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    media.appendChild(canvas);
    var ctx = U.setupCanvas(canvas, w, h);
    var cell = U.measureCell(ctx, PX);
    var cols = Math.ceil(w / cell.cw), rows = Math.ceil(h / cell.ch);
    return { canvas: canvas, ctx: ctx, w: w, h: h, cw: cell.cw, ch: cell.ch, cols: cols, rows: rows };
  }

  function charFor(lum, i) {
    var v = lum ? 1 - lum[i] : (Math.random() * 0.6);
    v = Math.pow(Math.max(0, Math.min(1, v)), 0.9);
    return RAMP[Math.round(v * (RAMP.length - 1))];
  }

  function drawCell(L, lum, i, bg, fg) {
    var x = i % L.cols, y = (i / L.cols) | 0;
    var px = Math.floor(x * L.cw), py = y * L.ch;
    L.ctx.fillStyle = bg;
    L.ctx.fillRect(px, py, Math.ceil(L.cw) + 1, L.ch);
    var chr = charFor(lum, i);
    if (chr !== ' ') {
      L.ctx.fillStyle = fg;
      L.ctx.fillText(chr, x * L.cw, py + (L.ch - PX) / 2);
    }
  }

  function shuffled(n) {
    var order = new Uint32Array(n);
    for (var i = 0; i < n; i++) order[i] = i;
    for (var j = n - 1; j > 0; j--) {
      var k = (Math.random() * (j + 1)) | 0;
      var t = order[j]; order[j] = order[k]; order[k] = t;
    }
    return order;
  }

  function decode(img) {
    var media = img.closest('.media') || img.parentElement;
    var reveal = function () { media.classList.add('is-revealed'); };
    if (U.reducedMotion()) { img.classList.add('is-decoded'); reveal(); return; }
    loaded(img).then(function () {
      var L = makeLayer(media);
      var lum = sample(img, L.cols, L.rows, L.w, L.h);
      var bg = css('--stone'), fg = css('--olive-900');
      var ctx = L.ctx;
      ctx.font = '400 ' + PX + 'px "Fira Code", ui-monospace, monospace';
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, L.w, L.h);
      ctx.fillStyle = fg;
      for (var y = 0; y < L.rows; y++) {
        var line = '';
        for (var x = 0; x < L.cols; x++) line += charFor(lum, y * L.cols + x);
        ctx.fillText(line, 0, y * L.ch + (L.ch - PX) / 2);
      }
      img.classList.add('is-decoding');
      reveal(); // ASCII-слой закрыл фото — подложка больше не нужна
      var n = L.cols * L.rows;
      var order = shuffled(n);
      var done = 0;
      var start = performance.now() + HOLD;
      requestAnimationFrame(function frame(now) {
        var p = Math.max(0, Math.min(1, (now - start) / REVEAL));
        var target = Math.floor(n * (1 - Math.pow(1 - p, 2)));
        for (; done < target; done++) {
          var i = order[done];
          var x = i % L.cols, yy = (i / L.cols) | 0;
          ctx.clearRect(Math.floor(x * L.cw), yy * L.ch, Math.ceil(L.cw) + 1, L.ch);
        }
        if (p < 1) requestAnimationFrame(frame);
        else {
          L.canvas.remove();
          img.classList.remove('is-decoding');
          img.classList.add('is-decoded');
        }
      });
    }).catch(function () {
      img.classList.add('is-decoded');
      reveal();
    });
  }

  // Обратный эффект: видимые фото снова рассыпаются в символы
  function encodeVisible(duration) {
    if (U.reducedMotion()) return;
    duration = duration || 350;
    var vh = root.innerHeight;
    var imgs = document.querySelectorAll('img[data-decode].is-decoded');
    Array.prototype.forEach.call(imgs, function (img) {
      var media = img.closest('.media');
      if (!media) return;
      var r = media.getBoundingClientRect();
      if (r.bottom < 0 || r.top > vh || !r.width) return;
      var L = makeLayer(media);
      var lum = sample(img, L.cols, L.rows, L.w, L.h);
      var bg = css('--stone'), fg = css('--olive-900');
      L.ctx.font = '400 ' + PX + 'px "Fira Code", ui-monospace, monospace';
      var n = L.cols * L.rows, order = shuffled(n), done = 0, start = performance.now();
      requestAnimationFrame(function frame(now) {
        var p = Math.min(1, (now - start) / duration);
        var target = Math.floor(n * p);
        for (; done < target; done++) drawCell(L, lum, order[done], bg, fg);
        if (p < 1) requestAnimationFrame(frame);
      });
    });
  }

  function portraitFallback(img) {
    var media = img.closest('.media') || img.parentElement;
    var canvas = document.createElement('canvas');
    canvas.className = 'portrait-canvas';
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', img.getAttribute('alt') || '');
    media.appendChild(canvas);
    img.remove();
    U.asciiPortrait(canvas, img.getAttribute('data-seed') || img.getAttribute('alt'));
  }

  function initDecodeImages() {
    var imgs = document.querySelectorAll('img[data-decode]');
    // reduced motion: фото сразу на месте, без подложки и проявления
    var io = 'IntersectionObserver' in root && !U.reducedMotion() ? new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        io.unobserve(en.target);
        var img = en.target.querySelector('img[data-decode]');
        if (img) decode(img);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 }) : null;

    Array.prototype.forEach.call(imgs, function (img) {
      if (img.getAttribute('data-fallback') === 'portrait') {
        loaded(img).catch(function () { portraitFallback(img); });
      }
      var media = img.closest('.media') || img.parentElement;
      if (io) io.observe(media); else { img.classList.add('is-decoded'); media.classList.add('is-revealed'); }
    });
    document.documentElement.classList.add('decode-ready');
  }

  root.KODA_UTIL = Object.assign(root.KODA_UTIL || {}, {
    initDecodeImages: initDecodeImages,
    encodeVisible: encodeVisible,
    decodeNow: decode
  });
})(window);
