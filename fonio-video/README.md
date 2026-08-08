# fonio-video

Remotion-Projekt für das Fonio 60s-Erklärvideo mit Mehrsprachen-Rendering
(aktuell `de` + `en`, erweiterbar auf 8 Sprachen).

- **Format:** 1920×1080, 30 fps, H.264
- **Composition:** `FonioExplainer` (aktuell 3 Szenen, ~20 s / 600 Frames)
- **Font:** Geist via `@remotion/google-fonts/Geist`
- **Sprache:** kommt als `inputProps` (`{ "lang": "de" | "en" }`) in die Composition

## Setup

```bash
npm install
```

## Studio (Vorschau)

```bash
npm run studio    # alias: npm run dev
```

Im Studio kann `lang` über die Props-Sidebar umgeschaltet werden.

## Alle Sprachen rendern

```bash
npm run render:all
```

Rendert über `scripts/render-all.mjs` (Node-API: `@remotion/bundler` +
`@remotion/renderer`) für alle Sprachen in `LANGS`:

- `out/fonio-60s-de.mp4`
- `out/fonio-60s-en.mp4`

## Einzelrender / Stills (CLI)

```bash
# Einzelnes Video
npx remotion render src/index.ts FonioExplainer out/fonio-60s-de.mp4 --props='{"lang":"de"}'

# Verifikations-Still aus Szene04 (Nummer + Button sichtbar)
npx remotion still src/index.ts FonioExplainer out/verify-s04.png --frame=300 --props='{"lang":"de"}'
```

## Struktur

```
src/
  index.ts            Remotion-Entry (registerRoot)
  Root.tsx            Composition "FonioExplainer" (1920×1080, 30fps, 600 Frames)
  FonioVideo.tsx      Series der Szenen + Szenen-Dauern
  theme.ts            Fonio-Brand-Tokens (#585DFE, #0F0F16, #09090B, #71717A …)
  fonts.ts            Geist via @remotion/google-fonts
  i18n/
    de.json           Master-Texte (Deutsch)
    en.json           Englische Übersetzung (Keys identisch zu de.json)
    index.ts          t(lang)-Helper + Lang-Typ
  scenes/
    Szene01.tsx       5 s, dunkel (#0F0F16): zwei Typo-Zeilen faden nacheinander ein
    Szene04.tsx       9 s, weiß: Nummern-Pill (AT-Flagge, +43, tippende Nummer mit
                      Caret), CTA-Button (#585DFE) mit spring() + zwei Puls-Ringen
    Szene14.tsx       6 s, weiß: "Es läutet." groß, dann Zeile 2/3 gestaffelt
scripts/
  render-all.mjs      Bundle einmal, dann renderMedia() pro Sprache
```

## Neue Sprache hinzufügen

1. `src/i18n/<lang>.json` anlegen (Keys aus `de.json` übernehmen).
2. In `src/i18n/index.ts` importieren, in `strings` + `Lang`-Typ eintragen.
3. In `scripts/render-all.mjs` die Sprache zu `LANGS` hinzufügen.

## Szenen-Timing (Frames, global)

| Szene   | Frames    | Inhalt                          |
| ------- | --------- | ------------------------------- |
| Szene01 | 0–149     | Typo-Intro dunkel               |
| Szene04 | 150–419   | Nummernfeld + CTA (Still: ~300) |
| Szene14 | 420–599   | "Es läutet." Outro              |
