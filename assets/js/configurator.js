/* ==========================================================================
   configurator — «интерактивный фильм»: пользователь собирает формулу в лаборатории.
   Последовательный state machine (переходы только через dispatch):
   START → PRODUCT_SELECTION → STAGE_1_SELECTION → STAGE_1_ANIMATION → STAGE_2_SELECTION
   → STAGE_2_ANIMATION → STAGE_3_SELECTION → STAGE_3_ANIMATION → FINAL_MIXING → FILLING
   → RESULT → SAVE_FORMULA → RESET
   Все данные — из KODA.configurator (productTypes, ingredients, families, textures, copy).
   Сцена: два слоя <video> (A/B, кроссфейд 400 мс) поверх fallback-сцены на Canvas.
   Цепочки роликов: ing-<id> → prep-<prep> → canvas; final/fill/result-<family> → canvas.
   Разовые ролики проигрываются до конца — длительность не зависит от скорости клика.
   ========================================================================== */
(function (root) {
  'use strict';

  var U = root.KODA_UTIL;
  var K = root.KODA;

  var VIDEO_DIR = 'assets/video/configurator/';
  var FADE_MS = 400;
  var PROGRESS = ['Тип', 'Основа', 'Компонент', 'Компонент', 'Смешивание', 'Розлив'];

  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function base() { return document.body.getAttribute('data-root') || ''; }
  function esc(s) { return U.render.esc(s); }
  function tx(s) { return U.render.tx(s); }
  function pad(n) { return String(n).padStart(2, '0'); }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  /* ======================================================================
     Видео: проверка наличия файла, предзагрузка, кроссфейд двух слоёв
     ====================================================================== */
  var probes = {};
  function videoUrl(name) { return base() + VIDEO_DIR + name + '.mp4'; }

  // Есть ли ролик: грузим метаданные; при ошибке или тайм-ауте — нет.
  function probe(name) {
    if (!name) return Promise.resolve(false);
    if (probes[name]) return probes[name];
    probes[name] = new Promise(function (resolve) {
      var v = document.createElement('video');
      var done = false;
      var finish = function (ok) {
        if (done) return;
        done = true;
        if (ok) v.preload = 'auto'; // продолжаем буферизацию — ролик понадобится
        resolve(ok);
      };
      v.muted = true;
      v.preload = 'metadata';
      v.addEventListener('loadedmetadata', function () { finish(true); }, { once: true });
      v.addEventListener('error', function () { finish(false); }, { once: true });
      setTimeout(function () { finish(false); }, 6000);
      v.src = videoUrl(name);
      probes[name + ':el'] = v;
    });
    return probes[name];
  }

  function firstAvailable(names) {
    var list = (names || []).filter(Boolean);
    var i = 0;
    var next = function () {
      if (i >= list.length) return Promise.resolve(null);
      var n = list[i++];
      return probe(n).then(function (ok) { return ok ? n : next(); });
    };
    return next();
  }

  function Scene(root) {
    this.root = root;
    this.layers = Array.prototype.slice.call(root.querySelectorAll('video'));
    this.active = -1;           // какой слой сейчас виден (-1 — видна canvas-сцена)
    this.token = 0;
    this.loader = $('[data-cfg-loading]');
    this.lab = new U.LabScene(root.querySelector('canvas'));
    this.reduced = U.reducedMotion();
  }

  Scene.prototype.loading = function (on) {
    if (!this.loader) return;
    clearTimeout(this.loadTimer);
    var el = this.loader;
    if (on) {
      // строка-прогресс из 0/1 — только если ожидание заметно
      this.loadTimer = setTimeout(function () { el.hidden = false; el.textContent = U.noise(24, '01'); }, 160);
      this.loadTick = setInterval(function () { el.textContent = U.noise(24, '01'); }, 120);
    } else {
      clearInterval(this.loadTick);
      el.hidden = true;
    }
  };

  // step: { videos: [..имена по приоритету], loop, mode, prep }
  Scene.prototype.show = function (step) {
    var self = this;
    var token = ++this.token;
    if (this.reduced && !step.loop) {
      // без движения: разовые ролики пропускаем, состояние сцены меняется сразу
      this.lab.play(step.mode, { prep: step.prep });
      return Promise.resolve();
    }
    this.loading(true);
    return firstAvailable(step.videos).then(function (name) {
      if (token !== self.token) return;
      self.loading(false);
      if (name && self.reduced) return self.showPoster(name);
      if (name) return self.playVideo(name, step, token);
      return self.playCanvas(step, token);
    });
  };

  // prefers-reduced-motion: неподвижный кадр цикла (постер <name>.jpg) вместо видео
  Scene.prototype.showPoster = function (name) {
    var idx = this.active === 0 ? 1 : 0;
    var v = this.layers[idx], other = this.layers[idx ^ 1];
    v.removeAttribute('src');
    v.poster = base() + VIDEO_DIR + name + '.jpg';
    v.classList.add('is-on');
    other.classList.remove('is-on');
    this.active = idx;
    this.lab.stop();
  };

  Scene.prototype.hideVideos = function () {
    this.layers.forEach(function (v) {
      v.classList.remove('is-on');
      setTimeout(function () { if (!v.classList.contains('is-on')) v.pause(); }, FADE_MS);
    });
    this.active = -1;
  };

  Scene.prototype.playCanvas = function (step, token) {
    this.hideVideos();
    this.lab.start();
    var p = this.lab.play(step.mode, { prep: step.prep });
    var self = this;
    return p.then(function () { if (token !== self.token) return; });
  };

  Scene.prototype.playVideo = function (name, step, token) {
    var self = this;
    var idx = this.active === 0 ? 1 : 0;
    var v = this.layers[idx];
    var other = this.layers[idx ^ 1];
    return new Promise(function (resolve) {
      var settled = false;
      var done = function () { if (!settled) { settled = true; resolve(); } };
      var fallback = function () {
        if (settled) return;
        settled = true;
        self.playCanvas(step, token).then(resolve);
      };
      v.loop = !!step.loop;
      v.muted = true;
      v.onerror = fallback;
      v.oncanplay = function () {
        v.oncanplay = null;
        if (token !== self.token) return done();
        var pl = v.play();
        if (pl && pl.catch) pl.catch(function () {});
        v.classList.add('is-on');
        other.classList.remove('is-on');
        self.active = idx;
        setTimeout(function () {
          if (!other.classList.contains('is-on')) other.pause();
          self.lab.stop(); // видео закрыло сцену — canvas можно не рисовать
        }, FADE_MS);
        if (step.loop) return done();
        // разовый ролик: ждём конца; страховка — длительность + 3 с
        v.onended = done;
        var limit = (isFinite(v.duration) ? v.duration * 1000 : 10000) + 3000;
        setTimeout(done, limit);
      };
      v.src = videoUrl(name);
      v.load();
    });
  };

  /* ======================================================================
     State machine
     ====================================================================== */
  var TRANSITIONS = {
    START: { INIT: 'PRODUCT_SELECTION' },
    PRODUCT_SELECTION: { SELECT_PRODUCT: 'STAGE_1_SELECTION' },
    STAGE_1_SELECTION: { SELECT_INGREDIENT: 'STAGE_1_ANIMATION' },
    STAGE_1_ANIMATION: { DONE: 'STAGE_2_SELECTION' },
    STAGE_2_SELECTION: { SELECT_INGREDIENT: 'STAGE_2_ANIMATION' },
    STAGE_2_ANIMATION: { DONE: 'STAGE_3_SELECTION' },
    STAGE_3_SELECTION: { SELECT_INGREDIENT: 'STAGE_3_ANIMATION' },
    STAGE_3_ANIMATION: { DONE: 'FINAL_MIXING' },
    FINAL_MIXING: { DONE: 'FILLING' },
    FILLING: { DONE: 'RESULT' },
    RESULT: { OFFER_SAVE: 'SAVE_FORMULA' },
    SAVE_FORMULA: { SAVE: 'RESET' }
  };

  function Configurator(el) {
    this.el = el;
    this.C = K.configurator;
    this.state = 'START';
    this.data = { productType: null, stage1Ingredient: null, stage2Ingredient: null, stage3Ingredient: null, family: null };
    this.scene = new Scene($('[data-cfg-scene]', el));
    this.ui = {
      title: $('[data-cfg-title]', el),
      sub: $('[data-cfg-sub]', el),
      step: $('[data-cfg-step]', el),
      options: $('[data-cfg-options]', el),
      result: $('[data-cfg-result]', el),
      save: $('[data-cfg-save]', el),
      live: $('[data-cfg-live]', el),
      progress: $('[data-cfg-progress]', el),
      restart: $('[data-cfg-restart]', el)
    };
    this.bindRestart();
    this.renderProgress();
  }

  Configurator.prototype.dispatch = function (event, payload) {
    var table = TRANSITIONS[this.state] || {};
    var next = table[event];
    if (event === 'RESTART') next = 'RESET';
    if (!next) return false; // событие не разрешено в текущем состоянии
    var prev = this.state;
    this.state = next;
    this.el.setAttribute('data-state', next);
    this.renderProgress();
    var fn = this['enter_' + next];
    if (fn) fn.call(this, payload, prev);
    return true;
  };

  Configurator.prototype.stageIndex = function () {
    var m = /^STAGE_(\d)/.exec(this.state);
    return m ? +m[1] : 0;
  };

  /* --- Состояния ---------------------------------------------------------- */
  Configurator.prototype.enter_PRODUCT_SELECTION = function () {
    var copy = this.C.copy.start;
    this.setTitle(copy.title, copy.sub);
    this.scene.lab.setLiquid(['#F3F1EC'], 0, { opacity: 0.4 });
    this.scene.show({ videos: ['lab-idle'], loop: true, mode: 'idle' });
    var types = this.C.productTypes;
    var tara = U.render.TARA || {};
    this.showOptions(Object.keys(types).map(function (key) {
      return {
        value: key,
        name: types[key].name,
        thumb: '<span class="cfg-opt__tara" aria-hidden="true">' + (tara[key] || '') + '</span>'
      };
    }), 'SELECT_PRODUCT');
    this.announce(PROGRESS[0] + '. ' + copy.sub);
  };

  Configurator.prototype.enter_STAGE_1_SELECTION = function (type) {
    var self = this;
    this.data.productType = type;
    var pt = this.C.productTypes[type];
    this.scene.lab.packaging = pt.packaging;
    this.scene.lab.productType = type;
    // экран не переключается: продолжает лабораторная анимация — появляется колба
    this.setTitle('', '');
    this.preloadStage(1);
    this.scene.show({ videos: ['flask-in'], loop: false, mode: 'flask-in' }).then(function () {
      if (self.state !== 'STAGE_1_SELECTION') return;
      self.scene.lab.setLiquid(['#F3F1EC'], 0.32, { opacity: type === 'serum' ? 0.4 : 0.55 });
      self.scene.show({ videos: ['flask-idle'], loop: true, mode: 'flask-idle' });
      self.setTitle(self.C.copy.base.title, self.C.copy.base.sub);
      self.showStageOptions(1);
    });
  };

  Configurator.prototype.enter_STAGE_2_SELECTION = function () {
    this.setTitle(this.C.copy.stage2, '');
    this.preloadStage(2);
    this.showStageOptions(2);
  };
  Configurator.prototype.enter_STAGE_3_SELECTION = function () {
    this.setTitle(this.C.copy.stage3, '');
    this.preloadStage(3);
    this.showStageOptions(3);
  };

  Configurator.prototype.enter_STAGE_1_ANIMATION = function (id) { this.animateIngredient(1, id); };
  Configurator.prototype.enter_STAGE_2_ANIMATION = function (id) { this.animateIngredient(2, id); };
  Configurator.prototype.enter_STAGE_3_ANIMATION = function (id) { this.animateIngredient(3, id); };

  // ing-<id> → prep-<prep> → canvas; затем промежуточное смешивание stir-<type> (цикл)
  Configurator.prototype.animateIngredient = function (stage, id) {
    var self = this;
    var ing = this.C.ingredients[id];
    var type = this.data.productType;
    this.data['stage' + stage + 'Ingredient'] = id;
    this.setTitle(ing.name, ing.process);
    this.announce(ing.name + '. ' + ing.process);
    var tints = this.chosen().map(function (x) { return x.tint; });
    this.scene.lab.setLiquid(tints, 0.32 + stage * 0.12, { grainy: type === 'peeling', opacity: type === 'serum' ? 0.45 : 0.9 });
    this.scene.show({ videos: ['ing-' + id, 'prep-' + ing.prep], loop: false, mode: 'prep', prep: ing.prep }).then(function () {
      if (self.state !== 'STAGE_' + stage + '_ANIMATION') return;
      self.scene.show({ videos: ['stir-' + type], loop: true, mode: 'stir' });
      if (stage === 3) self.preloadFinal();
      self.dispatch('DONE');
    });
  };

  Configurator.prototype.enter_FINAL_MIXING = function () {
    var self = this;
    var fam = this.computeFamily();
    this.data.family = fam.id;
    this.scene.lab.setLiquid([fam.color], null);
    this.setTitle(PROGRESS[4], '');
    this.announce(PROGRESS[4]);
    // даём промежуточному смешиванию немного покрутиться, затем финал
    wait(this.scene.reduced ? 0 : 1600).then(function () {
      return self.scene.show({ videos: ['final-' + fam.id], loop: false, mode: 'final' });
    }).then(function () { self.dispatch('DONE'); });
  };

  Configurator.prototype.enter_FILLING = function () {
    var self = this;
    this.setTitle(PROGRESS[5], '');
    this.announce(PROGRESS[5]);
    this.scene.show({ videos: ['fill-' + this.data.family], loop: false, mode: 'fill' }).then(function () {
      self.dispatch('DONE');
    });
  };

  Configurator.prototype.enter_RESULT = function () {
    var self = this;
    this.scene.show({ videos: ['result-' + this.data.family], loop: true, mode: 'result' });
    this.setTitle(this.C.copy.result, '');
    this.renderResult();
    this.announce(this.C.copy.result + '. ' + this.chosen().map(function (x) { return x.name; }).join(', '));
    wait(2000).then(function () { self.dispatch('OFFER_SAVE'); });
  };

  Configurator.prototype.enter_SAVE_FORMULA = function () { this.renderSave(); };

  Configurator.prototype.enter_RESET = function () {
    // полный сброс: перезагрузка страницы возвращает в начало конфигуратора
    location.reload();
  };

  /* --- Данные ------------------------------------------------------------- */
  Configurator.prototype.chosen = function () {
    var C = this.C;
    return [this.data.stage1Ingredient, this.data.stage2Ingredient, this.data.stage3Ingredient]
      .filter(Boolean).map(function (id) { return Object.assign({ id: id }, C.ingredients[id]); });
  };

  // Средний tint трёх ингредиентов в OKLab → ближайшее семейство своего типа.
  // Среднее взвешено «заметностью» цвета (расстояние от бесцветной основы):
  // кофе, масло виноградной косточки или глина окрашивают формулу сильнее,
  // чем почти прозрачные активы, — иначе бледные компоненты сводят всё к середине.
  Configurator.prototype.computeFamily = function () {
    var ok = U.oklab;
    var baseLab = ok.toOklab('#F3F1EC');
    var acc = [0, 0, 0], total = 0;
    this.chosen().forEach(function (x) {
      var lab = ok.toOklab(x.tint);
      var w = ok.dist(lab, baseLab) * 100 + 0.5;
      acc[0] += lab[0] * w; acc[1] += lab[1] * w; acc[2] += lab[2] * w;
      total += w;
    });
    var mean = acc.map(function (v) { return v / total; });
    var fams = this.C.families[this.data.productType];
    var best = fams[0], bestD = Infinity;
    fams.forEach(function (f) {
      var d = ok.dist(mean, ok.toOklab(f.color));
      if (d < bestD) { bestD = d; best = f; }
    });
    return best;
  };

  // Код формулы: короткий хэш выбора, например C-0D4A
  Configurator.prototype.formulaCode = function () {
    var key = [this.data.productType, this.data.stage1Ingredient, this.data.stage2Ingredient, this.data.stage3Ingredient].join('/');
    var h = U.hash(key).toString(16).toUpperCase().padStart(8, '0').slice(-4);
    return 'C-' + h.replace(/O/g, '0');
  };

  Configurator.prototype.preloadStage = function (stage) {
    var C = this.C, type = this.data.productType;
    var ids = C.productTypes[type].stages[stage - 1];
    ids.forEach(function (id) {
      firstAvailable(['ing-' + id, 'prep-' + C.ingredients[id].prep]);
    });
    probe('stir-' + type);
  };
  Configurator.prototype.preloadFinal = function () {
    var fam = this.computeFamily().id;
    ['final-', 'fill-', 'result-'].forEach(function (p) { probe(p + fam); });
  };

  /* --- Интерфейс ---------------------------------------------------------- */
  Configurator.prototype.setTitle = function (title, sub) {
    var t = this.ui.title, s = this.ui.sub;
    var text = title ? U.codeify(title, 1) : '';
    t.setAttribute('aria-label', title || '');
    t.setAttribute('data-text', text);
    if (text) U.scramble(t, text, { duration: 600 }); else t.textContent = '';
    s.textContent = sub ? U.typo(sub) : '';
    s.hidden = !sub;
  };

  Configurator.prototype.announce = function (msg) {
    var live = this.ui.live;
    live.textContent = '';
    setTimeout(function () { live.textContent = msg; }, 60);
  };

  Configurator.prototype.renderProgress = function () {
    var map = { START: 0, PRODUCT_SELECTION: 0, STAGE_1_SELECTION: 1, STAGE_1_ANIMATION: 1, STAGE_2_SELECTION: 2, STAGE_2_ANIMATION: 2,
      STAGE_3_SELECTION: 3, STAGE_3_ANIMATION: 3, FINAL_MIXING: 4, FILLING: 5, RESULT: 6, SAVE_FORMULA: 6, RESET: 6 };
    var cur = map[this.state] || 0;
    this.ui.step.textContent = pad(Math.min(cur + 1, 6)) + ' / 06';
    this.ui.progress.innerHTML = PROGRESS.map(function (label, i) {
      var cls = i < cur ? 'is-done' : i === cur ? 'is-current' : '';
      return '<li class="' + cls + '"' + (i === cur ? ' aria-current="step"' : '') + '><span>' + pad(i + 1) + '</span> ' + esc(U.codeify(label, 1)) + '</li>';
    }).join('');
  };

  Configurator.prototype.showStageOptions = function (stage) {
    var C = this.C;
    var ids = C.productTypes[this.data.productType].stages[stage - 1];
    var known = (K.ingredients || []).map(function (g) { return g.id; });
    var root = base();
    this.showOptions(ids.map(function (id) {
      var ing = C.ingredients[id];
      // миниатюра: постер ролика ing-<id>, иначе рисунок из карточек ингредиентов, иначе цвет
      var svg = known.indexOf(id) >= 0 ? '<img src="' + root + 'assets/img/ingredients/' + id + '.svg" alt="" loading="lazy">' : '';
      return {
        value: id,
        name: ing.name,
        meta: ing.process,
        thumb: '<span class="cfg-opt__thumb" style="--tint:' + ing.tint + '" aria-hidden="true">' + svg +
          '<img class="cfg-opt__poster" src="' + root + VIDEO_DIR + 'ing-' + id + '.jpg" alt="" loading="lazy" onerror="this.remove()"></span>'
      };
    }), 'SELECT_INGREDIENT');
  };

  // Варианты появляются по одному; после выбора все исчезают (fade + scramble)
  Configurator.prototype.showOptions = function (items, event) {
    var self = this;
    var list = this.ui.options;
    list.innerHTML = items.map(function (it, i) {
      var name = U.codeify(it.name, 1);
      return '<li style="--i:' + i + '"><button class="cfg-opt" type="button" data-value="' + esc(it.value) + '" aria-label="' + esc(it.name) + '">' +
        '<span class="cfg-opt__n micro">' + pad(i + 1) + '</span>' + (it.thumb || '') +
        '<span class="cfg-opt__body"><span class="cfg-opt__name" data-text="' + esc(name) + '">' + esc(name) + '</span>' +
        (it.meta ? '<span class="cfg-opt__meta micro">' + tx(it.meta) + '</span>' : '') + '</span></button></li>';
    }).join('');
    list.hidden = false;
    U.fixLabels(list);
    var buttons = Array.prototype.slice.call(list.querySelectorAll('.cfg-opt'));
    if (root.matchMedia('(max-width: 1023px)').matches && this.state !== 'PRODUCT_SELECTION') {
      setTimeout(function () { list.scrollIntoView({ block: 'nearest', behavior: self.scene.reduced ? 'auto' : 'smooth' }); }, 200);
    }
    requestAnimationFrame(function () { list.classList.add('is-in'); });
    buttons.forEach(function (b, i) {
      var nameEl = b.querySelector('.cfg-opt__name');
      U.scramble(nameEl, nameEl.getAttribute('data-text'), { duration: 600, delay: 120 + i * 120 });
      b.addEventListener('click', function () { self.choose(b.getAttribute('data-value'), event); });
      b.addEventListener('keydown', function (e) {
        var k = e.key, d = k === 'ArrowDown' || k === 'ArrowRight' ? 1 : k === 'ArrowUp' || k === 'ArrowLeft' ? -1 : 0;
        if (!d) return;
        e.preventDefault();
        buttons[(i + d + buttons.length) % buttons.length].focus();
      });
    });
    // фокус — на первый новый вариант (если пользователь уже работает в конфигураторе)
    if (this.el.contains(document.activeElement) || this.keyboard) {
      setTimeout(function () { if (buttons[0]) buttons[0].focus({ preventScroll: true }); }, 80);
    }
  };

  Configurator.prototype.choose = function (value, event) {
    if (this.choosing) return;
    this.choosing = true;
    var self = this;
    var list = this.ui.options;
    this.keyboard = list.contains(document.activeElement) && document.activeElement.matches(':focus-visible');
    Array.prototype.forEach.call(list.querySelectorAll('.cfg-opt'), function (b) {
      b.disabled = true;
      if (b.getAttribute('data-value') === value) b.classList.add('is-chosen');
      var n = b.querySelector('.cfg-opt__name');
      U.scramble(n, U.noise(n.textContent.length, U.CODE_CHARS), { duration: 300 });
    });
    list.classList.remove('is-in');
    list.classList.add('is-out');
    wait(this.scene.reduced ? 0 : 450).then(function () {
      list.innerHTML = '';
      list.hidden = true;
      list.classList.remove('is-out');
      self.choosing = false;
      self.dispatch(event, value);
    });
  };

  Configurator.prototype.renderResult = function () {
    var C = this.C, d = this.data;
    var fam = C.families[d.productType].filter(function (f) { return f.id === d.family; })[0];
    var ings = this.chosen();
    var box = this.ui.result;
    box.innerHTML =
      '<p class="cfg-result__code micro">FORM ' + esc(this.formulaCode()) + '</p>' +
      '<p class="cfg-result__ings">' + tx(ings.map(function (x) { return x.name; }).join(' · ')) + '</p>' +
      '<p class="cfg-result__type micro">' + esc(U.codeify(C.productTypes[d.productType].name, 1)) + '</p>' +
      '<dl class="cfg-passport">' +
      '<div><dt class="micro">' + esc(U.codeify('Цвет', 1)) + '</dt><dd>' + tx(fam.name) + ' <span class="cfg-swatch" style="--c:' + fam.color + '" aria-hidden="true"></span></dd></div>' +
      '<div><dt class="micro">' + esc(U.codeify('Текстура', 1)) + '</dt><dd>' + tx(C.textures[d.productType]) + '</dd></div>' +
      '</dl>' +
      '<ol class="cfg-result__list">' + ings.map(function (x, i) {
        return '<li><span class="micro muted">' + pad(i + 1) + '</span><span>' + tx(x.name) + '</span><span class="micro muted">' + tx(x.process) + '</span></li>';
      }).join('') + '</ol>';
    box.hidden = false;
    requestAnimationFrame(function () { box.classList.add('is-in'); });
  };

  Configurator.prototype.renderSave = function () {
    var self = this;
    var S = this.C.copy.save;
    var form = this.ui.save;
    var btnText = U.codeify(S.button, 1);
    form.innerHTML =
      '<p class="cfg-save__title">' + tx(S.title) + '</p>' +
      '<label class="sr-only" for="cfg-email">E-mail</label>' +
      '<div class="cfg-save__row"><input class="cfg-save__input" id="cfg-email" name="email" type="email" inputmode="email" autocomplete="email" placeholder="' + esc(S.placeholder) + '" required>' +
      '<button class="btn" type="submit" aria-label="' + esc(S.button) + '" data-text="' + esc(btnText) + '">' + esc(btnText) + '</button></div>' +
      '<p class="cfg-save__error micro" role="alert" hidden></p>';
    form.hidden = false;
    requestAnimationFrame(function () {
      form.classList.add('is-in');
      // форма может оказаться ниже края панели — плавно подводим к ней
      form.scrollIntoView({ block: 'nearest', behavior: self.scene.reduced ? 'auto' : 'smooth' });
    });
    U.fixLabels(form);
    var input = form.querySelector('input');
    var btn = form.querySelector('button');
    var err = form.querySelector('.cfg-save__error');
    U.bindHoverScramble(btn);
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      // прототип: письмо не отправляется, проверяем только формат адреса
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(input.value.trim())) {
        err.textContent = U.typo(S.placeholder);
        err.hidden = false;
        input.setAttribute('aria-invalid', 'true');
        input.focus();
        return;
      }
      err.hidden = true;
      input.removeAttribute('aria-invalid');
      btn.disabled = true;
      btn.classList.add('is-pressed');
      wait(180).then(function () {
        btn.classList.remove('is-pressed');
        var vis = btn.querySelector('.vis-label') || btn;
        vis.textContent = U.codeify(S.done, 1);
        self.announce(S.done);
        return wait(600);
      }).then(function () { self.dispatch('SAVE'); });
    });
  };

  // «← начать заново» — подтверждение в одну строку, без confirm()
  Configurator.prototype.bindRestart = function () {
    var self = this;
    var box = this.ui.restart;
    var link = box.querySelector('[data-restart]');
    var ask = box.querySelector('[data-restart-ask]');
    link.addEventListener('click', function () {
      link.hidden = true;
      ask.hidden = false;
      ask.querySelector('[data-restart-yes]').focus();
    });
    ask.querySelector('[data-restart-yes]').addEventListener('click', function () { self.dispatch('RESTART'); });
    ask.querySelector('[data-restart-no]').addEventListener('click', function () {
      ask.hidden = true;
      link.hidden = false;
      link.focus();
    });
  };

  function initConfigurator() {
    var el = document.querySelector('[data-configurator]');
    if (!el || !K || !K.configurator) return;
    var app = new Configurator(el);
    app.dispatch('INIT');
    root.KODA_CONFIGURATOR = app; // для отладки в консоли
  }

  root.KODA_UTIL = Object.assign(root.KODA_UTIL || {}, { initConfigurator: initConfigurator });
})(window);
