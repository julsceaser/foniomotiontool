import { loadFont } from "@remotion/google-fonts/Geist";

const { fontFamily } = loadFont("normal", {
  weights: ["400", "500", "600", "700"],
  subsets: ["latin", "latin-ext"],
});

export const GEIST = `${fontFamily}, system-ui, -apple-system, sans-serif`;
