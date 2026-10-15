import type { Language } from "../packages/core/index";

/** Countries of the WhatsApp dropdown, with their calling code. Argentina first; the rest by region. */
export const COUNTRIES: readonly { iso: string; code: string }[] = [
  { iso: "AR", code: "54" },
  { iso: "UY", code: "598" },
  { iso: "CL", code: "56" },
  { iso: "PY", code: "595" },
  { iso: "BO", code: "591" },
  { iso: "BR", code: "55" },
  { iso: "PE", code: "51" },
  { iso: "EC", code: "593" },
  { iso: "CO", code: "57" },
  { iso: "VE", code: "58" },
  { iso: "PA", code: "507" },
  { iso: "CR", code: "506" },
  { iso: "NI", code: "505" },
  { iso: "HN", code: "504" },
  { iso: "SV", code: "503" },
  { iso: "GT", code: "502" },
  { iso: "MX", code: "52" },
  { iso: "CU", code: "53" },
  { iso: "US", code: "1" },
  { iso: "ES", code: "34" },
  { iso: "PT", code: "351" },
  { iso: "IT", code: "39" },
  { iso: "FR", code: "33" },
  { iso: "DE", code: "49" },
  { iso: "GB", code: "44" },
];

const BY_LANGUAGE: Record<Language, string> = { es: "AR", pt: "BR", en: "US" };
export const defaultCountry = (language: Language): string => BY_LANGUAGE[language];

/**
 * What gets sent to the API. Argentina goes as is because the domain already normalizes the 0, the 15
 * and the 9; if the person typed + or 00 it's kept; for other countries the code is prepended without
 * the long-distance 0.
 */
export function buildNumber(iso: string, text: string): string {
  const clean = text.trim();
  const country = COUNTRIES.find((p) => p.iso === iso);
  if (!country || iso === "AR" || clean.startsWith("+") || clean.startsWith("00")) return clean;
  return `+${country.code}${clean.replace(/\D/g, "").replace(/^0+/, "")}`;
}

/** To prefill the form with a number stored in E.164. */
export function splitNumber(
  e164: string | undefined,
  byDefault: string,
): { country: string; national: string } {
  if (!e164?.startsWith("+")) return { country: byDefault, national: "" };
  const digits = e164.slice(1);
  const country = [...COUNTRIES]
    .sort((a, b) => b.code.length - a.code.length)
    .find((p) => digits.startsWith(p.code));
  if (!country) return { country: byDefault, national: e164 };
  let national = digits.slice(country.code.length);
  if (country.iso === "AR" && national.startsWith("9")) national = national.slice(1);
  return { country: country.iso, national };
}
