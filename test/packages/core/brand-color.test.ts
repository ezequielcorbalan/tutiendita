import { describe, expect, it } from "vitest";
import { BRAND_COLORS, DEFAULT_BRAND_COLOR, validateBrandColor } from "../../../src/packages/core/domain/brand-color";

/** Page backgrounds of the store stylesheet (src/styles/store.css): the brand is used as text on them. */
const BACKGROUNDS = {
  light: ["#fbf7f1", "#ffffff", "#f3ece2"],
  dark: ["#14130f", "#1e1c18", "#27241f"],
} as const;

const AA = 4.5;

/** WCAG 2 relative luminance of a #rrggbb colour. */
function luminance(hex: string): number {
  const channel = (i: number) => {
    const v = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

function contrast(a: string, b: string): number {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (high + 0.05) / (low + 0.05);
}

describe("BRAND_COLORS", () => {
  it("has the stylesheet's green as the default", () => {
    expect(DEFAULT_BRAND_COLOR).toBe("verde");
    expect(BRAND_COLORS[0]).toMatchObject({
      id: "verde",
      light: { brand: "#1d6b47" },
      dark: { brand: "#6fd3a0" },
    });
  });

  it("every colour is #rrggbb", () => {
    for (const c of BRAND_COLORS) {
      for (const scheme of ["light", "dark"] as const) {
        for (const value of Object.values(c[scheme])) expect(value).toMatch(/^#[0-9a-f]{6}$/);
      }
    }
  });

  it.each(BRAND_COLORS.map((c) => [c.id, c] as const))("%s is AA in light and dark", (_id, c) => {
    for (const scheme of ["light", "dark"] as const) {
      const { brand, brandText, brandSoft } = c[scheme];
      expect(contrast(brandText, brand), `${scheme} text on brand`).toBeGreaterThanOrEqual(AA);
      expect(contrast(brand, brandSoft), `${scheme} brand on brandSoft`).toBeGreaterThanOrEqual(AA);
      for (const background of BACKGROUNDS[scheme]) {
        expect(contrast(brand, background), `${scheme} brand on ${background}`).toBeGreaterThanOrEqual(AA);
      }
    }
  });
});

describe("validateBrandColor", () => {
  it("accepts a palette id and rejects anything else", () => {
    expect(validateBrandColor("azul")).toEqual({ ok: true, value: "azul" });
    expect(validateBrandColor("#ff0000")).toMatchObject({
      ok: false,
      error: { code: "INVALID_BRAND_COLOR" },
    });
    expect(validateBrandColor("")).toMatchObject({ ok: false, error: { code: "INVALID_BRAND_COLOR" } });
  });
});
