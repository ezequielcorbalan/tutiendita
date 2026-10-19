import type { Category, Product } from "../packages/core/index";

/** Public (JSON) representation of a product; used by the API and the pages. */
export type ProductJson = {
  id: string;
  name: string;
  slug: string;
  description: string;
  price: { amount: number; currency: string };
  images: { key: string; url: string }[];
  /** Variants: the buyer picks one value per option; priceDelta adds to the price (minor unit). */
  options: {
    id: string;
    name: string;
    values: {
      id: string;
      label: string;
      priceDelta: number;
      /** One of the product's photos, if the value has one. */
      imageKey: string | null;
      imageUrl: string | null;
    }[];
  }[];
  stock: number | null;
  status: Product["status"];
  categoryId: string | null;
  federate: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
};

/** Cheapest and most expensive combination, in the minor unit (equal when no option changes the price). */
export function priceRange(p: Pick<ProductJson, "price" | "options">): { min: number; max: number } {
  let min = p.price.amount;
  let max = p.price.amount;
  for (const o of p.options) {
    const deltas = o.values.map((v) => v.priceDelta);
    if (deltas.length === 0) continue;
    min += Math.min(...deltas);
    max += Math.max(...deltas);
  }
  return { min, max };
}

export const imageUrl = (key: string): string => `/img/${key}`;

export function toProductJson(p: Product): ProductJson {
  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    description: p.description,
    price: { amount: p.price.amount, currency: p.price.currency },
    images: [...p.images]
      .sort((a, b) => a.position - b.position)
      .map((img) => ({ key: img.key, url: imageUrl(img.key) })),
    options: p.options.map((o) => ({
      id: o.id,
      name: o.name,
      values: o.values.map((v) => ({
        id: v.id,
        label: v.label,
        priceDelta: v.priceDelta,
        imageKey: v.imageKey,
        imageUrl: v.imageKey === null ? null : imageUrl(v.imageKey),
      })),
    })),
    stock: p.stock,
    status: p.status,
    categoryId: p.categoryId,
    federate: p.federate,
    version: p.version,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

export type CategoryJson = {
  id: string;
  name: string;
  slug: string;
  optionTemplates: { name: string; values: { label: string; priceDelta: number }[] }[];
};

export const toCategoryJson = (c: Category): CategoryJson => ({
  id: c.id,
  name: c.name,
  slug: c.slug,
  optionTemplates: c.optionTemplates.map((t) => ({ name: t.name, values: t.values.map((v) => ({ ...v })) })),
});
