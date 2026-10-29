import { describe, expect, it } from "vitest";
import { decimalAmount, jsonLdList, jsonLdProduct, serializeJsonLd } from "../../src/lib/json-ld";
import type { ProductJson } from "../../src/lib/product-json";

const BASE = "https://mi.tiendita.ar";

const product = (extra: Partial<ProductJson> = {}): ProductJson => ({
  id: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
  name: "Mate de calabaza",
  slug: "mate-de-calabaza",
  description: "Curado a mano",
  price: { amount: 4500, currency: "ARS" },
  images: [{ key: "01ARZ3NDEKTSV4RRFFQ69G5FAW.png", url: "/img/01ARZ3NDEKTSV4RRFFQ69G5FAW.png" }],
  options: [],
  stock: null,
  status: "publicado",
  categoryId: null,
  federate: false,
  version: 3,
  createdAt: "2026-10-14T00:00:00.000Z",
  updatedAt: "2026-10-14T00:00:00.000Z",
  ...extra,
});

describe("decimalAmount", () => {
  it.each([
    [4500, "ARS", "45.00"],
    [5, "ARS", "0.05"],
    [0, "USD", "0.00"],
    [123456789, "USD", "1234567.89"],
    [1500, "JPY", "1500"],
    [990, "CLP", "990"],
    [1500, "IQD", "1.500"],
    [5, "KWD", "0.005"],
    [12345, "PYG", "12345"],
  ])("%i %s → %s", (amount, currency, expected) => {
    expect(decimalAmount(amount, currency)).toBe(expected);
  });
});

describe("jsonLdProduct", () => {
  it("builds a Product with Offer and absolute URLs", () => {
    const ld = jsonLdProduct(product(), BASE);
    expect(ld).toMatchObject({
      "@context": "https://schema.org",
      "@type": "Product",
      name: "Mate de calabaza",
      description: "Curado a mano",
      url: `${BASE}/p/mate-de-calabaza`,
      image: [`${BASE}/img/01ARZ3NDEKTSV4RRFFQ69G5FAW.png`],
      offers: {
        "@type": "Offer",
        price: "45.00",
        priceCurrency: "ARS",
        availability: "https://schema.org/InStock",
      },
    });
  });

  it("availability by stock: null and > 0 → InStock; 0 → OutOfStock", () => {
    expect(jsonLdProduct(product({ stock: null }), BASE).offers.availability).toBe(
      "https://schema.org/InStock",
    );
    expect(jsonLdProduct(product({ stock: 3 }), BASE).offers.availability).toBe("https://schema.org/InStock");
    expect(jsonLdProduct(product({ stock: 0 }), BASE).offers.availability).toBe(
      "https://schema.org/OutOfStock",
    );
  });

  it("without a description it emits no description", () => {
    expect(jsonLdProduct(product({ description: "" }), BASE)).not.toHaveProperty("description");
  });
});

describe("jsonLdList", () => {
  it("builds an ItemList with positions from 1", () => {
    const ld = jsonLdList([product(), product({ slug: "otro", name: "Otro" })], BASE);
    expect(ld["@type"]).toBe("ItemList");
    expect(ld.itemListElement).toEqual([
      { "@type": "ListItem", position: 1, url: `${BASE}/p/mate-de-calabaza`, name: "Mate de calabaza" },
      { "@type": "ListItem", position: 2, url: `${BASE}/p/otro`, name: "Otro" },
    ]);
  });

  it("empty is an ItemList without elements", () => {
    expect(jsonLdList([], BASE)).toMatchObject({ numberOfItems: 0, itemListElement: [] });
  });
});

describe("serializeJsonLd", () => {
  it("escapes < so a name can't close the <script>", () => {
    const text = serializeJsonLd(jsonLdProduct(product({ name: "</script><b>x" }), BASE));
    expect(text).not.toContain("</script>");
    expect(JSON.parse(text).name).toBe("</script><b>x");
  });
});
