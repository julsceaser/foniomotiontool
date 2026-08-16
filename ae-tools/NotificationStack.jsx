/**
 * Notification Stack Rig — fonio / Yunus
 * ------------------------------------------------------------------
 * Baut einen iPhone-Lockscreen-Stapel: neue Karte kommt unten rein,
 * alle darueber weichen aus. Jede Karte rechnet ihre Position selbst
 * als Summe der Schuebe aller spaeter eingetroffenen Karten — dadurch
 * ergeben sich unterschiedliche Hoehen, gestaffeltes Nachziehen und
 * ueberlagerte Bewegungen von allein.
 *
 * BEDIENUNG
 *   1. Karten-Layer auswaehlen (Precomps, Shapes, Texte — egal)
 *   2. Dieses Script ausfuehren
 *   3. Ankunftszeit = Layer-Anfang. Umtimen = Layerbalken schieben.
 *   4. Alles Kreative liegt als Regler auf "NOTIFY CTRL" (Effect Controls)
 *
 * Kein Regler-Name enthaelt Umlaute: ExtendScript-Dateien werden je nach
 * Kodierung verstuemmelt, und die Namen stehen woertlich in den Expressions.
 *
 * Nichts wird geloescht, nichts gespeichert. Ein Undo-Schritt.
 */

(function notificationStack() {
  var CTRL = 'NOTIFY CTRL';
  var PREFIX = 'NC ';

  var comp = app.project.activeItem;
  if (!(comp && comp instanceof CompItem)) {
    alert('Bitte zuerst eine Komposition oeffnen.');
    return;
  }
  var sel = comp.selectedLayers;
  if (!sel.length) {
    alert('Bitte die Karten-Layer auswaehlen, die gestapelt werden sollen.');
    return;
  }

  // ---------------------------------------------------------------- Regler
  // Jeder Wert, an dem Yunus drehen koennen soll, liegt hier — sonst nirgends.
  var CONTROLS = [
    ['--- STRUKTUR ---', 'slider', 0, 0, 0],
    ['Abstand', 'slider', 14, 0, 200],
    ['Von unten', 'checkbox', 1],
    ['Stapeln oben', 'slider', 0, 0, 100],
    ['Stapeln ab Karte', 'slider', 3, 1, 20],

    ['--- EINLAUF ---', 'slider', 0, 0, 0],
    ['Einlauf Distanz', 'slider', 260, 0, 2000],
    ['Einlauf Frequenz', 'slider', 1.6, 0.1, 8],
    ['Einlauf Daempfung', 'slider', 9, 0.5, 40],
    ['Einlauf Skalierung', 'slider', 92, 50, 130],

    ['--- AUSWEICHEN ---', 'slider', 0, 0, 0],
    ['Ausweichen Frequenz', 'slider', 1.15, 0.1, 8],
    ['Ausweichen Daempfung', 'slider', 11, 0.5, 40],
    ['Versatz pro Karte', 'slider', 1.5, 0, 12],

    ['--- TIEFE NACH OBEN ---', 'slider', 0, 0, 0],
    ['Verkleinern pro Karte', 'slider', 1.5, 0, 15],
    ['Abblenden pro Karte', 'slider', 6, 0, 50],
    ['Ausblenden ab Karte', 'slider', 5, 1, 30],
  ];

  function findLayer(name) {
    for (var i = 1; i <= comp.numLayers; i++) {
      if (comp.layer(i).name === name) return comp.layer(i);
    }
    return null;
  }

  function ensureControls(nullLayer) {
    for (var i = 0; i < CONTROLS.length; i++) {
      var c = CONTROLS[i], name = c[0], kind = c[1];
      if (nullLayer.effect(name)) continue;             // schon da: Werte behalten
      var matchName = kind === 'checkbox' ? 'ADBE Checkbox Control' : 'ADBE Slider Control';
      var fx = nullLayer.Effects.addProperty(matchName);
      fx.name = name;
      if (name.indexOf('---') === 0) continue;          // reine Ueberschrift
      fx.property(1).setValue(c[2]);
    }
  }

  // ---------------------------------------------------------------- Expressions
  // Gemeinsamer Kopf: Regler lesen, Feder- und Hoehenfunktion.
  var HEAD = [
    'var C = thisComp.layer("' + CTRL + '");',
    'function s(n){ return C.effect(n)("Slider").value; }',
    'function b(n){ return C.effect(n)("Checkbox").value; }',
    'var gap = s("Abstand");',
    'var dirUp = b("Von unten") ? 1 : -1;',
    'var stackAmt = s("Stapeln oben")/100;',
    'var stackFrom = Math.max(1, s("Stapeln ab Karte"));',
    'var fIn = s("Einlauf Frequenz"), dIn = s("Einlauf Daempfung");',
    'var fSh = s("Ausweichen Frequenz"), dSh = s("Ausweichen Daempfung");',
    'var stag = s("Versatz pro Karte") * thisComp.frameDuration;',
    '',
    '// Gedaempfte Feder: 0 -> 1 mit Ueberschwingen',
    'function spring(t, f, d){',
    '  if (t <= 0) return 0;',
    '  var w = f * Math.PI * 2;',
    '  return 1 - Math.exp(-d * t) * (Math.cos(w * t) + (d / w) * Math.sin(w * t));',
    '}',
    '',
    '// Hoehe einer Karte: manueller Wert schlaegt Automatik',
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
    '',
    '// Ueber alle spaeter eingetroffenen Karten summieren.',
    '// push = Verschiebung in px, depth = wie tief im Stapel (animiert)',
    'var push = 0, depth = 0, later = 0;',
    'for (var i = 1; i <= thisComp.numLayers; i++){',
    '  var L = thisComp.layer(i);',
    '  if (L.index == index) continue;',
    '  if (L.name.indexOf("' + PREFIX + '") != 0) continue;',
    '  if (L.inPoint <= inPoint) continue;',
    '  var p = spring(time - L.inPoint - later * stag, fSh, dSh);',
    '  var squeeze = 1 - stackAmt * Math.min(1, later / stackFrom);',
    '  push += (cardH(L) + gap) * squeeze * p;',
    '  depth += p;',
    '  later++;',
    '}',
    'var born = spring(time - inPoint, fIn, dIn);',
  ].join('\n');

  var EXPR_POS = HEAD + '\n' + [
    '',
    '// eigener Einlauf: startet unterhalb der Zielposition',
    'var enter = (1 - born) * s("Einlauf Distanz");',
    'value + [0, dirUp * (enter - push)]',
  ].join('\n');

  var EXPR_SCALE = HEAD + '\n' + [
    '',
    'var from = s("Einlauf Skalierung")/100;',
    'var k = from + (1 - from) * born;                    // Einlauf',
    'k *= 1 - Math.min(0.9, depth * s("Verkleinern pro Karte")/100);   // Tiefe',
    'value * k',
  ].join('\n');

  var EXPR_OPACITY = HEAD + '\n' + [
    '',
    'var fade = 1 - Math.min(1, depth * s("Abblenden pro Karte")/100);',
    'var cut = 1 - Math.min(1, Math.max(0, depth - s("Ausblenden ab Karte") + 1));',
    'value * born * fade * cut',
  ].join('\n');

  // ---------------------------------------------------------------- Bauen
  app.beginUndoGroup('Notification Stack Rig');
  try {
    var ctrl = findLayer(CTRL);
    if (!ctrl) {
      ctrl = comp.layers.addNull();
      ctrl.name = CTRL;
      ctrl.enabled = false;
      ctrl.moveToBeginning();
      ctrl.startTime = 0;
      ctrl.inPoint = 0;
      ctrl.outPoint = comp.duration;
    }
    ensureControls(ctrl);

    var n = 0;
    for (var i = 0; i < sel.length; i++) {
      var L = sel[i];
      if (L.name === CTRL) continue;

      if (L.name.indexOf(PREFIX) !== 0) L.name = PREFIX + L.name;

      if (!L.effect('Karte Hoehe')) {
        var hFx = L.Effects.addProperty('ADBE Slider Control');
        hFx.name = 'Karte Hoehe';
        hFx.property(1).setValue(0);   // 0 = automatisch aus den Layer-Massen
      }

      L.transform.position.expression = EXPR_POS;
      L.transform.scale.expression = EXPR_SCALE;
      L.transform.opacity.expression = EXPR_OPACITY;
      n++;
    }

    alert(
      n + ' Karten verrigt.\n\n' +
      'Alle Regler liegen auf "' + CTRL + '" (Effect Controls).\n' +
      'Ankunft einer Karte = ihr Layer-Anfang — zum Umtimen einfach den Layerbalken schieben.\n\n' +
      '"Karte Hoehe" auf der Karte: 0 = Hoehe automatisch, sonst manuell in px.'
    );
  } catch (err) {
    alert('Fehler: ' + err.toString() + (err.line ? ' (Zeile ' + err.line + ')' : ''));
  }
  app.endUndoGroup();
})();
