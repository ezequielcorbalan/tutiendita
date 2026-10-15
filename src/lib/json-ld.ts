import { currencyDecimals } from "../packages/core/index";
import type { ProductJson } from "./product-json";

/** Integer amount in the minor unit → decimal string without floats: (4500, "ARS") → "45.00". */
export function decimalAmount(amount: number, currency: string): string {
  const decimals = currencyDecimals(currency);
  if (decimals === 0) return String(amount);
  const digits = String(amount).padStart(decimals + 1, "0");
  return `${digits.slice(0, -decimals)}.${digits.slice(-decimals)}`;
}

const AVAILABLE = "https://schema.org/InStock";
const SOLD_OUT = "https://schema.org/OutOfStock";

const absolute = (path: string, baseUrl: string): string => new URL(path, baseUrl).href;
export const productUrl = (slug: string, baseUrl: string): string => absolute(`/p/${slug}`, baseUrl);

/** schema.org Product with Offer, for the product page. */
export function jsonLdProduct(p: ProductJson, baseUrl: string) {
  const url = productUrl(p.slug, baseUrl);
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    "@id": url,
    name: p.name,
    ...(p.description !== "" ? { description: p.description } : {}),
    sku: p.id,
    url,
    image: p.images.map((img) => absolute(img.url, baseUrl)),
    offers: {
      "@type": "Offer",
      url,
      price: decimalAmount(p.price.amount, p.price.currency),
      priceCurrency: p.price.currency,
      availability: p.stock === null || p.stock > 0 ? AVAILABLE : SOLD_OUT,
    },
  };
}

/** schema.org ItemList with the home page products. */
export function jsonLdList(ps: readonly ProductJson[], baseUrl: string) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    numberOfItems: ps.length,
    itemListElement: ps.map((p, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: productUrl(p.slug, baseUrl),
      name: p.name,
    })),
  };
}

/** JSON safe to embed in <script>: escapes `<` so a name with "</script>" doesn't close the tag. */
export const serializeJsonLd = (data: unknown): string => JSON.stringify(data).replace(/</g, "\\u003c");
