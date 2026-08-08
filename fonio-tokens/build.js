/**
 * Fonio Token-Kette — Style Dictionary v5 Build (ESM-API)
 *
 * Single Source of Truth: tokens/fonio.json (DTCG-Format, $value/$type)
 * Outputs:
 *   build/css/variables.css   — CSS Custom Properties (:root, shadcn-Stil)
 *   build/json/tokens-flat.json — flaches Key→Hex JSON (Figma-Plugin-API / Variables)
 *   build/js/tokens.js        — ES-Modul (Remotion / Lab)
 */
import StyleDictionary from 'style-dictionary';
import { formats, transformGroups } from 'style-dictionary/enums';

/**
 * Flaches Key→Wert-JSON mit kebab-case-Keys, z. B.
 *   { "color-base-blue-main": "#585DFE", ... }
 * Genau das Format, das sich per Figma-Plugin-API in Variables schreiben lässt.
 */
StyleDictionary.registerFormat({
  name: 'json/flat-figma',
  format: ({ dictionary, options }) => {
    const flat = {};
    for (const token of dictionary.allTokens) {
      flat[token.name] = options.usesDtcg ? token.$value : token.value;
    }
    return JSON.stringify(flat, null, 2) + '\n';
  },
});

const sd = new StyleDictionary({
  source: ['tokens/fonio.json'],
  platforms: {
    css: {
      transformGroup: transformGroups.css,
      buildPath: 'build/css/',
      files: [
        {
          destination: 'variables.css',
          format: formats.cssVariables,
          options: { outputReferences: true },
        },
      ],
    },
    json: {
      // kebab-case-Namen, Hex-Farben — kein Einheiten-Umbau
      transforms: ['attribute/cti', 'name/kebab', 'color/css'],
      buildPath: 'build/json/',
      files: [
        {
          destination: 'tokens-flat.json',
          format: 'json/flat-figma',
        },
      ],
    },
    js: {
      transformGroup: transformGroups.js,
      buildPath: 'build/js/',
      files: [
        {
          destination: 'tokens.js',
          format: formats.javascriptEsm,
          // minify: nur Werte exportieren (kein Token-Metadaten-Ballast) —
          // ergibt ein sauberes verschachteltes Objekt fuer Remotion/Lab
          options: { minify: true },
        },
      ],
    },
  },
});

await sd.buildAllPlatforms();
console.log('✔ Fonio tokens built: build/css/variables.css, build/json/tokens-flat.json, build/js/tokens.js');
