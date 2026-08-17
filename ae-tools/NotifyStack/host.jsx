/**
 * Notify Stack — After-Effects-Seite.
 * ExtendScript ist ES3: kein let/const, keine Pfeilfunktionen, kein JSON.
 *
 * Das Panel ruft nsApply() und nsSetValues() mit einem String "k=v;k=v" auf.
 * Alle Werte landen als Regler auf dem Null NOTIFY CTRL — die Expressions
 * lesen ausschliesslich von dort. Dadurch bleibt alles auch ohne Panel
 * bedienbar und laesst sich ganz normal keyframen.
 */

var nsBusy = false;   // verhindert ueberlappende Aufrufe aus dem Panel
var NS_CTRL = 'NOTIFY CTRL';
var NS_PREFIX = 'NC ';

// Panel-Schluessel -> Reglername auf dem Null. Reihenfolge = Reihenfolge im Panel.
var NS_MAP = [
  ['abstand',   'Abstand',                'slider',   14],
  ['dirUp',     'Von unten',              'checkbox', 1],
  ['folgt',     'Stapel folgt Null',      'checkbox', 1],
  ['stapeln',   'Stapeln oben',           'slider',   0],
  ['stapelnAb', 'Stapeln ab Karte',       'slider',   3],
  ['einDist',   'Einlauf Distanz',        'slider',   260],
  ['einFreq',   'Einlauf Frequenz',       'slider',   1.6],
  ['einDamp',   'Einlauf Daempfung',      'slider',   9],
  ['einScale',  'Einlauf Skalierung',     'slider',   92],
  ['ausFreq',   'Ausweichen Frequenz',    'slider',   1.15],
  ['ausDamp',   'Ausweichen Daempfung',   'slider',   11],
  ['versatz',   'Versatz pro Karte',      'slider',   1.5],
  ['kleiner',   'Verkleinern pro Karte',  'slider',   1.5],
  ['blasser',   'Abblenden pro Karte',    'slider',   6],
  ['wegAb',     'Ausblenden ab Karte',    'slider',   5]
];

function nsParse(s) {
  var out = {};
  if (!s) return out;
  var parts = String(s).split(';');
  for (var i = 0; i < parts.length; i++) {
    var kv = parts[i].split('=');
    if (kv.length === 2) out[kv[0]] = parseFloat(kv[1]);
  }
  return out;
}

function nsComp() {
  var c = app.project.activeItem;
  return (c && c instanceof CompItem) ? c : null;
}

function nsFind(comp, name) {
  for (var i = 1; i <= comp.numLayers; i++) {
    if (comp.layer(i).name === name) return comp.layer(i);
  }
  return null;
}

function nsEnsureCtrl(comp) {
  var n = nsFind(comp, NS_CTRL);
  if (!n) {
    n = comp.layers.addNull();
    n.name = NS_CTRL;
    n.enabled = false;
    n.moveToBeginning();
    n.startTime = 0;
    n.outPoint = comp.duration;
  }
  for (var i = 0; i < NS_MAP.length; i++) {
    var name = NS_MAP[i][1];
    if (n.effect(name)) continue;
    var kind = NS_MAP[i][2] === 'checkbox' ? 'ADBE Checkbox Control' : 'ADBE Slider Control';
    var fx = n.Effects.addProperty(kind);
    fx.name = name;
    fx.property(1).setValue(NS_MAP[i][3]);
  }
  return n;
}

function nsWrite(ctrl, p) {
  for (var i = 0; i < NS_MAP.length; i++) {
    var key = NS_MAP[i][0], name = NS_MAP[i][1];
    if (p[key] === undefined || isNaN(p[key])) continue;
    var prop = ctrl.effect(name).property(1);
    if (prop.numKeys > 0) continue;          // keyframed: nicht ueberschreiben
    prop.setValue(p[key]);
  }
}

// ---------------------------------------------------------------- Expressions
function nsKernExpr() {
  return [
    'var C = thisComp.layer("' + NS_CTRL + '");',
    'function s(n){ return C.effect(n)("Slider").value; }',
    'var gap = s("Abstand");',
    'var stackAmt = s("Stapeln oben")/100;',
    'var stackFrom = Math.max(1, s("Stapeln ab Karte"));',
    'var fSh = s("Ausweichen Frequenz"), dSh = s("Ausweichen Daempfung");',
    'var stag = s("Versatz pro Karte") * thisComp.frameDuration;',
    'function spring(t, f, d){',
    '  if (t <= 0) return 0;',
    '  var w = f * Math.PI * 2;',
    '  return 1 - Math.exp(-d * t) * (Math.cos(w * t) + (d / w) * Math.sin(w * t));',
    '}',
    '// Erst sammeln, DANN nach Ankunft sortieren. Die Ebenenreihenfolge sagt',
    '// nichts ueber die Reihenfolge der Ankuenfte — sonst bekommt ausgerechnet',
    '// die Karte, die direkt nach dieser kommt, den groessten Versatz.',
    'var spaeter = [];',
    'for (var i = 1; i <= thisComp.numLayers; i++){',
    '  var L = thisComp.layer(i);',
    '  if (L.index == index) continue;',
    '  if (L.name.indexOf("' + NS_PREFIX + '") != 0) continue;',
    '  if (L.inPoint <= inPoint) continue;',
    '  spaeter.push(L);',
    '}',
    'spaeter.sort(function(a, b){ return a.inPoint - b.inPoint; });',
    'var push = 0, depth = 0;',
    'for (var n = 0; n < spaeter.length; n++){',
    '  var Ln = spaeter[n];',
    '  var pr = spring(time - Ln.inPoint - n * stag, fSh, dSh);',
    '  var h = 120;',
    '  try { h = Ln.effect("Karte Hoehe")("Slider").value; } catch(e){}',
    '  push += (h + gap) * (1 - stackAmt * Math.min(1, n / stackFrom)) * pr;',
    '  depth += pr;',
    '}',
    '[push, depth]'
  ].join('\n');
}

/** Kopf fuer die drei Transform-Eigenschaften: liest nur noch den Kern-Regler. */
function nsHead() {
  return [
    'var C = thisComp.layer("' + NS_CTRL + '");',
    'function s(n){ return C.effect(n)("Slider").value; }',
    'function b(n){ return C.effect(n)("Checkbox").value; }',
    'function spring(t, f, d){',
    '  if (t <= 0) return 0;',
    '  var w = f * Math.PI * 2;',
    '  return 1 - Math.exp(-d * t) * (Math.cos(w * t) + (d / w) * Math.sin(w * t));',
    '}',
    '// Schub und Tiefe kommen fertig aus "NS Intern" — dort laeuft die Schleife',
    '// EINMAL pro Bild, statt in jeder der drei Eigenschaften erneut.',
    'var kern = effect("NS Intern")("Point");',
    'var push = kern[0], depth = kern[1];',
    'var dirUp = b("Von unten") ? 1 : -1;',
    'var born = spring(time - inPoint, s("Einlauf Frequenz"), s("Einlauf Daempfung"));',
    'function cardH(L){ try { return L.effect("Karte Hoehe")("Slider").value; } catch(e){ return 120; } }',
    'function cardTop(L){ try { return L.effect("Karte Oberkante")("Slider").value; } catch(e){ return -60; } }'
  ].join('\n');
}

/**
 * scalar = true, wenn die Position in X und Y getrennt ist. Dann liegt die
 * Expression auf "Y-Position" und muss eine Zahl liefern statt eines Arrays.
 */
function nsExprPos(scalar) {
  return nsHead() + '\n' + [
    'var enter = (1 - born) * s("Einlauf Distanz");',
    '// Mit "Stapel folgt Null" sitzen ALLE Karten auf einer gemeinsamen Grundlinie:',
    '// der Y-Position des Nulls. Ohne das liegen Karten unterschiedlicher Hoehe bei',
    '// gleicher Position verschieden tief und ueberlappen sich.',
    'var shift = dirUp * (enter - push);',
    'if (b("Stapel folgt Null")) {',
    '  var baseY = C.transform.position[1];',
    '  var edge = (dirUp > 0) ? (cardTop(thisLayer) + cardH(thisLayer)) : cardTop(thisLayer);',
    '  var y = baseY - edge + shift;',
    (scalar ? '  y' : '  [value[0], y]'),
    '} else {',
    (scalar ? '  value + shift' : '  value + [0, shift]'),
    '}'
  ].join('\n');
}

/** Expressions auf eine Karte legen. Gibt null zurueck oder den Grund fuers Ueberspringen. */
function nsSlider(L, name, wert) {
  var fx = L.effect(name);
  if (!fx) { fx = L.Effects.addProperty('ADBE Slider Control'); fx.name = name; }
  if (fx.property(1).numKeys === 0) fx.property(1).setValue(wert);
  return fx;
}

function nsRig(L) {
  if (L.locked) return 'gesperrt';
  if (L.name.indexOf(NS_PREFIX) !== 0) L.name = NS_PREFIX + L.name;
  var t = L.property('ADBE Transform Group');

  // Expressions zuerst abnehmen, sonst misst man das Ergebnis des alten Rigs
  var weg = ['ADBE Position', 'ADBE Position_1', 'ADBE Scale', 'ADBE Opacity'];
  for (var w = 0; w < weg.length; w++) {
    try { var pw = t.property(weg[w]); if (pw && pw.expressionEnabled) pw.expression = ''; } catch (e) {}
  }

  // einmal messen statt in jedem Bild
  var sc = 1, ap = 0, rect = null;
  try { sc = Math.abs(t.property('ADBE Scale').value[1]) / 100; } catch (e) {}
  try { ap = t.property('ADBE Anchor Point').value[1]; } catch (e) {}
  try { rect = L.sourceRectAtTime(L.inPoint, false); } catch (e) {}
  var hoehe = 120, oben = -60;
  if (rect && rect.height > 0) { hoehe = rect.height * sc; oben = (rect.top - ap) * sc; }
  else if (L.source && L.source.height) { hoehe = L.source.height * sc; oben = -ap * sc; }
  nsSlider(L, 'Karte Hoehe', hoehe);
  nsSlider(L, 'Karte Oberkante', oben);

  var kern = L.effect('NS Intern');
  if (!kern) { kern = L.Effects.addProperty('ADBE Point Control'); kern.name = 'NS Intern'; }
  kern.property(1).expression = nsKernExpr();
  var pos = t.property('ADBE Position');
  var sep = false;
  try { sep = pos.dimensionsSeparated; } catch (e) {}
  if (sep) {
    // getrennte Dimensionen: X bleibt unberuehrt, nur Y bekommt die Expression
    t.property('ADBE Position_1').expression = nsExprPos(true);
  } else {
    pos.expression = nsExprPos(false);
  }
  t.property('ADBE Scale').expression = nsExprScale();
  t.property('ADBE Opacity').expression = nsExprOpacity();
  return null;
}
function nsExprScale() {
  return nsHead() + '\n' + [
    'var from = s("Einlauf Skalierung")/100;',
    'var k = from + (1 - from) * born;',
    'k *= 1 - Math.min(0.9, depth * s("Verkleinern pro Karte")/100);',
    'value * k'
  ].join('\n');
}
function nsExprOpacity() {
  return nsHead() + '\n' + [
    'var fade = 1 - Math.min(1, depth * s("Abblenden pro Karte")/100);',
    'var cut = 1 - Math.min(1, Math.max(0, depth - s("Ausblenden ab Karte") + 1));',
    'value * born * fade * cut'
  ].join('\n');
}

// ---------------------------------------------------------------- API
function nsSetValues(paramStr) {
  var comp = nsComp();
  if (!comp) return 'Keine Komposition offen';
  var ctrl = nsFind(comp, NS_CTRL);
  if (!ctrl) return 'KEIN_RIG';
  // BEWUSST OHNE Undo-Gruppe: Beim Ziehen eines Reglers kommen viele Aufrufe
  // kurz hintereinander. Jeder eigene begin/endUndoGroup hat den Undo-Stapel
  // zerschossen ("Undo group mismatch") und ein Cmd+Z hat dann viel zu viel
  // zurueckgenommen. Reine Reglerwerte gehoeren ohnehin nicht in den Verlauf.
  if (nsBusy) return 'OK';
  nsBusy = true;
  try { nsWrite(ctrl, nsParse(paramStr)); }
  catch (e) { nsBusy = false; return 'Fehler: ' + e.toString(); }
  nsBusy = false;
  return 'OK';
}

function nsApply(paramStr) {
  var comp = nsComp();
  if (!comp) return 'Keine Komposition offen';
  var sel = comp.selectedLayers;
  if (!sel.length) return 'Bitte die Karten-Layer auswaehlen';

  app.beginUndoGroup('Notify Stack — anwenden');
  var n = 0, uebersprungen = '';
  try {
    var ctrl = nsEnsureCtrl(comp);
    nsWrite(ctrl, nsParse(paramStr));

    var skip = [];
    for (var i = 0; i < sel.length; i++) {
      var L = sel[i];
      if (L.name === NS_CTRL) continue;
      var grund = nsRig(L);
      if (grund) { skip.push(L.name + ' (' + grund + ')'); continue; }
      n++;
    }
    if (skip.length) uebersprungen = ', uebersprungen: ' + skip.join(', ');
  } catch (e) {
    app.endUndoGroup();
    return 'Fehler: ' + e.toString();
  }
  app.endUndoGroup();
  return 'OK' + n + ' Karten verrigt — Ankunft = Layer-Anfang' + uebersprungen;
}

/**
 * Neue Karte am Abspielkopf: dupliziert die ausgewaehlte Karte (sonst die
 * zuletzt eingetroffene) und setzt ihren Anfang auf die aktuelle Zeit.
 * Der haeufigste Handgriff — deshalb ein Knopf statt vier Schritte.
 */
function nsNewCard(paramStr) {
  var comp = nsComp();
  if (!comp) return 'Keine Komposition offen';

  var tpl = null, i;
  var sel = comp.selectedLayers;
  for (i = 0; i < sel.length; i++) {
    if (sel[i].name !== NS_CTRL) { tpl = sel[i]; break; }
  }
  if (!tpl) {                                  // nichts gewaehlt: juengste Karte nehmen
    for (i = 1; i <= comp.numLayers; i++) {
      var L = comp.layer(i);
      if (L.name.indexOf(NS_PREFIX) !== 0) continue;
      if (!tpl || L.inPoint > tpl.inPoint) tpl = L;
    }
  }
  if (!tpl) return 'Keine Vorlage da — waehle die Karte aus, die dupliziert werden soll';

  app.beginUndoGroup('Notify Stack — neue Karte');
  var dup;
  try {
    var ctrl = nsEnsureCtrl(comp);
    nsWrite(ctrl, nsParse(paramStr));

    dup = tpl.duplicate();
    dup.startTime += (comp.time - dup.inPoint);     // Ankunft = Abspielkopf
    nsRig(dup);

    for (i = 1; i <= comp.numLayers; i++) comp.layer(i).selected = false;
    dup.selected = true;
  } catch (e) {
    app.endUndoGroup();
    return 'Fehler: ' + e.toString();
  }
  app.endUndoGroup();
  return 'OK' + dup.name + ' bei ' + comp.time.toFixed(2) + 's';
}


// ---------------------------------------------------------------- Eigene Presets
// Liegen als Datei neben den AE-Einstellungen, nicht im Browser-Speicher des
// Panels: so ueberleben sie eine Neuinstallation der Erweiterung.
function nsPresetFile() {
  var dir = new Folder(Folder.userData.fsName + '/de.yunussezer.notifystack');
  if (!dir.exists) dir.create();
  return new File(dir.fsName + '/presets.json');
}

function nsPresetsRead() {
  try {
    var f = nsPresetFile();
    if (!f.exists) return '';
    f.encoding = 'UTF-8';
    f.open('r');
    var txt = f.read();
    f.close();
    return encodeURIComponent(txt || '');
  } catch (e) { return ''; }
}

function nsPresetsWrite(encoded) {
  try {
    var f = nsPresetFile();
    f.encoding = 'UTF-8';
    f.open('w');
    f.write(decodeURIComponent(encoded));
    f.close();
    return 'OK' + f.fsName;
  } catch (e) { return 'Fehler: ' + e.toString(); }
}


/**
 * Rig wieder loesen: Expressions weg, Zusatzregler weg, Namenspraefix weg.
 * Ohne Auswahl gilt es fuer alle Karten der Komposition, dann faellt auch
 * das Steuer-Null weg. Die Layer selbst bleiben unangetastet.
 */
function nsClear() {
  var comp = nsComp();
  if (!comp) return 'Keine Komposition offen';

  var ziele = [], i, L;
  var sel = comp.selectedLayers;
  for (i = 0; i < sel.length; i++) {
    if (sel[i].name.indexOf(NS_PREFIX) === 0) ziele.push(sel[i]);
  }
  var alle = ziele.length === 0;
  if (alle) {
    for (i = 1; i <= comp.numLayers; i++) {
      L = comp.layer(i);
      if (L.name.indexOf(NS_PREFIX) === 0) ziele.push(L);
    }
  }
  if (!ziele.length) return 'Keine verrigten Karten gefunden';

  app.beginUndoGroup('Notify Stack — Rig loesen');
  var n = 0;
  try {
    for (i = 0; i < ziele.length; i++) {
      L = ziele[i];
      var t = L.property('ADBE Transform Group');
      var namen = ['ADBE Position', 'ADBE Position_1', 'ADBE Scale', 'ADBE Opacity'];
      for (var k = 0; k < namen.length; k++) {
        try {
          var pr = t.property(namen[k]);
          if (pr && pr.expressionEnabled) pr.expression = '';
        } catch (e) {}
      }
      try { if (L.effect('Karte Hoehe')) L.effect('Karte Hoehe').remove(); } catch (e) {}
      try { if (L.effect('Karte Oberkante')) L.effect('Karte Oberkante').remove(); } catch (e) {}
      try { if (L.effect('NS Intern')) L.effect('NS Intern').remove(); } catch (e) {}
      L.name = L.name.substring(NS_PREFIX.length);
      n++;
    }
    if (alle) {
      var ctrl = nsFind(comp, NS_CTRL);
      if (ctrl) ctrl.remove();
    }
  } catch (e) {
    app.endUndoGroup();
    return 'Fehler: ' + e.toString();
  }
  app.endUndoGroup();
  return 'OK' + n + (alle ? ' Karten geloest, Null entfernt' : ' Karten geloest');
}


// ---------------------------------------------------------------- Kartenbaukasten
// Es wird KEIN Kartendesign erfunden: als Vorlage dient immer eine Komposition
// aus dem Projekt. Der Baukasten tauscht nur Texte und Bilder aus.
// Trenner: Datensaetze mit ";;", Felder mit "|||".

/** Alle Kompositionen, die als Kartenvorlage taugen. */
function nsListComps() {
  var out = [];
  for (var i = 1; i <= app.project.numItems; i++) {
    var it = app.project.item(i);
    if (!(it instanceof CompItem)) continue;
    if (it.name.indexOf('NOTIFY') === 0) continue;
    out.push(it.name + '|||' + it.width + '|||' + it.height);
  }
  return encodeURIComponent(out.join(';;'));
}

function nsFindComp(name) {
  for (var i = 1; i <= app.project.numItems; i++) {
    var it = app.project.item(i);
    if (it instanceof CompItem && it.name === name) return it;
  }
  return null;
}

/** Text- und Bildebenen einer Vorlage, damit das Panel Felder anbieten kann. */
function nsCardFields(encName) {
  var comp = nsFindComp(decodeURIComponent(encName));
  if (!comp) return '';
  var out = [];
  for (var i = 1; i <= comp.numLayers; i++) {
    var L = comp.layer(i);
    var txt = null;
    try { txt = L.property('ADBE Text Properties').property('ADBE Text Document'); } catch (e) {}
    if (txt) { out.push('text|||' + L.name + '|||' + txt.value.text); continue; }
    if (L.source && (L.source instanceof FootageItem)) out.push('bild|||' + L.name + '|||' + L.source.name);
  }
  return encodeURIComponent(out.join(';;'));
}

/** Alle Bilder im Projekt, zur Auswahl fuer Logo und Avatar. */
function nsListFootage() {
  var out = [];
  for (var i = 1; i <= app.project.numItems; i++) {
    var it = app.project.item(i);
    if (it instanceof FootageItem) out.push(it.name);
  }
  return encodeURIComponent(out.join(';;'));
}

function nsSetzeTexte(comp, paare) {
  for (var i = 0; i < paare.length; i++) {
    var teil = paare[i].split('|||');
    if (teil.length < 2) continue;
    for (var L = 1; L <= comp.numLayers; L++) {
      var lay = comp.layer(L);
      if (lay.name !== teil[0]) continue;
      try {
        var prop = lay.property('ADBE Text Properties').property('ADBE Text Document');
        var td = prop.value;
        td.text = teil[1];
        prop.setValue(td);
      } catch (e) {}
      break;
    }
  }
}

function nsSetzeBild(comp, layerName, footageName) {
  var quelle = null;
  for (var i = 1; i <= app.project.numItems; i++) {
    var it = app.project.item(i);
    if (it instanceof FootageItem && it.name === footageName) { quelle = it; break; }
  }
  if (!quelle) return;
  for (var L = 1; L <= comp.numLayers; L++) {
    if (comp.layer(L).name !== layerName) continue;
    try { comp.layer(L).replaceSource(quelle, false); } catch (e) {}
    break;
  }
}

/**
 * Karte bauen: Vorlage duplizieren, Texte und Bild ersetzen.
 * Argument (URL-kodiert), Datensaetze mit ";;":
 *   vorlage ;; kartenname ;; bildLayer|||bildName ;; ebenenname|||text ...
 */
function nsCardBuild(arg) {
  var teile = decodeURIComponent(arg).split(';;');
  var vorlage = nsFindComp(teile[0]);
  if (!vorlage) return 'Vorlage nicht gefunden';
  var kartenName = teile[1] || (vorlage.name + ' Karte');

  app.beginUndoGroup('Notify Stack - Karte bauen');
  var neu;
  try {
    neu = vorlage.duplicate();
    neu.name = kartenName;
    if (teile[2]) {
      var b = teile[2].split('|||');
      if (b.length === 2 && b[1]) nsSetzeBild(neu, b[0], b[1]);
    }
    nsSetzeTexte(neu, teile.slice(3));
  } catch (e) { app.endUndoGroup(); return 'Fehler: ' + e.toString(); }
  app.endUndoGroup();
  return 'OK' + neu.name;
}

/** Rendert ein Bild der Karte fuer die Panel-Vorschau und gibt den Pfad zurueck. */
function nsCardPreview(encName) {
  var comp = nsFindComp(decodeURIComponent(encName));
  if (!comp) return 'Komposition nicht gefunden';
  try {
    var dir = new Folder(Folder.temp.fsName + '/notifystack');
    if (!dir.exists) dir.create();
    var f = new File(dir.fsName + '/vorschau_' + (new Date().getTime()) + '.png');
    comp.saveFrameToPng(0, f);
    return 'OK' + f.fsName;
  } catch (e) { return 'Fehler: ' + e.toString(); }
}

/** Karte in die aktive Komposition legen, am Abspielkopf, fertig verrigt. */
function nsCardPlace(arg) {
  var teile = decodeURIComponent(arg).split(';;');
  var karte = nsFindComp(teile[0]);
  var comp = nsComp();
  if (!karte) return 'Karte nicht gefunden';
  if (!comp) return 'Keine Komposition offen';

  app.beginUndoGroup('Notify Stack - Karte einfuegen');
  var L;
  try {
    var ctrl = nsEnsureCtrl(comp);
    if (teile[1]) nsWrite(ctrl, nsParse(teile[1]));
    L = comp.layers.add(karte);
    L.startTime += (comp.time - L.inPoint);
    nsRig(L);
    for (var i = 1; i <= comp.numLayers; i++) comp.layer(i).selected = false;
    L.selected = true;
  } catch (e) { app.endUndoGroup(); return 'Fehler: ' + e.toString(); }
  app.endUndoGroup();
  return 'OK' + L.name + ' bei ' + comp.time.toFixed(2) + 's';
}

/** Kurzinfo fuer die Statuszeile. */
function nsInfo() {
  var comp = nsComp();
  if (!comp) return 'Keine Komposition offen';
  var cards = 0;
  for (var i = 1; i <= comp.numLayers; i++) {
    if (comp.layer(i).name.indexOf(NS_PREFIX) === 0) cards++;
  }
  return comp.name + ' — ' + cards + ' Karten, ' + comp.selectedLayers.length + ' ausgewaehlt';
}
