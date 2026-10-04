/* ==========================================================================
   ascii-engine — сетка моноширинных символов на canvas.
   initHero()        — hero главной: сцены A «K0DA», B «Ноль-тор», C «Поле кода»,
                       D «Слоган»; клик — следующая сцена, автосмена 7 с,
                       переход через рассыпание в шум, разрежение при прокрутке.
   codeField(canvas) — бинарное поле 0/1 для «кодовых» секций (--plum).
   asciiPortrait(canvas, seed) — ASCII-силуэт головы и плеч (fallback портрета).
   Яркость → символ по рампе от редких к плотным. ~30 fps, пауза вне вьюпорта
   и на скрытой вкладке. prefers-reduced-motion — статичный кадр.
   ========================================================================== */
(function (root) {
  'use strict';

  var U = root.KODA_UTIL;
  var RAMP = ' .·:-=+<>!?01KDA0';
  var NOISE = '01KDA0:·./';
  var DUST = '.·:';
  var FRAME_MS = 33;
  var FONT_FAMILY = '"Fira Code", ui-monospace, monospace';

  function css(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }
  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function reduced() { return U.reducedMotion(); }

  // Ждём Fira Code, но не дольше 1.2 с — иначе меряем по запасному шрифту
  function fontReady(px) {
    if (!document.fonts || !document.fonts.load) return Promise.resolve();
    return Promise.race([
      document.fonts.load('400 ' + px + 'px "Fira Code"').catch(function () {}),
      new Promise(function (r) { setTimeout(r, 1200); })
    ]);
  }

  // Размер ячейки: ширина символа × высота строки
  function measureCell(ctx, px) {
    ctx.font = '400 ' + px + 'px ' + FONT_FAMILY;
    var cw = ctx.measureText('0000000000').width / 10;
    return { cw: cw, ch: Math.round(px * 1.25) };
  }

  function setupCanvas(canvas, w, h) {
    var dpr = Math.min(root.devicePixelRatio || 1, 2);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.textBaseline = 'top';
    return ctx;
  }

  // Детерминированный шум 0..1 для ячейки
  function hash01(i, salt) {
    var h = Math.imul((i + 1) ^ (salt || 0x9E3779B9), 2654435761);
    h ^= h >>> 15; h = Math.imul(h, 2246822519); h ^= h >>> 13;
    return ((h >>> 0) % 10007) / 10007;
  }

  // Карта яркости из Path2D/текста: рисуем в offscreen с 2× сглаживанием
  function rasterize(cols, rows, draw) {
    var S = 2;
    var off = document.createElement('canvas');
    off.width = cols * S; off.height = rows * S;
    var c = off.getContext('2d');
    c.fillStyle = '#000';
    draw(c, S);
    var data = c.getImageData(0, 0, off.width, off.height).data;
    var map = new Float32Array(cols * rows);
    for (var y = 0; y < rows; y++) {
      for (var x = 0; x < cols; x++) {
        var sum = 0;
        for (var sy = 0; sy < S; sy++) {
          for (var sx = 0; sx < S; sx++) {
            sum += data[(((y * S + sy) * off.width) + (x * S + sx)) * 4 + 3];
          }
        }
        map[y * cols + x] = sum / (S * S * 255);
      }
    }
    return map;
  }

  /* ======================================================================
     Сцены. frame(e, t, out): заполнить out.v (0..1 плотность), out.c (код
     символа или 0 — тогда символ берётся из рампы), out.l (слой:
     0 — обычный, 1 — бледный, 2 — жирный, 3 — инверсия: --ink блок + --paper символ)
     ====================================================================== */

  // A — слово K0DA из шума; волна, мерцание, курсор уплотняет символы
  function SceneKoda() {
    var map, delay;
    return {
      name: 'K0DA',
      enter: function (e) {
        var n = e.cols * e.rows;
        var path = e.wordmarkPath;
        var wCells = Math.min(e.cols * 0.86, (e.rows * 0.5) * (1608 / 507) * (e.ch / e.cw));
        var hCells = wCells * (507 / 1608) * (e.cw / e.ch);
        var ox = (e.cols - wCells) / 2;
        var oy = (e.rows - hCells) / 2 - e.rows * 0.04;
        map = rasterize(e.cols, e.rows, function (c, S) {
          if (!path) return;
          c.setTransform(S * wCells / 1608, 0, 0, S * hCells / 507, S * ox, S * oy);
          c.fill(path, 'evenodd');
        });
        delay = new Float32Array(n);
        for (var i = 0; i < n; i++) {
          var x = i % e.cols;
          delay[i] = 1200 * (0.15 + 0.5 * (x / e.cols) + 0.35 * Math.random());
        }
      },
      frame: function (e, t, out) {
        var cols = e.cols, rows = e.rows, n = cols * rows;
        var mx = e.mouse ? e.mouse.x / e.cw : -1e4;
        var my = e.mouse ? e.mouse.y / e.ch : -1e4;
        var R = 120;
        var still = e.still;
        for (var i = 0; i < n; i++) {
          var x = i % cols, y = (i / cols) | 0;
          var m = map[i];
          out.c[i] = 0; out.l[i] = 0; out.v[i] = 0;
          if (!still && t < delay[i]) {
            // ещё не расшифровано: шум
            if (m > 0.05 ? Math.random() < 0.7 : Math.random() < 0.05) {
              out.c[i] = NOISE.charCodeAt((Math.random() * NOISE.length) | 0);
            }
            continue;
          }
          if (m > 0.05) {
            var v = 0.5 + 0.45 * m;
            if (!still) {
              v += 0.16 * Math.sin(x * 0.11 - t * 0.0011 + y * 0.22);
              if (Math.random() < 0.004) v = 0.35 + Math.random() * 0.65; // мерцание
            }
            out.v[i] = v;
          } else if (hash01(i, 7) < 0.035) {
            out.v[i] = 0.1; // редкая пыль на фоне
          }
          if (e.mouse && !still) {
            var dx = (x - mx) * e.cw, dy = (y - my) * e.ch;
            var d = Math.sqrt(dx * dx + dy * dy);
            if (d < R) {
              var k = 1 - d / R;
              if (m > 0.05) {
                out.v[i] = Math.min(1, out.v[i] + k * 0.7);
                if (k > 0.35) out.c[i] = 'K0DA'.charCodeAt((x + y + ((t / 90) | 0)) & 3);
              } else if (Math.random() < k * 0.35) {
                out.c[i] = Math.random() < 0.5 ? 48 : 49; // 0 / 1
                out.l[i] = 1;
              }
            }
          }
        }
      }
    };
  }

  // B — вращающийся перечёркнутый ноль-тор (облако точек, z-буфер, Ламберт)
  function SceneTorus() {
    var pts, zbuf;
    var R = 1, r = 0.34, SY = 1.45;
    return {
      name: 'TORUS',
      enter: function (e) {
        zbuf = new Float32Array(e.cols * e.rows);
        if (pts) return;
        var list = [];
        var PH = 240, TH = 48;
        for (var a = 0; a < PH; a++) {
          var phi = (a / PH) * Math.PI * 2;
          var cp = Math.cos(phi), sp = Math.sin(phi);
          for (var b = 0; b < TH; b++) {
            var th = (b / TH) * Math.PI * 2;
            var ct = Math.cos(th), st = Math.sin(th);
            var nx = ct * cp, ny = ct * sp, nz = st;
            list.push(R * cp + r * nx, (R * sp) * SY + r * ny, r * nz, nx, ny, nz);
          }
        }
        // Косая черта знака: цилиндр снизу-слева вверх-вправо
        var p0 = [-0.62, -1.25], p1 = [0.62, 1.25];
        var L = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
        var ux = (p1[0] - p0[0]) / L, uy = (p1[1] - p0[1]) / L;
        var px = -uy, py = ux;
        var rr = r * 0.62;
        for (var s = 0; s <= 120; s++) {
          var cx = p0[0] + (p1[0] - p0[0]) * (s / 120);
          var cy = p0[1] + (p1[1] - p0[1]) * (s / 120);
          for (var k = 0; k < 28; k++) {
            var ang = (k / 28) * Math.PI * 2;
            var ca = Math.cos(ang), sa = Math.sin(ang);
            var nnx = px * ca, nny = py * ca, nnz = sa;
            list.push(cx + rr * nnx, cy + rr * nny, rr * nnz, nnx, nny, nnz);
          }
        }
        pts = new Float32Array(list);
      },
      frame: function (e, t, out) {
        var cols = e.cols, rows = e.rows, n = cols * rows;
        out.v.fill(0); out.c.fill(0); out.l.fill(0); zbuf.fill(0);
        var A = Math.sin(t * 0.00042) * 1.15 + t * 0.00018, B = 0.28 + 0.16 * Math.sin(t * 0.0005); // начинаем анфас, покачиваясь
        var cA = Math.cos(A), sA = Math.sin(A), cB = Math.cos(B), sB = Math.sin(B);
        var K2 = 5;
        var ext = SY * R + r;
        var K1 = Math.min(0.36 * rows, 0.42 * cols * (e.cw / e.ch)) * K2 / ext;
        var aspect = e.ch / e.cw;
        // свет сверху-слева со стороны зрителя
        var lx = -0.45, ly = 0.6, lz = -0.66;
        var cx = cols / 2, cy = rows / 2;
        for (var i = 0; i < pts.length; i += 6) {
          var x = pts[i], y = pts[i + 1], z = pts[i + 2];
          var nx = pts[i + 3], ny = pts[i + 4], nz = pts[i + 5];
          // вращение вокруг Y, затем наклон вокруг X
          var x1 = x * cA + z * sA, z1 = -x * sA + z * cA;
          var y2 = y * cB - z1 * sB, z2 = y * sB + z1 * cB;
          var nx1 = nx * cA + nz * sA, nz1 = -nx * sA + nz * cA;
          var ny2 = ny * cB - nz1 * sB, nz2 = ny * sB + nz1 * cB;
          var ooz = 1 / (z2 + K2);
          var sx = (cx + K1 * ooz * x1 * aspect) | 0;
          var sy = (cy - K1 * ooz * y2) | 0;
          if (sx < 0 || sy < 0 || sx >= cols || sy >= rows) continue;
          var idx = sy * cols + sx;
          if (ooz <= zbuf[idx]) continue;
          zbuf[idx] = ooz;
          var L = nx1 * lx + ny2 * ly + nz2 * lz;
          out.v[idx] = L > 0 ? 0.18 + 0.82 * L : 0.1;
        }
        for (var j = 0; j < n; j++) if (!zbuf[j] && hash01(j, 11) < 0.03) out.v[j] = 0.1;
      }
    };
  }

  // C — бинарное поле, в котором проступают K 0 D A, пока поле не заполнится
  function SceneField() {
    var th, bits;
    var DURATION = 6200;
    return {
      name: 'FIELD',
      enter: function (e) {
        var n = e.cols * e.rows;
        th = new Float32Array(n);
        bits = new Uint8Array(n);
        for (var i = 0; i < n; i++) {
          var y = (i / e.cols) | 0;
          th[i] = Math.random() * 0.75 + (1 - y / e.rows) * 0.25;
          bits[i] = Math.random() < 0.5 ? 48 : 49;
        }
      },
      frame: function (e, t, out) {
        var cols = e.cols, n = cols * e.rows;
        var p = e.still ? 0.35 : Math.pow(clamp(t / DURATION, 0, 1), 1.25);
        for (var i = 0; i < n; i++) {
          var x = i % cols, y = (i / cols) | 0;
          out.v[i] = 0;
          if (p > th[i]) {
            out.c[i] = 'K0DA'.charCodeAt((x + y) & 3);
            out.l[i] = p - th[i] < 0.035 ? 3 : 2;
          } else {
            if (!e.still && Math.random() < 0.004) bits[i] = bits[i] === 48 ? 49 : 48;
            out.c[i] = bits[i];
            out.l[i] = 1;
          }
        }
      }
    };
  }

  // D — из поля проступают слова плаката «Уход это персональный код твоей кожи»
  function SceneSlogan() {
    var groups = [['Уход', 'это'], ['персональный', 'код'], ['твоей', 'кожи']];
    var maps, reveal, bits;
    var PER = 2333;
    return {
      name: 'SLOGAN',
      enter: function (e) {
        var cols = e.cols, rows = e.rows, n = cols * rows;
        bits = new Uint8Array(n);
        reveal = new Float32Array(n);
        for (var i = 0; i < n; i++) { bits[i] = Math.random() < 0.5 ? 48 : 49; reveal[i] = Math.random(); }
        maps = groups.map(function (g) {
          var lines = g.map(function (w) { return U.codeify(w, 1); });
          return rasterize(cols, rows, function (c, S) {
            var longest = lines.reduce(function (a, b) { return a.length > b.length ? a : b; });
            var squash = e.cw / e.ch; // ячейка вытянута по вертикали — сжимаем текст
            var fs = 100;
            c.font = '600 ' + fs + 'px ' + FONT_FAMILY;
            var w = c.measureText(longest).width;
            var maxW = cols * S * 0.86;
            var maxH = rows * S * 0.62 / lines.length;
            fs = Math.min(fs * maxW / w, maxH / (squash * 1.05));
            c.font = '600 ' + fs + 'px ' + FONT_FAMILY;
            c.textBaseline = 'top';
            var lineH = fs * 1.05;
            var blockH = lineH * lines.length * squash;
            var x0 = cols * S * 0.07;
            var y0 = (rows * S - blockH) / 2;
            c.setTransform(1, 0, 0, squash, 0, y0);
            lines.forEach(function (l, k) { c.fillText(l, x0, k * lineH); });
          });
        });
      },
      frame: function (e, t, out) {
        var n = e.cols * e.rows;
        var gi = e.still ? 1 : ((t / PER) | 0) % groups.length;
        var lt = e.still ? PER / 2 : t % PER;
        var map = maps[gi];
        var inP = clamp(lt / 700, 0, 1);
        var outP = clamp((lt - (PER - 450)) / 450, 0, 1);
        for (var i = 0; i < n; i++) {
          out.v[i] = 0;
          if (!e.still && Math.random() < 0.003) bits[i] = bits[i] === 48 ? 49 : 48;
          out.c[i] = bits[i];
          var on = map[i] > 0.45 && reveal[i] < inP && reveal[i] >= outP;
          out.l[i] = on ? 3 : 1;
        }
      }
    };
  }

  /* ======================================================================
     Движок hero
     ====================================================================== */
  function Engine(host, canvas) {
    this.host = host;
    this.canvas = canvas;
    this.scenes = [SceneKoda(), SceneTorus(), SceneField(), SceneSlogan()];
    this.index = 0;
    this.mouse = null;
    this.visible = true;
    this.still = reduced();
    this.raf = 0;
    this.last = 0;
    this.sceneStart = 0;
    this.transition = null;
    this.idleTimer = 0;
    this.scroll = 0;
    var sign = document.querySelector('.site-footer__mark path');
    this.wordmarkPath = sign ? new Path2D(sign.getAttribute('d')) : null;
  }

  Engine.prototype.resize = function () {
    var r = this.host.getBoundingClientRect();
    this.w = Math.max(1, Math.round(r.width));
    this.h = Math.max(1, Math.round(r.height));
    this.ctx = setupCanvas(this.canvas, this.w, this.h);
    this.px = this.w < 640 ? 9 : this.w < 1024 ? 11 : 13; // на узких экранах — мельче ячейка, чётче буквы
    var cell = measureCell(this.ctx, this.px);
    this.cw = cell.cw; this.ch = cell.ch;
    this.cols = Math.ceil(this.w / this.cw);
    this.rows = Math.ceil(this.h / this.ch);
    var n = this.cols * this.rows;
    this.bufA = { v: new Float32Array(n), c: new Uint16Array(n), l: new Uint8Array(n) };
    this.bufB = { v: new Float32Array(n), c: new Uint16Array(n), l: new Uint8Array(n) };
    this.rand = new Float32Array(n);
    for (var i = 0; i < n; i++) this.rand[i] = hash01(i, 3);
    var self = this;
    this.scenes.forEach(function (s) { s.enter(self); });
    var nav = document.querySelector('.site-nav__bar');
    this.navH = nav ? nav.getBoundingClientRect().height : 0;
    this.ink = css('--ink') || '#1B1B19';
    this.paper = css('--paper') || '#F4F2EC';
  };

  Engine.prototype.start = function () {
    var self = this;
    this.resize();
    this.sceneStart = performance.now();
    this.render(this.sceneStart);
    if (!this.still) this.loop();
    this.armIdle();
  };

  Engine.prototype.loop = function () {
    var self = this;
    cancelAnimationFrame(this.raf);
    // до start() (ждём шрифт) холста ещё нет — наблюдатель видимости может позвать loop раньше
    if (!this.ctx || !this.visible || document.hidden || this.still) return;
    this.raf = requestAnimationFrame(function tick(now) {
      if (now - self.last >= FRAME_MS) {
        self.last = now;
        self.render(now);
      }
      if (self.visible && !document.hidden) self.raf = requestAnimationFrame(tick);
    });
  };

  Engine.prototype.armIdle = function () {
    var self = this;
    clearTimeout(this.idleTimer);
    if (this.still) return;
    this.idleTimer = setTimeout(function () { self.next(); }, 7000);
  };

  Engine.prototype.next = function () {
    var now = performance.now();
    var from = this.index;
    this.index = (this.index + 1) % this.scenes.length;
    if (this.still) {
      this.sceneStart = now;
      this.render(now);
      return;
    }
    var seed = new Float32Array(this.cols * this.rows);
    for (var i = 0; i < seed.length; i++) seed[i] = Math.random();
    this.transition = { from: from, start: now, fromStart: this.sceneStart, seed: seed };
    this.sceneStart = now + 400; // новая сцена начинает «собираться» с середины перехода
    this.armIdle();
  };

  Engine.prototype.render = function (now) {
    if (!this.ctx) return;
    var n = this.cols * this.rows;
    var out = this.bufA;
    var scene = this.scenes[this.index];
    var t = this.still ? 1e6 : now - this.sceneStart;
    var tr = this.transition;
    var i;

    if (tr) {
      var p = (now - tr.start) / 800;
      if (p >= 1) {
        this.transition = tr = null;
      } else if (p < 0.5) {
        // старая сцена разлетается от центра и рассыпается в точки
        var q = p * 2;
        this.scenes[tr.from].frame(this, now - tr.fromStart, this.bufB);
        var cx = this.cols / 2, cy = this.rows / 2, s = 1 + q * 0.6;
        for (i = 0; i < n; i++) {
          var x = i % this.cols, y = (i / this.cols) | 0;
          var sx = Math.round(cx + (x - cx) / s), sy = Math.round(cy + (y - cy) / s);
          var j = sy * this.cols + sx;
          if (tr.seed[i] < q) {
            out.v[i] = 0; out.l[i] = 0;
            out.c[i] = Math.random() < 0.6 * (1 - q) + 0.15 ? DUST.charCodeAt((Math.random() * 3) | 0) : 32;
          } else {
            out.v[i] = this.bufB.v[j]; out.c[i] = this.bufB.c[j]; out.l[i] = this.bufB.l[j];
          }
        }
      } else {
        // новая сцена собирается из шума
        var q2 = (p - 0.5) * 2;
        scene.frame(this, Math.max(0, t), this.bufB);
        for (i = 0; i < n; i++) {
          if (tr.seed[i] < q2) {
            out.v[i] = this.bufB.v[i]; out.c[i] = this.bufB.c[i]; out.l[i] = this.bufB.l[i];
          } else {
            out.v[i] = 0; out.l[i] = 0;
            out.c[i] = Math.random() < 0.25 ? NOISE.charCodeAt((Math.random() * NOISE.length) | 0) : 32;
          }
        }
      }
    }
    if (!tr) scene.frame(this, t, out);

    this.draw(out);
  };

  Engine.prototype.draw = function (buf) {
    var ctx = this.ctx, cols = this.cols, rows = this.rows;
    var cw = this.cw, ch = this.ch;
    var s = this.scroll; // 0..1 — разрежение при прокрутке
    var fontN = '400 ' + this.px + 'px ' + FONT_FAMILY;
    var fontB = '600 ' + this.px + 'px ' + FONT_FAMILY;
    ctx.fillStyle = this.paper;
    ctx.fillRect(0, 0, this.w, this.h);
    var rampMax = RAMP.length - 1;
    // полоса под шапкой остаётся чистой — меню читается поверх любой сцены
    var topRows = Math.ceil(this.navH / ch);
    var row0 = new Array(cols), row1 = new Array(cols), row2 = new Array(cols);
    var inv = [];
    for (var y = topRows; y < rows; y++) {
      var any0 = false, any1 = false, any2 = false;
      for (var x = 0; x < cols; x++) {
        var i = y * cols + x;
        var code = buf.c[i];
        var chr = code ? String.fromCharCode(code) : RAMP[clamp(Math.round(buf.v[i] * rampMax), 0, rampMax)];
        var layer = buf.l[i];
        if (s > 0 && chr !== ' ') {
          var r = this.rand[i];
          if (r < s) chr = ' ';
          else if (r < s * 1.6) { chr = r < s * 1.3 ? '.' : '·'; if (layer === 3) layer = 0; }
        }
        row0[x] = row1[x] = row2[x] = ' ';
        if (chr === ' ') continue;
        if (layer === 3) { inv.push(x, y, chr); continue; }
        if (layer === 1) { row1[x] = chr; any1 = true; }
        else if (layer === 2) { row2[x] = chr; any2 = true; }
        else { row0[x] = chr; any0 = true; }
      }
      var py = y * ch + (ch - this.px) / 2;
      ctx.fillStyle = this.ink;
      if (any0) { ctx.font = fontN; ctx.globalAlpha = 1; ctx.fillText(row0.join(''), 0, py); }
      if (any2) { ctx.font = fontB; ctx.globalAlpha = 1; ctx.fillText(row2.join(''), 0, py); }
      if (any1) { ctx.font = fontN; ctx.globalAlpha = 0.3; ctx.fillText(row1.join(''), 0, py); }
    }
    ctx.globalAlpha = 1;
    if (inv.length) {
      ctx.fillStyle = this.ink;
      for (var k = 0; k < inv.length; k += 3) ctx.fillRect(inv[k] * cw, inv[k + 1] * ch, Math.ceil(cw), ch);
      ctx.fillStyle = this.paper;
      ctx.font = fontN;
      for (k = 0; k < inv.length; k += 3) ctx.fillText(inv[k + 2], inv[k] * cw, inv[k + 1] * ch + (ch - this.px) / 2);
    }
  };

  function initHero() {
    var host = document.querySelector('[data-hero]');
    if (!host) return;
    var canvas = host.querySelector('canvas');
    var engine = new Engine(host, canvas);

    fontReady(13).then(function () {
      engine.start();
      host.classList.add('is-ready');
    });

    host.addEventListener('click', function (e) {
      if (e.target.closest('a, button')) return;
      engine.next();
    });
    host.addEventListener('pointermove', function (e) {
      var r = canvas.getBoundingClientRect();
      engine.mouse = { x: e.clientX - r.left, y: e.clientY - r.top };
      if (e.pointerType === 'mouse') engine.armIdle();
    });
    host.addEventListener('pointerleave', function () { engine.mouse = null; });

    // Пауза вне вьюпорта и на скрытой вкладке
    if ('IntersectionObserver' in root) {
      new IntersectionObserver(function (entries) {
        engine.visible = entries[0].isIntersecting;
        if (engine.visible) engine.loop(); else cancelAnimationFrame(engine.raf);
      }).observe(host);
    }
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) engine.loop();
    });

    // Прокрутка: символы разрежаются до точек и уходят
    var onScroll = function () {
      var s = clamp(root.scrollY / (engine.h * 0.85 || 1), 0, 1);
      if (s !== engine.scroll) {
        engine.scroll = s;
        if (engine.still && engine.ctx) engine.render(performance.now());
      }
    };
    root.addEventListener('scroll', onScroll, { passive: true });

    var resizeTimer = 0;
    var lastW = root.innerWidth;
    root.addEventListener('resize', function () {
      // на мобильных адресная строка меняет высоту — пересчитываем только при смене ширины
      if (root.innerWidth === lastW && engine.ctx) return;
      lastW = root.innerWidth;
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        engine.resize();
        engine.render(performance.now());
      }, 150);
    });
  }

  /* ======================================================================
     Бинарное поле для кодовых секций: цифры --ink на --plum, изредка
     проступают K 0 D A цветом --paper. 8 fps, пауза вне вьюпорта.
     opts: { fg, hi — имена токенов цвета; alpha — прозрачность цифр }
     ====================================================================== */
  function codeField(canvas, opts) {
    opts = opts || {};
    var host = canvas.parentElement;
    var state = { visible: false, timer: 0 };
    var ctx, cols, rows, cw, ch, px, bits, letters, w, h;

    function build() {
      var r = host.getBoundingClientRect();
      w = Math.round(r.width); h = Math.round(r.height);
      ctx = setupCanvas(canvas, w, h);
      px = w < 640 ? 13 : 16;
      var cell = measureCell(ctx, px);
      cw = cell.cw; ch = Math.round(px * 1.35);
      cols = Math.ceil(w / cw); rows = Math.ceil(h / ch);
      bits = new Uint8Array(cols * rows);
      letters = new Uint8Array(cols * rows);
      for (var i = 0; i < bits.length; i++) {
        bits[i] = Math.random() < 0.5 ? 48 : 49;
        letters[i] = hash01(i, 5) < 0.025 ? 1 : 0;
      }
    }

    function draw() {
      var ink = css(opts.fg || '--ink'), paper = css(opts.hi || '--paper');
      ctx.clearRect(0, 0, w, h);
      ctx.font = '400 ' + px + 'px ' + FONT_FAMILY;
      var dim = [], hi = [];
      for (var y = 0; y < rows; y++) {
        var line = '';
        for (var x = 0; x < cols; x++) {
          var i = y * cols + x;
          if (letters[i]) { line += ' '; hi.push(x, y, 'K0DA'.charAt((x + y) & 3)); }
          else line += String.fromCharCode(bits[i]);
        }
        dim.push(line);
      }
      ctx.fillStyle = ink;
      ctx.globalAlpha = opts.alpha || 0.55;
      for (var r = 0; r < dim.length; r++) ctx.fillText(dim[r], 0, r * ch + (ch - px) / 2);
      ctx.globalAlpha = 1;
      ctx.fillStyle = paper;
      for (var k = 0; k < hi.length; k += 3) ctx.fillText(hi[k + 2], hi[k] * cw, hi[k + 1] * ch + (ch - px) / 2);
    }

    function step() {
      clearTimeout(state.timer);
      if (!state.visible || document.hidden || reduced()) return;
      for (var k = 0; k < bits.length * 0.01; k++) {
        var i = (Math.random() * bits.length) | 0;
        bits[i] = bits[i] === 48 ? 49 : 48;
        if (Math.random() < 0.08) letters[i] = letters[i] ? 0 : (Math.random() < 0.3 ? 1 : 0);
      }
      draw();
      state.timer = setTimeout(step, 125);
    }

    fontReady(px || 16).then(function () {
      build(); draw();
      if ('IntersectionObserver' in root) {
        new IntersectionObserver(function (en) {
          state.visible = en[0].isIntersecting;
          step();
        }).observe(host);
      }
      document.addEventListener('visibilitychange', step);
      var lastW = root.innerWidth;
      root.addEventListener('resize', function () {
        if (root.innerWidth === lastW) return;
        lastW = root.innerWidth;
        build(); draw();
      });
    });
  }

  /* ======================================================================
     ASCII-портрет: силуэт головы и плеч, свет сверху-слева, --olive-900 на --stone
     ====================================================================== */
  function asciiPortrait(canvas, seed) {
    var host = canvas.parentElement;
    var rnd = U.mulberry32(U.hash(String(seed || 'koda')));
    var hx = 0.5 + (rnd() - 0.5) * 0.05, hy = 0.4 + (rnd() - 0.5) * 0.03;
    var hr = 0.2 + rnd() * 0.025, hh = 0.25 + rnd() * 0.025;
    var hair = rnd();

    function shade(nx, ny) {
      // псевдонормаль эллипса → Ламберт
      var nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
      return clamp(-0.5 * nx - 0.55 * ny + 0.67 * nz, 0, 1);
    }

    function value(u, v) {
      var dx = (u - hx) / hr, dy = (v - hy) / hh;
      var d = dx * dx + dy * dy;
      if (d < 1) return 0.25 + 0.75 * shade(dx, dy);
      var hdx = (u - hx) / (hr * 1.12), hdy = (v - hy + hh * 0.18) / (hh * 1.02);
      if (hair > 0.4 && hdx * hdx + hdy * hdy < 1 && v < hy) return 0.15 + 0.35 * shade(hdx, hdy);
      // шея — короткая, с тенью под подбородком
      if (Math.abs(u - hx) < hr * 0.45 && v > hy && v < hy + hh + 0.06) return 0.18 + 0.2 * Math.abs(u - hx) / (hr * 0.45);
      var sdx = (u - 0.5) / 0.5, sdy = (v - 1.02) / 0.32;
      var sd = sdx * sdx + sdy * sdy;
      if (sd < 1) return 0.2 + 0.7 * shade(sdx, sdy);
      return 0;
    }

    function draw() {
      var r = host.getBoundingClientRect();
      var w = Math.round(r.width), h = Math.round(r.height);
      if (!w || !h) return;
      var ctx = setupCanvas(canvas, w, h);
      var px = w < 240 ? 9 : 11;
      var cell = measureCell(ctx, px);
      var cols = Math.ceil(w / cell.cw), rows = Math.ceil(h / cell.ch);
      ctx.fillStyle = css('--stone');
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = css('--olive-900');
      ctx.font = '400 ' + px + 'px ' + FONT_FAMILY;
      var max = RAMP.length - 1;
      for (var y = 0; y < rows; y++) {
        var line = '';
        for (var x = 0; x < cols; x++) {
          var v = value((x + 0.5) / cols, (y + 0.5) / rows);
          if (v === 0 && hash01(y * cols + x, 9) < 0.03) v = 0.1;
          line += RAMP[clamp(Math.round(v * max), 0, max)];
        }
        ctx.fillText(line, 0, y * cell.ch + (cell.ch - px) / 2);
      }
    }

    fontReady(11).then(draw);
    var lastW = root.innerWidth;
    root.addEventListener('resize', function () {
      if (root.innerWidth === lastW) return;
      lastW = root.innerWidth;
      draw();
    });
  }

  root.KODA_UTIL = Object.assign(root.KODA_UTIL || {}, {
    initHero: initHero,
    codeField: codeField,
    asciiPortrait: asciiPortrait,
    asciiRamp: RAMP,
    measureCell: measureCell,
    setupCanvas: setupCanvas,
    fontReady: fontReady
  });
})(window);
