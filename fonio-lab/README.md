# fonio-lab — Fonio Brand Visual Lab

Vite + React + TypeScript playground for the Fonio brand visuals: the pastel
**orb** (mesh-gradient shader) and the branded **soundwave** (wavesurfer.js).

## Start

```bash
npm install
npm run dev          # -> http://localhost:5173
```

Production build: `npm run build`, preview via `npm run preview`.

## Pages

| Route   | Content |
| ------- | ------- |
| `/`     | The orb: `MeshGradient` from `@paper-design/shaders-react`, 480x480, round, colors = the 4 brand base colors (white, `#585DFE`, `#58E8FE`, `#58FE85`). White is weighted 5/10 in the color array and green only 1/10 so the mesh reads pastel and mint stays a hint. Sliders for **speed**, **distortion**, **swirl** and **soften** (white overlay opacity) for live tuning. Soft edge via CSS radial mask. |
| `/wave` | Soundwave: wavesurfer.js v7, `barWidth 12 · barGap 14 · barRadius 6 · height 280`, horizontal `CanvasGradient` across `#585DFE -> #58E8FE -> #58FE85`. Plays `public/demo.wav`. |

Routing is a minimal `pushState` toggle in `src/App.tsx` (no router dependency).
Font: Geist via Google Fonts (`index.html`), fallback `system-ui`.

## Scripts

```bash
node scripts/gen-audio.mjs   # regenerates public/demo.wav (6 s speech-like modulated noise)
node scripts/verify.mjs      # screenshots "/" and "/wave" from a running dev server
                             # (default base URL http://localhost:5199, pass another as arg)
```

Verification flow used during development:

```bash
npm run dev -- --port 5199 &     # start dev server
node scripts/verify.mjs          # writes verify-orb.png + verify-wave.png
```

Playwright (`devDependency`) + Chromium (`npx playwright install chromium`) are
required for `verify.mjs`.

## Brand tokens

Defined as CSS variables in `src/index.css`: brand `#585DFE`, app purple
`#585DF5`, cyan `#58E8FE`, green `#58FE85`, dark `#0F0F16`, text `#09090B`,
muted `#71717A`, radius `0.75rem`, shadcn HSL tokens for muted/border.

## Tuning notes

- If the orb ever looks too saturated: raise the **Soften** slider (white
  overlay) or add more `#FFFFFF` entries to `BRAND_COLORS` in
  `src/pages/OrbPage.tsx` (max 10 colors supported by the shader).
- The shader animates, so the exact composition drifts over time by design;
  `speed 0.18` keeps it slow and organic.
