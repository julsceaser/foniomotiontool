// fonio-dots → After Effects
// Datei > Skripte > Skriptdatei ausführen… → dieses Skript → JSON wählen.
// Baut eine Comp "DOTS <modus>" mit einem Shape-Layer pro Punkt.
// baked: Keyframe pro Frame (exakt wie im Tool, inkl. Ausweichen/Organik)
// slim:  2 Position-Keys mit Easing + Farb-Keys — im Graph Editor editierbar.

(function () {
  function hexToRgb(h) {
    if (!h) return [0, 0, 0];
    h = String(h).replace('#', '');
    return [
      parseInt(h.substr(0, 2), 16) / 255,
      parseInt(h.substr(2, 2), 16) / 255,
      parseInt(h.substr(4, 2), 16) / 255,
    ];
  }

  var f = File.openDialog('fonio-dots JSON wählen', '*.json');
  if (!f) return;
  f.encoding = 'UTF-8';
  f.open('r');
  var data;
  try { data = JSON.parse(f.read()); } catch (e) { alert('JSON konnte nicht gelesen werden: ' + e); return; }
  f.close();
  if (!data || data.tool !== 'fonio-dots') { alert('Das ist kein fonio-dots-Export.'); return; }

  app.beginUndoGroup('fonio dots import');

  var W = data.width, H = data.height, fps = data.fps || 30;
  var durTotal = (data.durationSec || 2) + 1; // 1s Nachlauf
  var comp = app.project.items.addComp('DOTS ' + (data.mode || ''), W, H, 1, durTotal, fps);

  // Hintergrund
  var bgLayer = comp.layers.addSolid(hexToRgb(data.bg || '#ffffff'), 'BG', W, H, 1);
  bgLayer.moveToEnd();

  // CTRL-Null mit Infos
  var ctrl = comp.layers.addNull();
  ctrl.name = 'CTRL DOTS';
  ctrl.comment = 'weg=' + data.params.weg + ' organik=' + data.params.organik +
    ' ruecksicht=' + data.params.ruecksicht + ' welle=' + data.params.welle;

  var dotD = data.dotSize || 9;
  var n = data.dots.length;

  for (var i = 0; i < n; i++) {
    var d = data.dots[i];
    var lay = comp.layers.addShape();
    lay.name = 'dot ' + (i + 1);

    var grp = lay.property('ADBE Root Vectors Group').addProperty('ADBE Vector Group');
    var ell = grp.property('ADBE Vectors Group').addProperty('ADBE Vector Shape - Ellipse');
    ell.property('ADBE Vector Ellipse Size').setValue([dotD, dotD]);
    var fill = grp.property('ADBE Vectors Group').addProperty('ADBE Vector Graphic - Fill');
    var fillCol = fill.property('ADBE Vector Fill Color');
    var pos = lay.property('ADBE Transform Group').property('ADBE Position');

    if (data.mode === 'baked') {
      var times = [], vals = [];
      var frames = d.pos.length / 2;
      for (var k = 0; k < frames; k++) {
        times.push(k / fps);
        vals.push([d.pos[k * 2], d.pos[k * 2 + 1]]);
      }
      pos.setValuesAtTimes(times, vals);
      // Farbe: nur Keyframes setzen, wenn sie sich ändert (spart Masse)
      var lastCol = null;
      for (var c = 0; c < d.col.length; c++) {
        if (d.col[c] !== lastCol) {
          fillCol.setValueAtTime(c / fps, hexToRgb(d.col[c]));
          lastCol = d.col[c];
        }
      }
    } else {
      // slim: 2 Keys + weiches Easing
      var t0 = d.delay, t1 = d.delay + d.dur;
      pos.setValueAtTime(t0, d.a);
      pos.setValueAtTime(t1, d.b);
      var easeIn = new KeyframeEase(0, 66);
      var easeOut = new KeyframeEase(0, 66);
      pos.setTemporalEaseAtKey(1, [easeOut], [easeOut]);
      pos.setTemporalEaseAtKey(2, [easeIn], [easeIn]);
      fillCol.setValueAtTime(t0, hexToRgb(d.colA));
      fillCol.setValueAtTime(t1, hexToRgb(d.colB));
      if (d.blitz) {
        fillCol.setValueAtTime(t1 - 0.08, hexToRgb(d.colA));
        fillCol.setValueAtTime(t1, hexToRgb(d.blitz));
        fillCol.setValueAtTime(t1 + 0.25, hexToRgb(d.colB));
      }
    }
    lay.parent = ctrl;
  }

  ctrl.property('ADBE Transform Group').property('ADBE Position').setValue([W / 2, H / 2]);
  app.endUndoGroup();
  alert('Fertig: ' + n + ' Dots in Comp "' + comp.name + '" (' + (data.mode || '?') + ').');
})();
