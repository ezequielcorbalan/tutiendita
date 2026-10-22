import { type DomainError, domainError } from "./errors";
import { err, ok, type Result } from "./result";

/** The three `--brand*` tokens of the store stylesheet for one colour scheme. */
export type BrandShades = {
  readonly brand: string;
  readonly brandText: string;
  readonly brandSoft: string;
};

export type BrandColor = {
  readonly id: string;
  readonly light: BrandShades;
  readonly dark: BrandShades;
};

/**
 * Closed palette: every pair is AA (test/brand-color.test.ts checks text on brand, brand on the page
 * backgrounds and brand on brandSoft, in both schemes). "verde" is the stylesheet's default.
 * The ids are stored in D1 (`marca.color` setting): they stay in Spanish.
 */
export const BRAND_COLORS = [
  {
    id: "verde",
    light: { brand: "#1d6b47", brandText: "#ffffff", brandSoft: "#e3f1e8" },
    dark: { brand: "#6fd3a0", brandText: "#0f1f17", brandSoft: "#1d3328" },
  },
  {
    id: "terracota",
    light: { brand: "#b4461f", brandText: "#ffffff", brandSoft: "#fae9e3" },
    dark: { brand: "#f2a07b", brandText: "#2a130a", brandSoft: "#3a2219" },
  },
  {
    id: "azul",
    light: { brand: "#1e4f8a", brandText: "#ffffff", brandSoft: "#e1ebf7" },
    dark: { brand: "#8ab4f8", brandText: "#0b1a33", brandSoft: "#1c2a44" },
  },
  {
    id: "ciruela",
    light: { brand: "#6b2d5c", brandText: "#ffffff", brandSoft: "#f1e3ed" },
    dark: { brand: "#d9a3cb", brandText: "#2b1226", brandSoft: "#3b2235" },
  },
  {
    id: "bordo",
    light: { brand: "#8a1f2b", brandText: "#ffffff", brandSoft: "#f6e1e3" },
    dark: { brand: "#f0a3ab", brandText: "#33101a", brandSoft: "#43202a" },
  },
  {
    id: "pizarra",
    light: { brand: "#37474f", brandText: "#ffffff", brandSoft: "#e3e8ea" },
    dark: { brand: "#b0bec5", brandText: "#121b1f", brandSoft: "#263238" },
  },
] as const satisfies readonly BrandColor[];

export type BrandColorId = (typeof BRAND_COLORS)[number]["id"];
export const DEFAULT_BRAND_COLOR: BrandColorId = "verde";

export const brandColorById = (id: string) => BRAND_COLORS.find((c) => c.id === id);

export function validateBrandColor(id: string): Result<BrandColorId, DomainError> {
  const found = brandColorById(id);
  return found === undefined
    ? err(
        domainError("INVALID_BRAND_COLOR", "Choose a colour from the palette", {
          allowed: BRAND_COLORS.map((c) => c.id),
        }),
      )
    : ok(found.id);
}
