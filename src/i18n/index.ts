import { IDIOMA_POR_DEFECTO, type Idioma } from "../paquetes/core/index";
import { en } from "./en";
import { es, type Textos } from "./es";
import { pt } from "./pt";

export type { Textos };

const TEXTOS: Record<Idioma, Textos> = { es, en, pt };

/** Locale de Intl (fechas y precios) y valor de `<html lang>` de cada idioma de la tienda. */
export const LOCALES: Record<Idioma, string> = { es: "es-AR", en: "en-US", pt: "pt-BR" };
export const LANG_HTML: Record<Idioma, string> = { es: "es", en: "en", pt: "pt-BR" };
/** Cómo se llama cada idioma en sí mismo (para el selector). */
export const NOMBRES_DE_IDIOMA: Record<Idioma, string> = {
  es: "Español",
  en: "English",
  pt: "Português (Brasil)",
};

export const textos = (idioma: Idioma = IDIOMA_POR_DEFECTO): Textos => TEXTOS[idioma];

/** Del lado del navegador: el idioma lo fija el servidor en `<html lang>`. */
export function idiomaDeLang(lang: string): Idioma {
  const encontrado = (Object.keys(LANG_HTML) as Idioma[]).find((i) => LANG_HTML[i] === lang);
  return encontrado ?? IDIOMA_POR_DEFECTO;
}
