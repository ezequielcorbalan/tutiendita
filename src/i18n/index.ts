import { DEFAULT_LANGUAGE, type Language } from "../packages/core/index";
import { en } from "./en";
import { es, type Texts } from "./es";
import { pt } from "./pt";

export type { Texts };

const TEXTS: Record<Language, Texts> = { es, en, pt };

/** Intl locale (dates and prices) and `<html lang>` value of each store language. */
export const LOCALES: Record<Language, string> = { es: "es-AR", en: "en-US", pt: "pt-BR" };
export const HTML_LANG: Record<Language, string> = { es: "es", en: "en", pt: "pt-BR" };
/** What each language is called in itself (for the selector). */
export const LANGUAGE_NAMES: Record<Language, string> = {
  es: "Español",
  en: "English",
  pt: "Português (Brasil)",
};

export const texts = (language: Language = DEFAULT_LANGUAGE): Texts => TEXTS[language];

/** Browser side: the server sets the language in `<html lang>`. */
export function languageFromLang(lang: string): Language {
  const found = (Object.keys(HTML_LANG) as Language[]).find((i) => HTML_LANG[i] === lang);
  return found ?? DEFAULT_LANGUAGE;
}
