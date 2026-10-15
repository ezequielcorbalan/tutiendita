import type { Product } from "../packages/core/index";

/** Public (JSON) representation of a product; used by the API and the pages. */
export type ProductJson = {
  id: string;
  name: string;
  slug: string;
  description: string;
  price: { amount: number; currency: string };
  images: { key: string; url: string }[];
  stock: number | null;
  status: Product["status"];
  categoryId: string | null;
  federate: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
};

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
    stock: p.stock,
    status: p.status,
    categoryId: p.categoryId,
    federate: p.federate,
    version: p.version,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}
