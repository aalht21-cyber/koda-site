/* ==========================================================================
   lab-scene — fallback-сцена конфигуратора на Canvas (когда ролика нет).
   Молочный фон, линия стола с мягкой тенью, стеклянная колба (контур 1.5px
   --ink с бликами), жидкость, цвет которой плавно (1.2 с, OKLab) меняется.
   Режимы: idle · flask-in · flask-idle · prep (grind | pipette | pour | melt |
   powder | extract) · stir · final · fill · result.
   Разовые режимы возвращают Promise, который выполняется по окончании.
   Также здесь — цветовые утилиты OKLab (смешивание, расстояние).
   ========================================================================== */
(function (root) {
  'use strict';

  var U = root.KODA_UTIL;

  /* --- OKLab ---------------------------------------------------------------- */
  function hexToRgb(hex) {
    var h = hex.replace('#', '');
    if (h.length === 3) h = h.replace(/./g, '$&$&');
    var n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function srgbToLin(c) { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
  function linToSrgb(c) { var v = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055; return Math.round(Math.max(0, Math.min(1, v)) * 255); }
  function toOklab(hex) {
    var rgb = hexToRgb(hex).map(srgbToLin);
    var l = 0.4122214708 * rgb[0] + 0.5363325363 * rgb[1] + 0.0514459929 * rgb[2];
    var m = 0.2119034982 * rgb[0] + 0.6806995451 * rgb[1] + 0.1073969566 * rgb[2];
    var s = 0.0883024619 * rgb[0] + 0.2817188376 * rgb[1] + 0.6299787005 * rgb[2];
    l = Math.cbrt(l); m = Math.cbrt(m); s = Math.cbrt(s);
    return [
      0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
      1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
      0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s
    ];
  }
  function fromOklab(lab) {
    var l = lab[0] + 0.3963377774 * lab[1] + 0.2158037573 * lab[2];
    var m = lab[0] - 0.1055613458 * lab[1] - 0.0638541728 * lab[2];
    var s = lab[0] - 0.0894841775 * lab[1] - 1.2914855480 * lab[2];
    l = l * l * l; m = m * m * m; s = s * s * s;
    return [
      linToSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
      linToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
      linToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s)
    ];
  }
  function mixOklab(hexes) {
    var acc = [0, 0, 0];
    hexes.forEach(function (h) { var o = toOklab(h); acc[0] += o[0]; acc[1] += o[1]; acc[2] += o[2]; });
    return acc.map(function (v) { return v / hexes.length; });
  }
  function labDist(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); }
  function lerpLab(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
  function rgbStr(rgb, a) { return 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',' + (a == null ? 1 : a) + ')'; }

  /* --- Помощники рисования ------------------------------------------------- */
  function css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function ease(t) { t = clamp(t, 0, 1); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function easeOut(t) { t = clamp(t, 0, 1); return 1 - Math.pow(1 - t, 3); }
  function seg(t, a, b) { return clamp((t - a) / (b - a), 0, 1); }

  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /* ======================================================================
     Сцена
     ====================================================================== */
  function LabScene(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.mode = 'idle';
    this.modeStart = 0;
    this.duration = 0;
    this.resolve = null;
    this.raf = 0;
    this.running = false;
    this.packaging = 'mask-jar';
    this.productType = 'mask';
    // жидкость в колбе
    this.level = 0;          // 0..1 доля высоты корпуса
    this.levelTarget = 0;
    this.color = toOklab('#F3F1EC');
    this.colorFrom = this.color;
    this.colorTo = this.color;
    this.colorStart = 0;
    this.opacity = 0.45;
    this.particles = [];
    this.grainy = false;     // пилинг — взвесь частиц
    this.zoom = 1;
    this.prep = 'pipette';
    this.dust = [];
    for (var i = 0; i < 26; i++) this.dust.push({ x: Math.random(), y: Math.random() * 0.7, r: 0.6 + Math.random() * 1.2, p: Math.random() * 6 });
    this.reduced = U.reducedMotion();
    this.resize();
    var self = this;
    root.addEventListener('resize', function () { self.resize(); self.drawOnce(); });
  }

  LabScene.prototype.resize = function () {
    var r = this.canvas.getBoundingClientRect();
    this.w = Math.max(1, Math.round(r.width));
    this.h = Math.max(1, Math.round(r.height));
    this.ctx = U.setupCanvas(this.canvas, this.w, this.h);
    this.ink = css('--ink'); this.paper = css('--paper'); this.silver = css('--silver');
    this.stone = css('--stone'); this.line = css('--line'); this.ink2 = css('--ink-2');
  };

  // Цвет формулы плавно переходит к новому за 1.2 с (интерполяция в OKLab)
  LabScene.prototype.setLiquid = function (hexes, level, opts) {
    opts = opts || {};
    this.colorFrom = this.currentColor(performance.now());
    this.colorTo = mixOklab(hexes);
    this.colorStart = performance.now();
    if (level != null) this.levelTarget = level;
    if (opts.opacity != null) this.opacity = opts.opacity;
    if (opts.grainy != null) this.grainy = opts.grainy;
  };
  LabScene.prototype.currentColor = function (now) {
    var t = this.reduced ? 1 : ease((now - this.colorStart) / 1200);
    return lerpLab(this.colorFrom, this.colorTo, t);
  };

  // Запуск режима. Разовые режимы → Promise по окончании; циклы → сразу.
  LabScene.prototype.play = function (mode, opts) {
    opts = opts || {};
    var self = this;
    if (this.resolve) { var r = this.resolve; this.resolve = null; r(); }
    this.mode = mode;
    this.prep = opts.prep || this.prep;
    this.modeStart = performance.now();
    var durations = { 'flask-in': 2200, prep: 3800, final: 4600, fill: 4800 };
    this.duration = durations[mode] || 0;
    this.particles = [];
    this.start();
    if (!this.duration) return Promise.resolve();
    if (this.reduced) {
      this.finishInstant();
      return Promise.resolve();
    }
    return new Promise(function (res) { self.resolve = res; });
  };

  LabScene.prototype.finishInstant = function () {
    this.level = this.levelTarget;
    this.colorStart = 0;
    this.drawOnce();
  };

  LabScene.prototype.start = function () {
    var self = this;
    if (this.running) return;
    this.running = true;
    var tick = function (now) {
      if (!self.running) return;
      self.frame(now);
      self.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  };
  LabScene.prototype.stop = function () {
    this.running = false;
    cancelAnimationFrame(this.raf);
  };
  LabScene.prototype.drawOnce = function () { this.frame(performance.now(), true); };

  LabScene.prototype.frame = function (now, still) {
    var t = now - this.modeStart;
    var p = this.duration ? clamp(t / this.duration, 0, 1) : 0;
    if (this.reduced) { p = 1; t = 1e5; }
    // уровень жидкости догоняет цель
    this.level += (this.levelTarget - this.level) * (this.reduced ? 1 : 0.04);

    var ctx = this.ctx, w = this.w, h = this.h;
    ctx.clearRect(0, 0, w, h);

    // геометрия: стол на 74% высоты, колба по центру
    var tableY = h * 0.74;
    var H = Math.min(h * 0.42, w * 0.32);
    var cx = w / 2;

    // «камера»: приближение при финальном смешивании, наезд при появлении колбы
    var zoom = 1;
    if (this.mode === 'final') zoom = 1 + 0.15 * ease(p);
    if (this.mode === 'fill') zoom = 1.15 - 0.15 * ease(seg(p, 0, 0.3));
    if (this.mode === 'flask-in') zoom = 0.86 + 0.14 * ease(p);
    ctx.save();
    ctx.translate(cx, tableY - H * 0.45);
    ctx.scale(zoom, zoom);
    ctx.translate(-cx, -(tableY - H * 0.45));

    this.drawTable(tableY, w);
    this.drawDust(now, tableY);

    var color = this.currentColor(now);
    var rgb = fromOklab(color);

    if (this.mode === 'idle') {
      // пустой стол
    } else if (this.mode === 'fill' || this.mode === 'result') {
      var fp = this.mode === 'result' ? 1 : p;
      if (this.mode === 'fill' && fp < 0.3) this.drawFlaskGroup(cx, tableY, H, rgb, now, { alpha: 1 - seg(fp, 0.05, 0.28), stir: true });
      this.drawContainer(cx, tableY, H, rgb, now, fp, this.mode === 'result');
    } else {
      var alpha = this.mode === 'flask-in' ? ease(seg(p, 0, 0.7)) : 1;
      var stir = this.mode === 'stir' || this.mode === 'final' || (this.mode === 'prep' && p > 0.86);
      this.drawFlaskGroup(cx, tableY, H, rgb, now, { alpha: alpha, stir: stir, fast: this.mode === 'final' && p < 0.7, highlight: this.mode === 'final' ? p : -1 });
      if (this.mode === 'prep') this.drawPrep(this.prep, p, cx, tableY, H, rgb, now);
    }
    this.drawParticles(now);
    ctx.restore();

    if (this.duration && p >= 1 && this.resolve && !still) {
      var r = this.resolve; this.resolve = null; r();
    }
  };

  /* --- Стол, пыль ---------------------------------------------------------- */
  LabScene.prototype.drawTable = function (y, w) {
    var ctx = this.ctx;
    var g = ctx.createLinearGradient(0, y, 0, y + this.h * 0.12);
    g.addColorStop(0, 'rgba(27,27,25,0.07)');
    g.addColorStop(1, 'rgba(27,27,25,0)');
    ctx.fillStyle = g;
    ctx.fillRect(-w, y, w * 3, this.h * 0.12);
    ctx.fillStyle = this.ink;
    ctx.globalAlpha = 0.35;
    ctx.fillRect(-w, y, w * 3, 1);
    ctx.globalAlpha = 1;
  };
  LabScene.prototype.drawDust = function (now, tableY) {
    if (this.reduced) return;
    var ctx = this.ctx;
    ctx.fillStyle = this.ink;
    this.dust.forEach(function (d) {
      var x = (d.x + Math.sin(now * 0.00012 + d.p) * 0.02) * this.w;
      var y = (d.y + ((now * 0.000006 + d.p) % 0.08)) * tableY;
      ctx.globalAlpha = 0.08 + 0.06 * Math.sin(now * 0.0008 + d.p);
      ctx.beginPath(); ctx.arc(x, y, d.r, 0, Math.PI * 2); ctx.fill();
    }, this);
    ctx.globalAlpha = 1;
  };
  LabScene.prototype.softShadow = function (cx, y, rx) {
    var ctx = this.ctx;
    var g = ctx.createRadialGradient(cx, y, 0, cx, y, rx);
    g.addColorStop(0, 'rgba(27,27,25,0.14)');
    g.addColorStop(1, 'rgba(27,27,25,0)');
    ctx.fillStyle = g;
    ctx.save(); ctx.translate(cx, y); ctx.scale(1, 0.18); ctx.translate(-cx, -y);
    ctx.beginPath(); ctx.arc(cx, y, rx, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  };

  /* --- Колба Эрленмейера --------------------------------------------------- */
  LabScene.prototype.flaskPath = function (cx, bottom, H) {
    var ctx = this.ctx;
    var nw = H * 0.22, bw = H * 0.74, neck = H * 0.34, r = H * 0.07;
    var top = bottom - H;
    ctx.beginPath();
    ctx.moveTo(cx - nw / 2 - H * 0.02, top);
    ctx.lineTo(cx - nw / 2, top + H * 0.03);
    ctx.lineTo(cx - nw / 2, top + neck);
    ctx.lineTo(cx - bw / 2 + r * 0.4, bottom - r);
    ctx.quadraticCurveTo(cx - bw / 2, bottom, cx - bw / 2 + r, bottom);
    ctx.lineTo(cx + bw / 2 - r, bottom);
    ctx.quadraticCurveTo(cx + bw / 2, bottom, cx + bw / 2 - r * 0.4, bottom - r);
    ctx.lineTo(cx + nw / 2, top + neck);
    ctx.lineTo(cx + nw / 2, top + H * 0.03);
    ctx.lineTo(cx + nw / 2 + H * 0.02, top);
  };

  LabScene.prototype.drawFlaskGroup = function (cx, tableY, H, rgb, now, o) {
    var ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = o.alpha == null ? 1 : o.alpha;
    // мешалка-плита
    var plateH = H * 0.08, plateW = H * 0.9;
    this.softShadow(cx, tableY, plateW * 0.7);
    roundRect(ctx, cx - plateW / 2, tableY - plateH, plateW, plateH, plateH * 0.35);
    ctx.fillStyle = this.silver; ctx.fill();
    ctx.strokeStyle = 'rgba(27,27,25,0.35)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(cx - plateW / 2 + plateH * 0.4, tableY - plateH + 2, plateW - plateH * 0.8, 1.5);

    var bottom = tableY - plateH;
    // жидкость
    if (this.level > 0.002) {
      ctx.save();
      this.flaskPath(cx, bottom - 1, H - 2);
      ctx.clip();
      var bodyH = H * 0.66;
      var lvlY = bottom - bodyH * clamp(this.level, 0, 1.25);
      var amp = o.stir ? (o.fast ? 5 : 3) : 0.8;
      var k = o.stir ? 0.035 : 0.02;
      ctx.beginPath();
      ctx.moveTo(cx - H, bottom + 2);
      for (var x = -H; x <= H; x += 4) {
        var yy = lvlY + Math.sin((x * k) + now * (o.stir ? 0.006 : 0.0012)) * amp;
        // воронка при вращении
        if (o.stir) yy += Math.exp(-(x * x) / (H * H * 0.02)) * amp * 2.2;
        ctx.lineTo(cx + x, yy);
      }
      ctx.lineTo(cx + H, bottom + 2);
      ctx.closePath();
      ctx.fillStyle = rgbStr(rgb, this.opacity);
      ctx.fill();
      // светлая полоса у поверхности и «молочная» глубина
      var g = ctx.createLinearGradient(0, lvlY, 0, bottom);
      g.addColorStop(0, 'rgba(255,255,255,0.35)');
      g.addColorStop(0.15, 'rgba(255,255,255,0.05)');
      g.addColorStop(1, 'rgba(27,27,25,0.06)');
      ctx.fillStyle = g;
      ctx.fill();
      // финальный блик скользит по поверхности
      if (o.highlight >= 0) {
        var hx = cx - H * 0.4 + H * 0.8 * ease(o.highlight);
        var hg = ctx.createRadialGradient(hx, lvlY + 6, 0, hx, lvlY + 6, H * 0.18);
        hg.addColorStop(0, 'rgba(255,255,255,0.55)');
        hg.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = hg;
        ctx.fillRect(cx - H, lvlY - H * 0.2, H * 2, H * 0.4);
      }
      // взвесь частиц (пилинг)
      if (this.grainy) {
        ctx.fillStyle = rgbStr(fromOklab(lerpLab(toOklab('#5A4636'), this.currentColor(now), 0.4)), 0.55);
        for (var i = 0; i < 90; i++) {
          var px = cx + Math.sin(i * 12.9898 + (o.stir ? now * 0.0011 : 0)) * H * 0.33;
          var py = lvlY + 8 + ((i * 37.7) % (bottom - lvlY - 10));
          ctx.fillRect(px, py, 1.6, 1.6);
        }
      }
      // магнитная мешалка
      var ang = o.stir ? now * (o.fast ? 0.02 : 0.01) : 0.4;
      var bl = H * 0.16, bh = H * 0.035;
      ctx.save();
      ctx.translate(cx, bottom - bh * 1.2);
      ctx.scale(Math.cos(ang), 1);
      roundRect(ctx, -bl / 2, -bh / 2, bl, bh, bh / 2);
      ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.fill();
      ctx.strokeStyle = 'rgba(27,27,25,0.25)'; ctx.stroke();
      ctx.restore();
      ctx.restore();
    }
    // стекло
    this.flaskPath(cx, bottom, H);
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = this.ink;
    ctx.globalAlpha *= 0.85;
    ctx.stroke();
    // блики
    ctx.globalAlpha = (o.alpha == null ? 1 : o.alpha) * 0.7;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - H * 0.085, bottom - H * 0.9);
    ctx.lineTo(cx - H * 0.085, bottom - H * 0.68);
    ctx.moveTo(cx - H * 0.21, bottom - H * 0.5);
    ctx.lineTo(cx - H * 0.3, bottom - H * 0.16);
    ctx.stroke();
    ctx.restore();
  };

  /* --- Подготовка ингредиентов --------------------------------------------- */
  LabScene.prototype.surfaceY = function (tableY, H) {
    var bottom = tableY - H * 0.08;
    return bottom - H * 0.66 * clamp(this.level, 0, 1.2);
  };
  LabScene.prototype.mouth = function (cx, tableY, H) { return { x: cx, y: tableY - H * 0.08 - H }; };

  LabScene.prototype.spawn = function (x, y, n, o) {
    for (var i = 0; i < n; i++) {
      this.particles.push({
        x: x + (Math.random() - 0.5) * (o.spread || 6), y: y,
        vx: (Math.random() - 0.5) * (o.vx || 0.4), vy: (o.vy || 1) * (0.6 + Math.random() * 0.8),
        r: (o.r || 1.4) * (0.5 + Math.random()), c: o.color || this.ink, life: 1, floor: o.floor, drag: o.drag || 0.995
      });
    }
  };
  LabScene.prototype.drawParticles = function () {
    var ctx = this.ctx;
    var alive = [];
    for (var i = 0; i < this.particles.length; i++) {
      var q = this.particles[i];
      q.vy += 0.05; q.vx *= q.drag; q.vy *= q.drag;
      q.x += q.vx; q.y += q.vy;
      if (q.floor && q.y > q.floor) { q.y = q.floor; q.vy *= 0.2; q.life -= 0.03; } // растворяется в формуле
      if (q.life <= 0) continue;
      ctx.globalAlpha = Math.max(0, q.life) * 0.85;
      ctx.fillStyle = q.c;
      ctx.beginPath(); ctx.arc(q.x, q.y, q.r, 0, Math.PI * 2); ctx.fill();
      alive.push(q);
    }
    ctx.globalAlpha = 1;
    this.particles = alive;
  };

  LabScene.prototype.drawPrep = function (kind, p, cx, tableY, H, rgb, now) {
    var ctx = this.ctx;
    var m = this.mouth(cx, tableY, H);
    var surf = this.surfaceY(tableY, H);
    var tint = rgbStr(fromOklab(this.colorTo), 1);
    var self = this;
    ctx.save();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = this.ink;

    function spatula(x, y, ang, load) {
      ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
      ctx.fillStyle = self.silver;
      roundRect(ctx, -H * 0.42, -H * 0.012, H * 0.36, H * 0.024, 3); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(0, 0, H * 0.07, H * 0.028, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      if (load) { ctx.fillStyle = load.c; ctx.beginPath(); ctx.ellipse(0, -H * 0.02, H * 0.05 * load.s, H * 0.03 * load.s, 0, Math.PI, 0); ctx.fill(); }
      ctx.restore();
    }
    function pipette(x, tipY) {
      ctx.save();
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      roundRect(ctx, x - H * 0.025, tipY - H * 0.42, H * 0.05, H * 0.4, 4); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x - H * 0.012, tipY - H * 0.02); ctx.lineTo(x, tipY); ctx.lineTo(x + H * 0.012, tipY - H * 0.02); ctx.stroke();
      ctx.fillStyle = '#FFFFFF';
      roundRect(ctx, x - H * 0.04, tipY - H * 0.56, H * 0.08, H * 0.15, H * 0.04); ctx.fill(); ctx.stroke();
      ctx.restore();
    }
    function drop(x, y, stretch) {
      ctx.fillStyle = tint;
      ctx.globalAlpha = 0.9;
      ctx.beginPath(); ctx.ellipse(x, y, H * 0.012, H * 0.012 * (1 + stretch), 0, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    }
    function ring(x, y, q) {
      if (q <= 0 || q >= 1) return;
      ctx.globalAlpha = 1 - q;
      ctx.beginPath(); ctx.ellipse(x, y, H * 0.02 + H * 0.12 * q, (H * 0.02 + H * 0.12 * q) * 0.25, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1;
    }

    if (kind === 'pipette') {
      // пипетка опускается, три капли тянутся, отрываются и дают кольцо на поверхности
      var dy = easeOut(seg(p, 0, 0.25)) - ease(seg(p, 0.85, 1));
      var tipY = m.y - H * 0.35 + H * 0.3 * dy;
      pipette(m.x, tipY);
      [0.32, 0.5, 0.68].forEach(function (t0) {
        var q = seg(p, t0, t0 + 0.12);
        if (q <= 0) return;
        if (q < 0.4) drop(m.x, tipY + H * 0.012 * (1 + q * 2), q * 2.5);
        else if (q < 0.85) drop(m.x, tipY + (surf - tipY) * ease((q - 0.4) / 0.45), 0.6);
        ring(m.x, surf, (q - 0.85) / 0.15 + (q >= 1 ? 1 : 0));
        var after = seg(p, t0 + 0.12, t0 + 0.24);
        ring(m.x, surf, after);
      });
    } else if (kind === 'grind') {
      // мельница слева: зёрна перемалываются, шпатель переносит пудру в колбу
      var gx = cx - H * 0.95, gb = tableY;
      ctx.fillStyle = this.silver;
      roundRect(ctx, gx - H * 0.13, gb - H * 0.1, H * 0.26, H * 0.1, 4); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      roundRect(ctx, gx - H * 0.1, gb - H * 0.44, H * 0.2, H * 0.34, 6); ctx.fill(); ctx.stroke();
      var gp = seg(p, 0, 0.45);
      for (var i = 0; i < 26; i++) {
        var gr = (1 - gp * 0.75) * H * 0.018;
        var jx = Math.sin(now * 0.04 + i) * (gp > 0 && gp < 1 ? 2 : 0);
        ctx.fillStyle = tint;
        ctx.beginPath();
        ctx.arc(gx - H * 0.07 + (i % 6) * H * 0.028 + jx, gb - H * 0.13 - Math.floor(i / 6) * H * 0.03, Math.max(1, gr), 0, Math.PI * 2);
        ctx.fill();
      }
      var sp = ease(seg(p, 0.45, 0.72));
      var sx = gx + (m.x - H * 0.05 - gx) * sp, sy = gb - H * 0.5 + (m.y - H * 0.08 - (gb - H * 0.5)) * sp - Math.sin(sp * Math.PI) * H * 0.2;
      var tilt = seg(p, 0.72, 0.8) * 0.6;
      if (p > 0.42 && p < 0.95) spatula(sx, sy, tilt, p < 0.78 ? { c: tint, s: 1 } : null);
      if (p > 0.74 && p < 0.84 && !this.reduced) this.spawn(m.x, m.y - H * 0.04, 6, { color: tint, floor: surf, r: 1.2, spread: H * 0.06 });
    } else if (kind === 'pour') {
      // дозатор наклоняется, вязкая струя с утончением, уровень растёт
      var bx = cx - H * 0.45, by = m.y - H * 0.28;
      var tiltP = ease(seg(p, 0, 0.25)) - ease(seg(p, 0.8, 1));
      ctx.save(); ctx.translate(bx, by); ctx.rotate(tiltP * 1.0);
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      roundRect(ctx, -H * 0.1, -H * 0.22, H * 0.2, H * 0.22, 5); ctx.fill(); ctx.stroke();
      ctx.fillStyle = rgbStr(fromOklab(this.colorTo), 0.75);
      ctx.fillRect(-H * 0.09, -H * 0.12 + tiltP * H * 0.04, H * 0.18, H * 0.11 - tiltP * H * 0.04);
      ctx.restore();
      var sp2 = seg(p, 0.22, 0.82);
      if (sp2 > 0 && sp2 < 1) {
        var x0 = bx + H * 0.1, y0 = by - H * 0.05;
        var wv = Math.sin(sp2 * Math.PI);
        ctx.strokeStyle = rgbStr(fromOklab(this.colorTo), 0.85);
        ctx.lineCap = 'round';
        for (var s = 0; s < 8; s++) {
          var t1 = s / 8, t2 = (s + 1) / 8;
          ctx.lineWidth = (H * 0.022) * wv * (1 - t1 * 0.6);
          ctx.beginPath();
          ctx.moveTo(x0 + (m.x - x0) * t1 + Math.sin(now * 0.01 + t1 * 6) * 1.2, y0 + (surf - y0) * t1 * t1);
          ctx.lineTo(x0 + (m.x - x0) * t2 + Math.sin(now * 0.01 + t2 * 6) * 1.2, y0 + (surf - y0) * t2 * t2);
          ctx.stroke();
        }
      }
    } else if (kind === 'melt') {
      // плотный баттер на шпателе плавится, стекает и растворяется разводами
      var mx = m.x - H * 0.12, my = m.y - H * 0.12;
      spatula(mx + H * 0.1, my, 0.25 * ease(seg(p, 0.45, 0.6)), null);
      var melt = ease(seg(p, 0.05, 0.5));
      var slide = ease(seg(p, 0.5, 0.78));
      var bxm = mx + H * 0.1, bym = my - H * 0.03 + slide * (surf - my);
      if (p < 0.82) {
        ctx.fillStyle = tint;
        ctx.globalAlpha = 0.95;
        ctx.beginPath();
        ctx.ellipse(bxm, bym, H * 0.07 * (1 + melt * 0.3) * (1 - slide * 0.5), H * 0.05 * (1 - melt * 0.35) + slide * H * 0.03, 0, 0, Math.PI * 2);
        ctx.fill();
        if (melt > 0.4 && slide < 1) {
          ctx.beginPath(); ctx.ellipse(bxm + H * 0.05, bym + H * 0.05 * melt, H * 0.015, H * 0.025 * melt, 0, 0, Math.PI * 2); ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
      var sw = seg(p, 0.75, 1);
      if (sw > 0 && sw < 1) {
        ctx.strokeStyle = 'rgba(255,255,255,' + (0.6 * (1 - sw)) + ')';
        ctx.lineWidth = 2;
        for (var k = 0; k < 3; k++) {
          ctx.beginPath();
          ctx.ellipse(m.x, surf + H * 0.05 + k * H * 0.04, H * (0.06 + sw * 0.18 - k * 0.03), H * 0.012, now * 0.002 + k, 0, Math.PI * 1.3);
          ctx.stroke();
        }
      }
    } else if (kind === 'powder') {
      // порошок дозируется со шпателя облачком частиц
      var shake = p > 0.25 && p < 0.65 ? Math.sin(now * 0.05) * 2 : 0;
      spatula(m.x + H * 0.03, m.y - H * 0.06 + shake, 0.15 + 0.35 * seg(p, 0.2, 0.4), p < 0.6 ? { c: tint, s: 1 - seg(p, 0.3, 0.6) } : null);
      if (p > 0.3 && p < 0.65 && !this.reduced) this.spawn(m.x, m.y - H * 0.03, 4, { color: tint, floor: surf, r: 1.6, spread: H * 0.1, vy: 0.5, drag: 0.97 });
    } else if (kind === 'extract') {
      // листья в стакане, жидкость окрашивается, пипетка переносит капли в колбу
      var ex = cx - H * 0.95;
      var tintP = ease(seg(p, 0, 0.4));
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      roundRect(ctx, ex - H * 0.12, tableY - H * 0.3, H * 0.24, H * 0.3, 5); ctx.fill(); ctx.stroke();
      ctx.fillStyle = rgbStr(fromOklab(lerpLab(toOklab('#F3F1EC'), this.colorTo, tintP)), 0.6);
      ctx.fillRect(ex - H * 0.11, tableY - H * 0.2, H * 0.22, H * 0.19);
      for (var l = 0; l < 5; l++) {
        ctx.fillStyle = rgbStr(fromOklab(lerpLab(this.colorTo, toOklab('#707850'), 0.35)), 0.8);
        ctx.beginPath();
        ctx.ellipse(ex - H * 0.07 + l * H * 0.035, tableY - H * 0.12 + Math.sin(l * 2 + now * 0.002) * 2, H * 0.03, H * 0.012, l, 0, Math.PI * 2);
        ctx.fill();
      }
      var mv = ease(seg(p, 0.42, 0.62));
      var px2 = ex + (m.x - ex) * mv;
      var tip = (tableY - H * 0.18) + ((m.y - H * 0.05) - (tableY - H * 0.18)) * mv - Math.sin(mv * Math.PI) * H * 0.35;
      if (p > 0.35 && p < 0.95) pipette(px2, tip);
      [0.66, 0.76, 0.86].forEach(function (t0) {
        var q = seg(p, t0, t0 + 0.08);
        if (q > 0 && q < 1) drop(m.x, tip + (surf - tip) * ease(q), 0.5);
        ring(m.x, surf, seg(p, t0 + 0.08, t0 + 0.16));
      });
    }
    ctx.restore();
  };

  /* --- Тара: банка, флакон с пипеткой, туба -------------------------------- */
  LabScene.prototype.drawContainer = function (cx, tableY, H, rgb, now, p, still) {
    var ctx = this.ctx;
    var show = still ? 1 : ease(seg(p, 0.12, 0.32));
    var fill = still ? 1 : ease(seg(p, 0.3, 0.82));
    var close = still ? 1 : ease(seg(p, 0.82, 1));
    var col = rgbStr(rgb, this.productType === 'serum' ? 0.55 : 0.95);
    ctx.save();
    ctx.globalAlpha = show;
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = this.ink;
    var breathe = still && !this.reduced ? 0.04 * Math.sin(now * 0.0012) : 0;

    // носик дозатора с вязкой струёй
    function nozzle(x, topY, toY, on) {
      ctx.save();
      ctx.fillStyle = '#B9B5AD';
      roundRect(ctx, x - H * 0.025, topY - H * 0.25, H * 0.05, H * 0.2, 3); ctx.fill(); ctx.stroke();
      if (on > 0 && on < 1) {
        ctx.strokeStyle = col;
        ctx.lineCap = 'round';
        ctx.lineWidth = H * 0.025 * Math.sin(on * Math.PI);
        ctx.beginPath(); ctx.moveTo(x, topY - H * 0.05); ctx.lineTo(x, toY); ctx.stroke();
      }
      ctx.restore();
    }
    function label(x, y, w, h) {
      ctx.save();
      ctx.fillStyle = 'rgba(244,242,236,0.92)';
      ctx.fillRect(x - w / 2, y - h / 2, w, h);
      ctx.fillStyle = '#1B1B19';
      ctx.font = '500 ' + Math.max(9, Math.round(h * 0.38)) + 'px "Fira Code", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('K0DA', x, y);
      ctx.restore();
    }

    if (this.packaging === 'mask-jar') {
      var jw = H * 0.62, jh = H * 0.36, jy = tableY - jh;
      this.softShadow(cx, tableY, jw * 0.7);
      ctx.save();
      roundRect(ctx, cx - jw / 2, jy, jw, jh, H * 0.06); ctx.clip();
      ctx.fillStyle = col;
      var fy = tableY - jh * 0.92 * fill + Math.sin(now * 0.004) * (fill < 1 ? 1.5 : 0);
      ctx.beginPath();
      ctx.moveTo(cx - jw, tableY);
      for (var x = -jw / 2; x <= jw / 2; x += 6) ctx.lineTo(cx + x, fy + Math.sin(x * 0.08 + now * 0.003) * (fill < 1 ? 2.5 : 0.8));
      ctx.lineTo(cx + jw, tableY); ctx.fill();
      ctx.restore();
      roundRect(ctx, cx - jw / 2, jy, jw, jh, H * 0.06);
      ctx.fillStyle = 'rgba(255,255,255,0.28)'; ctx.fill(); ctx.stroke();
      label(cx, jy + jh * 0.55, jw * 0.5, jh * 0.26);
      // крышка опускается в конце
      var lidY = jy - H * 0.06 - (1 - close) * H * 0.35;
      ctx.globalAlpha = show * (still ? 1 : seg(p, 0.75, 0.85));
      ctx.fillStyle = '#B9B5AD';
      roundRect(ctx, cx - jw * 0.52, lidY, jw * 1.04, H * 0.07, 6); ctx.fill(); ctx.stroke();
      ctx.globalAlpha = show;
      if (!still) nozzle(cx, jy - H * 0.05, fy, seg(p, 0.3, 0.82));
    } else if (this.packaging === 'serum-dropper') {
      var bw = H * 0.26, bh = H * 0.62, by = tableY - bh;
      this.softShadow(cx, tableY, bw);
      ctx.save();
      roundRect(ctx, cx - bw / 2, by, bw, bh, H * 0.03); ctx.clip();
      ctx.fillStyle = col;
      var sy = tableY - bh * 0.88 * fill;
      ctx.fillRect(cx - bw, sy, bw * 2, tableY - sy);
      ctx.restore();
      roundRect(ctx, cx - bw / 2, by, bw, bh, H * 0.03);
      ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fill(); ctx.stroke();
      label(cx, by + bh * 0.5, bw * 0.8, bh * 0.12);
      // пипетка опускается после заполнения
      var py = by - H * 0.2 - (1 - close) * H * 0.4;
      ctx.globalAlpha = show * (still ? 1 : seg(p, 0.8, 0.9));
      ctx.fillStyle = '#FFFFFF';
      roundRect(ctx, cx - bw * 0.3, py - H * 0.16, bw * 0.6, H * 0.18, bw * 0.3); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#B9B5AD';
      roundRect(ctx, cx - bw * 0.42, py, bw * 0.84, H * 0.07, 3); ctx.fill(); ctx.stroke();
      ctx.globalAlpha = show;
      if (!still) nozzle(cx, by - H * 0.05, sy, seg(p, 0.3, 0.8));
    } else {
      // туба стоит на крышке, наполняется через открытый край, слегка «дышит» при наполнении
      var tw = H * 0.34, th = H * 0.72, ty = tableY - th;
      var sq = still ? 1 + breathe * 0.2 : 1 + Math.sin(fill * Math.PI) * 0.06;
      this.softShadow(cx, tableY, tw);
      ctx.save();
      ctx.translate(cx, tableY); ctx.scale(sq, 1); ctx.translate(-cx, -tableY);
      ctx.beginPath();
      ctx.moveTo(cx - tw * 0.32, tableY - H * 0.1);
      ctx.lineTo(cx - tw / 2, ty + H * 0.03);
      ctx.lineTo(cx + tw / 2, ty + H * 0.03);
      ctx.lineTo(cx + tw * 0.32, tableY - H * 0.1);
      ctx.closePath();
      ctx.save(); ctx.clip();
      ctx.fillStyle = col;
      var tyFill = tableY - H * 0.1 - (th - H * 0.13) * fill;
      ctx.fillRect(cx - tw, tyFill, tw * 2, tableY);
      if (this.grainy) {
        ctx.fillStyle = 'rgba(70,55,40,0.45)';
        for (var i = 0; i < 60; i++) ctx.fillRect(cx - tw * 0.4 + ((i * 53) % (tw * 0.8)), tyFill + ((i * 29) % Math.max(4, tableY - tyFill)), 1.5, 1.5);
      }
      ctx.restore();
      ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.fill(); ctx.stroke();
      // запаянный край сверху
      ctx.globalAlpha = show * (still ? 1 : close);
      ctx.fillStyle = 'rgba(244,242,236,0.95)';
      ctx.fillRect(cx - tw / 2 - 2, ty, tw + 4, H * 0.035); ctx.strokeRect(cx - tw / 2 - 2, ty, tw + 4, H * 0.035);
      ctx.globalAlpha = show;
      ctx.restore();
      // крышка
      ctx.fillStyle = '#B9B5AD';
      roundRect(ctx, cx - tw * 0.34, tableY - H * 0.1, tw * 0.68, H * 0.1, 4); ctx.fill(); ctx.stroke();
      label(cx, ty + th * 0.45, tw * 0.6, th * 0.1);
      if (!still) nozzle(cx, ty - H * 0.02, tyFill, seg(p, 0.3, 0.82));
    }
    ctx.restore();
  };

  root.KODA_UTIL = Object.assign(root.KODA_UTIL || {}, {
    LabScene: LabScene,
    oklab: { toOklab: toOklab, fromOklab: fromOklab, mix: mixOklab, dist: labDist }
  });
})(window);
