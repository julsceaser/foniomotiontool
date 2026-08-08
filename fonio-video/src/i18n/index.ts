import de from "./de.json";
import en from "./en.json";

export type Lang = "de" | "en";
export type Strings = typeof de;

const strings: Record<Lang, Strings> = { de, en };

export const LANGS: Lang[] = ["de", "en"];

export const t = (lang: Lang): Strings => strings[lang] ?? strings.de;
