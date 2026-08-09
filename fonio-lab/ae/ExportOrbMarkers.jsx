// ExportOrbMarkers.jsx — After Effects Marker-Export für den Fonio-Orb-Renderer.
// Nutzung: Layer mit Markern auswählen (Marker-Name = Zustand, z. B. "thinking";
// optional Transition-Dauer im Kommentar nach Doppelpunkt: "thinking:0.8"),
// dann Datei > Skripte > Skriptdatei ausführen… > dieses Script.
// Ergebnis: JSON-Datei, die scripts/render-orb.mjs als --timeline nimmt.
(function () {
  var comp = app.project.activeItem;
  if (!(comp && comp instanceof CompItem)) { alert('Bitte eine Komposition öffnen.'); return; }
  var layer = comp.selectedLayers.length ? comp.selectedLayers[0] : null;
  if (!layer) { alert('Bitte den Layer mit den Zustands-Markern auswählen.'); return; }
  var mk = layer.property('Marker');
  if (!mk || mk.numKeys === 0) { alert('Der Layer hat keine Marker.'); return; }

  var markers = [];
  for (var i = 1; i <= mk.numKeys; i++) {
    var t = mk.keyTime(i);
    var cm = mk.keyValue(i).comment; // "thinking" oder "thinking:0.8"
    var parts = cm.split(':');
    var entry = '{ "time": ' + t.toFixed(3) + ', "state": "' + parts[0].replace(/\s+/g, '') + '"';
    if (parts.length > 1 && !isNaN(parseFloat(parts[1]))) entry += ', "transition": ' + parseFloat(parts[1]);
    entry += ' }';
    markers.push(entry);
  }
  var json = '{\n  "duration": ' + comp.duration.toFixed(3) + ',\n  "fps": ' + (1 / comp.frameDuration).toFixed(2) + ',\n  "markers": [\n    ' + markers.join(',\n    ') + '\n  ]\n}\n';

  var f = File.saveDialog('Timeline-JSON speichern', 'JSON:*.json');
  if (!f) return;
  f.open('w'); f.encoding = 'UTF-8'; f.write(json); f.close();
  alert('Exportiert: ' + f.fsName + '\n\nRendern mit:\nnode scripts/render-orb.mjs --timeline <pfad> --audio <voice.wav>');
})();
