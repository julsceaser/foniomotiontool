/**
 * Rendert die Composition "FonioExplainer" für alle Sprachen
 * als out/fonio-60s-<lang>.mp4.
 *
 * Aufruf: npm run render:all
 */
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

const COMPOSITION_ID = "FonioExplainer";
const LANGS = ["de", "en"];

const main = async () => {
  console.log("Bundling Remotion project …");
  const serveUrl = await bundle({
    entryPoint: path.join(projectRoot, "src", "index.ts"),
    onProgress: (progress) => {
      if (progress % 25 === 0) {
        console.log(`  Bundle: ${progress}%`);
      }
    },
  });

  for (const lang of LANGS) {
    const inputProps = { lang };

    const composition = await selectComposition({
      serveUrl,
      id: COMPOSITION_ID,
      inputProps,
    });

    const outputLocation = path.join(
      projectRoot,
      "out",
      `fonio-60s-${lang}.mp4`,
    );

    console.log(`\nRendering ${outputLocation} …`);
    await renderMedia({
      composition,
      serveUrl,
      codec: "h264",
      outputLocation,
      inputProps,
      onProgress: ({ progress }) => {
        const pct = Math.round(progress * 100);
        if (pct % 10 === 0) {
          process.stdout.write(`\r  Render (${lang}): ${pct}% `);
        }
      },
    });
    process.stdout.write(`\r  Render (${lang}): 100%\n`);
  }

  console.log("\nFertig. Ausgaben in ./out/");
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
