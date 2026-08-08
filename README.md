# foniomotiontool

Fonio brand-visual & multilingual video pipeline. Three sub-projects:

- **fonio-lab** — the fonio orb as a realtime shader (Paper Shaders MeshGradient, 4 brand colors + tuning controls) and a brand-gradient soundwave (wavesurfer.js). `cd fonio-lab && npm install && npm run dev`
- **fonio-tokens** — single source of truth for all fonio colors/radii (DTCG JSON → Style Dictionary v5 → CSS variables, flat JSON for Figma variables, ES module). `cd fonio-tokens && npm install && npm run build`
- **fonio-video** — the 60s explainer as Remotion code; language is an input prop (de/en so far), one codebase renders every locale. `cd fonio-video && npm install && npm run studio` / `npm run render:all`

Design source: Figma "Visuell Language" → page "Fonio App" → section "10 Video Assets" (15 styleframes).

Brand core: every fonio gradient is a mix of `#585DFE` (blue), `#58E8FE` (cyan), `#58FE85` (green) and white.
