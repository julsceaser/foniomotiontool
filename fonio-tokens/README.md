# fonio-tokens

Die Fonio Token-Kette — **Single Source of Truth** für alle Brand-Farben, Radii und Fonts.
Eine JSON-Datei rein, drei Formate raus (CSS, Figma-JSON, JS/Remotion) — gebaut mit [Style Dictionary v5](https://styledictionary.com).

## Struktur

```
fonio-tokens/
├── tokens/
│   └── fonio.json          ← SINGLE SOURCE OF TRUTH (DTCG-Format, $value/$type)
├── build.js                ← Style-Dictionary-v5-Build (ESM-API)
└── build/                  ← generiert, NICHT von Hand editieren
    ├── css/variables.css   ← CSS Custom Properties (:root, shadcn-Stil)
    ├── json/tokens-flat.json ← flaches Key→Hex-JSON (Figma-Plugin-API / Variables)
    └── js/tokens.js        ← ES-Modul (Remotion / Lab)
```

## Setup & Build

```bash
npm install     # einmalig
npm run build   # generiert alle 3 Outputs in build/
```

## Eine Farbe ändern (Workflow)

1. **Nur** `tokens/fonio.json` editieren — z. B. Blue MAIN anpassen:

   ```json
   "blue-main": { "$value": "#585DFE", "$type": "color" }
   ```

2. Neu bauen:

   ```bash
   npm run build
   ```

3. Fertig — der neue Wert steht jetzt konsistent in allen drei Outputs:
   - `build/css/variables.css` → `--color-base-blue-main: #585dfe;`
   - `build/json/tokens-flat.json` → `"color-base-blue-main": "#585dfe"`
   - `build/js/tokens.js` → `color.base["blue-main"] === "#585dfe"`

Die Dateien in `build/` niemals direkt editieren — sie werden bei jedem Build überschrieben.

## Token-Set (Fonio Brand)

| Gruppe | Tokens |
|---|---|
| `color/base` | blue-main `#585DFE` · blue-app `#585DF5` (shadcn-Lila) · cyan `#58E8FE` · green `#58FE85` · white `#FFFFFF` · dark `#0F0F16` |
| `color/orb` | 8 Dominante orb-10…orb-80 (`#DCFAFC` → `#85B2F5`) + 4 Akzente: mint `#A6EEC9`, aqua `#9FF2E6`, sky `#70B6EE`, periwinkle `#6B98E8` |
| `color/neutral` | foreground `#09090B` · muted-fg `#71717A` · muted `#F4F4F5` · border `#E4E4E7` · graybg `#F7F8FC` · lavender `#EEEFFE` |
| `radius` | sm 10px · md 12px · lg 16px · xl 20px |
| `font` | family/geist: `Geist, system-ui, sans-serif` |

## Outputs verwenden

**CSS** (App / shadcn):

```css
@import "./build/css/variables.css";
.cta { background: var(--color-base-blue-main); border-radius: var(--radius-md); }
```

**Figma** (Plugin-API → Variables): `build/json/tokens-flat.json` einlesen und die
Key→Hex-Paare per `figma.variables.createVariable()` / `setValueForMode()` schreiben.
Keys sind kebab-case (`color-orb-orb-10`), Werte fertige Hex-Strings.

**Remotion / Lab** (ES-Modul):

```js
import tokens from "./build/js/tokens.js";
const blue = tokens.color.base["blue-main"]; // "#585dfe"
```

## Neue Tokens hinzufügen

Neue Einträge in `tokens/fonio.json` im DTCG-Format anlegen (`$value` + `$type`,
optional `$description`), dann `npm run build`. Style Dictionary erzeugt die Namen
automatisch aus dem Pfad: `color.orb.orb-10` → `--color-orb-orb-10` / `color-orb-orb-10`.

## Technik-Notizen

- Style Dictionary **v5** nutzt die ESM-API: `new StyleDictionary({...})` + `await sd.buildAllPlatforms()` (siehe `build.js`). `package.json` hat dafür `"type": "module"`.
- Das flache Figma-JSON kommt aus einem eigenen Format `json/flat-figma` (registriert in `build.js`), das kebab-case-Namen mit den DTCG-`$value`s verknüpft.
- Das JS-Modul nutzt das eingebaute Format `javascript/esm` mit `minify: true` — nur Werte, keine Token-Metadaten.
- Hex-Werte werden im Output lowercase normalisiert (`#585DFE` → `#585dfe`) — identische Farbe.
