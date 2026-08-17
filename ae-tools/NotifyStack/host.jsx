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
function nsHead() {
  return [
    'var C = thisComp.layer("' + NS_CTRL + '");',
    'function s(n){ return C.effect(n)("Slider").value; }',
    'function b(n){ return C.effect(n)("Checkbox").value; }',
    'var gap = s("Abstand");',
    'var dirUp = b("Von unten") ? 1 : -1;',
    'var stackAmt = s("Stapeln oben")/100;',
    'var stackFrom = Math.max(1, s("Stapeln ab Karte"));',
    'var fIn = s("Einlauf Frequenz"), dIn = s("Einlauf Daempfung");',
    'var fSh = s("Ausweichen Frequenz"), dSh = s("Ausweichen Daempfung");',
    'var stag = s("Versatz pro Karte") * thisComp.frameDuration;',
    'function spring(t, f, d){',
    '  if (t <= 0) return 0;',
    '  var w = f * Math.PI * 2;',
    '  return 1 - Math.exp(-d * t) * (Math.cos(w * t) + (d / w) * Math.sin(w * t));',
    '}',
    '// Abstand vom Positionspunkt zur Unter- bzw. Oberkante der Karte.',
    '// sourceRectAtTime liefert die Quellmasse mit top=0, der Drehpunkt steht',
    '// separat — nur beides zusammen ergibt die echte Kante (in AE nachgemessen).',
    'function edgeOff(L, bottom){',
    '  var sc = 1, ap = 0, r = null;',
    '  try { sc = Math.abs(L.transform.scale.value[1]) / 100; } catch(e){}',
    '  try { ap = L.transform.anchorPoint.value[1]; } catch(e){}',
    '  try { r = L.sourceRectAtTime(L.inPoint, false); } catch(e){}',
    '  if (!r) return 0;',
    '  return ((bottom ? (r.top + r.height) : r.top) - ap) * sc;',
    '}',
    '// Die gemessene Hoehe wird mit der aktuellen Skalierung verrechnet. Da die',
    '// Tiefen-Verkleinerung ebenfalls auf die Skalierung wirkt, braucht eine',
    '// tief liegende Karte etwas weniger Platz — im Test 365 statt 368 px.',
    '// Das ist gewollt: was kleiner aussieht, belegt auch weniger Raum.',
    'function cardH(L){',
    '  var manual = 0;',
    '  try { manual = L.effect("Karte Hoehe")("Slider").value; } catch(e){}',
    '  if (manual > 0) return manual;',
    '  var sc = 1;',
    '  try { sc = Math.abs(L.transform.scale.value[1]) / 100; } catch(e){}',
    '  try { var r = L.sourceRectAtTime(L.inPoint, false); if (r.height > 0) return r.height * sc; } catch(e){}',
    '  try { if (L.source && L.source.height) return L.source.height * sc; } catch(e){}',
    '  return 120;',
    '}',
    'var push = 0, depth = 0, later = 0;',
    'for (var i = 1; i <= thisComp.numLayers; i++){',
    '  var L = thisComp.layer(i);',
    '  if (L.index == index) continue;',
    '  if (L.name.indexOf("' + NS_PREFIX + '") != 0) continue;',
    '  if (L.inPoint <= inPoint) continue;',
    '  var pr = spring(time - L.inPoint - later * stag, fSh, dSh);',
    '  var squeeze = 1 - stackAmt * Math.min(1, later / stackFrom);',
    '  push += (cardH(L) + gap) * squeeze * pr;',
    '  depth += pr;',
    '  later++;',
    '}',
    'var born = spring(time - inPoint, fIn, dIn);'
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
    '  var y = baseY - edgeOff(thisLayer, dirUp > 0) + shift;',
    (scalar ? '  y' : '  [value[0], y]'),
    '} else {',
    (scalar ? '  value + shift' : '  value + [0, shift]'),
    '}'
  ].join('\n');
}

/** Expressions auf eine Karte legen. Gibt null zurueck oder den Grund fuers Ueberspringen. */
function nsRig(L) {
  if (L.locked) return 'gesperrt';
  if (L.name.indexOf(NS_PREFIX) !== 0) L.name = NS_PREFIX + L.name;
  if (!L.effect('Karte Hoehe')) {
    var h = L.Effects.addProperty('ADBE Slider Control');
    h.name = 'Karte Hoehe';
    h.property(1).setValue(0);
  }
  var t = L.property('ADBE Transform Group');
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
