import { describe, expect, it } from "vitest";
import { generateSlug, isValidSlug } from "../../../src/packages/core/domain/slug";

describe("slug", () => {
  it("converts a name with accents and punctuation to ASCII kebab-case", () => {
    expect(generateSlug("Dulce de leche ¡artesanal! 500g")).toBe("dulce-de-leche-artesanal-500g");
  });

  it("removes diacritics and extra spaces", () => {
    expect(generateSlug("  Ñandú   Azul ")).toBe("nandu-azul");
  });

  it("returns empty if nothing usable is left", () => {
    expect(generateSlug("!!!")).toBe("");
  });

  it("validates the format", () => {
    expect(isValidSlug("a-b")).toBe(true);
    expect(isValidSlug("mate-2")).toBe(true);
    expect(isValidSlug("-a")).toBe(false);
    expect(isValidSlug("A")).toBe(false);
    expect(isValidSlug("")).toBe(false);
    expect(isValidSlug("a".repeat(81))).toBe(false);
  });
});
