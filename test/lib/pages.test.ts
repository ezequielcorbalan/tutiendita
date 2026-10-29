import { describe, expect, it } from "vitest";
import { languageFromLang } from "../../src/i18n";
import { priceText } from "../../src/lib/pages";
import type { ProductJson } from "../../src/lib/product-json";

const withPrice = (amount: number, currency: string) =>
  ({ price: { amount, currency }, options: [] }) as unknown as ProductJson;

describe("priceText", () => {
  it.each([
    [4500, "ARS", "45,00"],
    [1500, "JPY", "1500"],
    // ISO 4217: IQD has 3 decimals (CLDR/Intl uses 0 and would round to 2).
    [1500, "IQD", "1,500"],
  ])("%i %s shows %s with the ISO 4217 decimals", (amount, currency, expected) => {
    expect(priceText(withPrice(amount, currency)).replace(/\./g, "")).toContain(expected);
  });
});

describe("priceText by store language", () => {
  // Same currency (the store's), the language's format: es-AR, en-US, pt-BR.
  it.each([
    ["es", "450.050,25", "$"],
    ["en", "450,050.25", "ARS"],
    ["pt", "450.050,25", "ARS"],
  ] as const)("%s → %s", (language, number, symbol) => {
    const text = priceText(withPrice(45005025, "ARS"), language);
    expect(text).toContain(number);
    expect(text).toContain(symbol);
  });

  it("without a language it uses Spanish", () => {
    expect(priceText(withPrice(4500, "ARS"))).toBe(priceText(withPrice(4500, "ARS"), "es"));
  });
});

describe("languageFromLang", () => {
  it.each([
    ["es", "es"],
    ["en", "en"],
    ["pt-BR", "pt"],
    ["fr", "es"],
    ["", "es"],
  ])("%j → %s", (lang, language) => {
    expect(languageFromLang(lang)).toBe(language);
  });
});
