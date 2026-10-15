import type { Idioma } from "../paquetes/core/index";

/** Países del desplegable del WhatsApp, con su código de llamada. Argentina primero; el resto por región. */
export const PAISES: readonly { iso: string; codigo: string }[] = [
  { iso: "AR", codigo: "54" },
  { iso: "UY", codigo: "598" },
  { iso: "CL", codigo: "56" },
  { iso: "PY", codigo: "595" },
  { iso: "BO", codigo: "591" },
  { iso: "BR", codigo: "55" },
  { iso: "PE", codigo: "51" },
  { iso: "EC", codigo: "593" },
  { iso: "CO", codigo: "57" },
  { iso: "VE", codigo: "58" },
  { iso: "PA", codigo: "507" },
  { iso: "CR", codigo: "506" },
  { iso: "NI", codigo: "505" },
  { iso: "HN", codigo: "504" },
  { iso: "SV", codigo: "503" },
  { iso: "GT", codigo: "502" },
  { iso: "MX", codigo: "52" },
  { iso: "CU", codigo: "53" },
  { iso: "US", codigo: "1" },
  { iso: "ES", codigo: "34" },
  { iso: "PT", codigo: "351" },
  { iso: "IT", codigo: "39" },
  { iso: "FR", codigo: "33" },
  { iso: "DE", codigo: "49" },
  { iso: "GB", codigo: "44" },
];

const POR_IDIOMA: Record<Idioma, string> = { es: "AR", pt: "BR", en: "US" };
export const paisPorDefecto = (idioma: Idioma): string => POR_IDIOMA[idioma];

/**
 * Lo que se le manda a la API. Argentina va tal cual porque el dominio ya normaliza el 0, el 15 y el 9;
 * si la persona escribió + o 00 se respeta; en otro país se antepone el código sin el 0 de larga distancia.
 */
export function armarNumero(iso: string, texto: string): string {
  const limpio = texto.trim();
  const pais = PAISES.find((p) => p.iso === iso);
  if (!pais || iso === "AR" || limpio.startsWith("+") || limpio.startsWith("00")) return limpio;
  return `+${pais.codigo}${limpio.replace(/\D/g, "").replace(/^0+/, "")}`;
}

/** Para precargar el formulario con un número guardado en E.164. */
export function separarNumero(
  e164: string | undefined,
  porDefecto: string,
): { pais: string; nacional: string } {
  if (!e164?.startsWith("+")) return { pais: porDefecto, nacional: "" };
  const digitos = e164.slice(1);
  const pais = [...PAISES]
    .sort((a, b) => b.codigo.length - a.codigo.length)
    .find((p) => digitos.startsWith(p.codigo));
  if (!pais) return { pais: porDefecto, nacional: e164 };
  let nacional = digitos.slice(pais.codigo.length);
  if (pais.iso === "AR" && nacional.startsWith("9")) nacional = nacional.slice(1);
  return { pais: pais.iso, nacional };
}
