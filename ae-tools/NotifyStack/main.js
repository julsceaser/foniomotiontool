/**
 * Notify Stack — Panel-Logik.
 * Spricht wie die anderen Panels von Yunus direkt ueber
 * window.__adobe_cep__.evalScript mit ExtendScript, ohne CSInterface.
 *
 * Die Vorschau rechnet mit derselben Federmathematik wie die Expressions
 * im Rig — was hier zu sehen ist, kommt in der Komposition genauso raus.
 */

/* global window, document, localStorage */

// ---------------------------------------------------------------- Parameter
// Reihenfolge = Reihenfolge im Panel. min/max/step/nachkomma.
var PARAMS = [
  { k: 'abstand',    g: 'Struktur',   label: 'Abstand',              min: 0,   max: 200, step: 1,    dec: 0, def: 14 },
  { k: 'stapeln',    g: 'Struktur',   label: 'Stapeln oben (%)',     min: 0,   max: 100, step: 1,    dec: 0, def: 0 },
  { k: 'stapelnAb',  g: 'Struktur',   label: 'Stapeln ab Karte',     min: 1,   max: 20,  step: 1,    dec: 0, def: 3 },

  { k: 'einDist',    g: 'Einlauf',    label: 'Distanz von unten',    min: 0,   max: 800, step: 5,    dec: 0, def: 260 },
  { k: 'einFreq',    g: 'Einlauf',    label: 'Frequenz',             min: 0.2, max: 5,   step: 0.05, dec: 2, def: 1.6 },
  { k: 'einDamp',    g: 'Einlauf',    label: 'Daempfung',            min: 1,   max: 30,  step: 0.5,  dec: 1, def: 9 },
  { k: 'einScale',   g: 'Einlauf',    label: 'Startgroesse (%)',     min: 50,  max: 130, step: 1,    dec: 0, def: 92 },

  { k: 'ausFreq',    g: 'Ausweichen', label: 'Frequenz',             min: 0.2, max: 5,   step: 0.05, dec: 2, def: 1.15 },
  { k: 'ausDamp',    g: 'Ausweichen', label: 'Daempfung',            min: 1,   max: 30,  step: 0.5,  dec: 1, def: 11 },
  { k: 'versatz',    g: 'Ausweichen', label: 'Versatz pro Karte (F)', min: 0,  max: 10,  step: 0.5,  dec: 1, def: 1.5 },

  { k: 'kleiner',    g: 'Tiefe',      label: 'Verkleinern pro Karte (%)', min: 0, max: 15, step: 0.5, dec: 1, def: 1.5 },
  { k: 'blasser',    g: 'Tiefe',      label: 'Abblenden pro Karte (%)',   min: 0, max: 50, step: 1,   dec: 0, def: 6 },
  { k: 'wegAb',      g: 'Tiefe',      label: 'Ausblenden ab Karte',       min: 1, max: 30, step: 1,   dec: 0, def: 5 },
];

var PRESETS = {
  ios:     { einFreq: 1.6,  einDamp: 9,  ausFreq: 1.15, ausDamp: 11, versatz: 1.5, einScale: 92,  stapeln: 0,  kleiner: 1.5, blasser: 6 },
  weich:   { einFreq: 1.0,  einDamp: 7,  ausFreq: 0.9,  ausDamp: 8,  versatz: 3,   einScale: 96,  stapeln: 0,  kleiner: 1,   blasser: 4 },
  knackig: { einFreq: 2.2,  einDamp: 8,  ausFreq: 1.6,  ausDamp: 12, versatz: 1,   einScale: 88,  stapeln: 0,  kleiner: 2,   blasser: 8 },
  bouncy:  { einFreq: 1.8,  einDamp: 5,  ausFreq: 1.3,  ausDamp: 7,  versatz: 2,   einScale: 84,  stapeln: 0,  kleiner: 2.5, blasser: 8 },
};

var LS = 'notifystack.v1';
var vals = {};
var dirUp = true;
var els = {};

function loadVals() {
  for (var i = 0; i < PARAMS.length; i++) vals[PARAMS[i].k] = PARAMS[i].def;
  try {
    var raw = localStorage.getItem(LS);
    if (raw) {
      var s = JSON.parse(raw);
      for (var k in s.vals) if (vals.hasOwnProperty(k)) vals[k] = s.vals[k];
      if (typeof s.dirUp === 'boolean') dirUp = s.dirUp;
    }
  } catch (e) { /* Voreinstellungen bleiben */ }
}
function saveVals() {
  try { localStorage.setItem(LS, JSON.stringify({ vals: vals, dirUp: dirUp })); } catch (e) {}
}

// ---------------------------------------------------------------- Regler bauen
function buildRows() {
  var targets = {
    Struktur: document.getElementById('rowsStruktur'),
    Einlauf: document.getElementById('rowsEinlauf'),
    Ausweichen: document.getElementById('rowsAusweichen'),
    Tiefe: document.getElementById('rowsTiefe'),
  };
  for (var i = 0; i < PARAMS.length; i++) {
    (function (p) {
      var row = document.createElement('div');
      row.className = 'row';
      row.innerHTML =
        '<div class="top"><label>' + p.label + '</label>' +
        '<input class="val" type="text" /></div>' +
        '<input type="range" min="' + p.min + '" max="' + p.max + '" step="' + p.step + '" />';
      targets[p.g].appendChild(row);

      var num = row.querySelector('.val');
      var rng = row.querySelector('input[type=range]');
      els[p.k] = { num: num, rng: rng, p: p };

      rng.addEventListener('input', function () {
        vals[p.k] = parseFloat(rng.value);
        num.value = vals[p.k].toFixed(p.dec);
        onChange(false);
      });
      rng.addEventListener('change', function () { onChange(true); });
      num.addEventListener('change', function () {
        var v = parseFloat(num.value.replace(',', '.'));
        if (isNaN(v)) v = p.def;
        v = Math.max(p.min, Math.min(p.max, v));
        vals[p.k] = v;
        rng.value = v;
        num.value = v.toFixed(p.dec);
        onChange(true);
      });
    })(PARAMS[i]);
  }
}

function refreshUI() {
  for (var k in els) {
    els[k].rng.value = vals[k];
    els[k].num.value = vals[k].toFixed(els[k].p.dec);
  }
  var chk = document.getElementById('chkDir');
  if (dirUp) chk.classList.add('on'); else chk.classList.remove('on');
  markPreset();
}

function markPreset() {
  var list = document.querySelectorAll('.preset');
  for (var i = 0; i < list.length; i++) {
    var name = list[i].getAttribute('data-p');
    var pre = PRESETS[name], hit = true;
    for (var k in pre) if (Math.abs(vals[k] - pre[k]) > 0.001) { hit = false; break; }
    if (hit) list[i].classList.add('on'); else list[i].classList.remove('on');
  }
}

// ---------------------------------------------------------------- Vorschau
// Dieselbe Feder wie in der Expression.
function spring(t, f, d) {
  if (t <= 0) return 0;
  var w = f * Math.PI * 2;
  return 1 - Math.exp(-d * t) * (Math.cos(w * t) + (d / w) * Math.sin(w * t));
}

// Beispielstapel: unterschiedliche Hoehen, damit man das Ungleichmaessige sieht
var DEMO = [
  { t: 0.0, h: 28 },
  { t: 0.9, h: 44 },
  { t: 1.7, h: 28 },
  { t: 2.6, h: 36 },
];
var LOOP = 4.6;
var SCALE = 0.17;   // Comp-Pixel -> Panel-Pixel, damit der Stapel in die Buehne passt

var cv = document.getElementById('preview');
var ctx = cv.getContext('2d');
var t0 = Date.now();

function fitCanvas() {
  var r = cv.parentNode.getBoundingClientRect();
  var dpr = window.devicePixelRatio || 1;
  cv.width = Math.max(1, Math.round(r.width * dpr));
  cv.height = Math.max(1, Math.round(r.height * dpr));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function draw() {
  var W = cv.clientWidth, H = cv.clientHeight;
  ctx.clearRect(0, 0, W, H);
  var t = ((Date.now() - t0) / 1000) % LOOP;

  var gap = vals.abstand * SCALE;
  var stackAmt = vals.stapeln / 100;
  var stackFrom = Math.max(1, vals.stapelnAb);
  var stag = vals.versatz / 30;
  var cardW = Math.min(W - 56, 210);
  var baseY = H - 26;                         // Stapel sitzt unten, Platz fuer den Hinweis

  for (var i = 0; i < DEMO.length; i++) {
    var me = DEMO[i];
    if (t < me.t) continue;

    var push = 0, depth = 0, later = 0;
    for (var j = 0; j < DEMO.length; j++) {
      if (j === i || DEMO[j].t <= me.t) continue;
      var pr = spring(t - DEMO[j].t - later * stag, vals.ausFreq, vals.ausDamp);
      var squeeze = 1 - stackAmt * Math.min(1, later / stackFrom);
      push += (DEMO[j].h + gap) * squeeze * pr;
      depth += pr;
      later++;
    }
    var born = spring(t - me.t, vals.einFreq, vals.einDamp);
    var enter = (1 - born) * (vals.einDist * SCALE);

    var k = (vals.einScale / 100) + (1 - vals.einScale / 100) * born;
    k *= 1 - Math.min(0.9, depth * vals.kleiner / 100);
    var alpha = born * (1 - Math.min(1, depth * vals.blasser / 100));
    alpha *= 1 - Math.min(1, Math.max(0, depth - vals.wegAb + 1));
    if (alpha <= 0.01) continue;

    var w = cardW * k, h = me.h * k;
    var dir = dirUp ? 1 : -1;
    var y = baseY - h + dir * (enter - push);
    var x = (W - w) / 2;

    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
    ctx.fillStyle = (t - me.t) < 0.45 ? '#4a8ae4' : '#6f6f6f';
    roundRect(x, y, w, h, 9 * k);
    ctx.fill();

    // angedeutete Zeilen, damit man Karten als Karten liest
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha)) * 0.45;
    ctx.fillStyle = '#272727';
    roundRect(x + 8 * k, y + 7 * k, 22 * k, 4 * k, 2 * k); ctx.fill();
    if (h > 22 * k) { roundRect(x + 8 * k, y + 15 * k, w * 0.55, 4 * k, 2 * k); ctx.fill(); }
  }
  ctx.globalAlpha = 1;
  window.requestAnimationFrame(draw);
}

// ---------------------------------------------------------------- AE-Bruecke
function say(text, cls) {
  var s = document.getElementById('status');
  s.textContent = text;
  s.className = cls || '';
}

function evalES(code, cb) {
  try {
    window.__adobe_cep__.evalScript(code, function (res) { if (cb) cb(String(res)); });
  } catch (e) {
    say('Kein Kontakt zu After Effects: ' + e, 'err');
  }
}

function paramString() {
  var out = [];
  for (var k in vals) out.push(k + '=' + vals[k]);
  out.push('dirUp=' + (dirUp ? 1 : 0));
  return out.join(';');
}

var syncTimer = null;
function onChange(commit) {
  saveVals();
  markPreset();
  if (!commit) return;
  // Werte live ans Rig schicken, damit die Comp mitzieht
  if (syncTimer) window.clearTimeout(syncTimer);
  syncTimer = window.setTimeout(function () {
    evalES('nsSetValues("' + paramString() + '")', function (r) {
      if (r.indexOf('OK') === 0) say('Werte gesendet', 'ok');
      else if (r.indexOf('KEIN_RIG') === 0) say('Noch kein Rig in dieser Komposition', '');
      else say(r, 'err');
    });
  }, 120);
}

// ---------------------------------------------------------------- Verdrahtung
loadVals();
buildRows();
refreshUI();
fitCanvas();
window.addEventListener('resize', fitCanvas);
draw();

document.getElementById('stage').addEventListener('click', function () { t0 = Date.now(); });
document.getElementById('replay').addEventListener('click', function (e) { e.stopPropagation(); t0 = Date.now(); });

document.getElementById('chkDir').addEventListener('click', function () {
  dirUp = !dirUp;
  refreshUI();
  onChange(true);
});

var pres = document.querySelectorAll('.preset');
for (var i = 0; i < pres.length; i++) {
  pres[i].addEventListener('click', function () {
    var pre = PRESETS[this.getAttribute('data-p')];
    for (var k in pre) vals[k] = pre[k];
    refreshUI();
    t0 = Date.now();
    onChange(true);
  });
}

document.getElementById('btnSync').addEventListener('click', function () {
  evalES('nsSetValues("' + paramString() + '")', function (r) {
    say(r.indexOf('OK') === 0 ? 'Werte gesendet' : r, r.indexOf('OK') === 0 ? 'ok' : 'err');
  });
});

document.getElementById('btnApply').addEventListener('click', function () {
  say('wird angewendet …');
  evalES('nsApply("' + paramString() + '")', function (r) {
    if (r.indexOf('OK') === 0) say(r.substring(3), 'ok');
    else say(r, 'err');
  });
});
