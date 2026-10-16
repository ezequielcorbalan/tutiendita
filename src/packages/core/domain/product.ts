import { type DomainError, domainError } from "./errors";
import { isPositive, type Money } from "./money";
import { minimumPrice, type ProductOption, validateOptions } from "./options";
import { err, ok, type Result } from "./result";
import { isValidSlug } from "./slug";

// Stored in D1: values stay in Spanish (draft, published, paused).
export type ProductStatus = "borrador" | "publicado" | "pausado";

export type ProductImage = {
  readonly key: string;
  readonly position: number;
};

export type Product = {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly description: string;
  readonly price: Money;
  readonly images: readonly ProductImage[];
  /** Variants: the buyer picks one value per option (see options.ts). */
  readonly options: readonly ProductOption[];
  readonly stock: number | null;
  readonly status: ProductStatus;
  readonly categoryId: string | null;
  readonly federate: boolean;
  readonly version: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export type ProductInput = {
  name: string;
  description?: string;
  price: Money;
  images?: ProductImage[];
  options?: readonly ProductOption[];
  stock?: number | null;
  categoryId?: string | null;
  federate?: boolean;
};

/** What the domain does not decide by itself: identity, slug already resolved as unique, and the current time. */
export type CreationContext = {
  id: string;
  slug: string;
  now: Date;
};

const freeze = (p: Product): Product => Object.freeze(p);

export function newProduct(e: ProductInput, ctx: CreationContext): Result<Product, DomainError> {
  const name = e.name.trim();
  if (name === "") {
    return err(domainError("EMPTY_NAME", "The product needs a name"));
  }
  if (!isValidSlug(ctx.slug)) {
    return err(domainError("INVALID_SLUG", "The slug format is not valid", { slug: ctx.slug }));
  }
  const images = (e.images ?? []).map((img, i) => ({ key: img.key, position: i }));
  const options = validateOptions(e.options ?? []);
  if (!options.ok) return options;
  return ok(
    freeze({
      id: ctx.id,
      name,
      slug: ctx.slug,
      description: e.description ?? "",
      price: e.price,
      images,
      options: options.value,
      stock: e.stock ?? null,
      status: "borrador",
      categoryId: e.categoryId ?? null,
      federate: e.federate ?? false,
      version: 1,
      createdAt: ctx.now,
      updatedAt: ctx.now,
    }),
  );
}

/** A published product costs more than zero in its cheapest combination and has at least one image. */
export function canBePublished(p: Product): Result<true, DomainError> {
  if (!isPositive(minimumPrice(p.price, p.options))) {
    return err(domainError("INVALID_PRICE", "A published product needs a price greater than zero"));
  }
  if (p.images.length === 0) {
    return err(domainError("NO_IMAGE", "A published product needs at least one image"));
  }
  return ok(true);
}

const nextVersion = (p: Product, changes: Partial<Product>, now: Date): Product =>
  freeze({ ...p, ...changes, version: p.version + 1, updatedAt: now });

export function publish(p: Product, now: Date): Result<Product, DomainError> {
  const check = canBePublished(p);
  if (!check.ok) return check;
  return ok(nextVersion(p, { status: "publicado" }, now));
}

export function pause(p: Product, now: Date): Result<Product, DomainError> {
  if (p.status !== "publicado") {
    return err(domainError("INVALID_STATUS", "Only a published product can be paused", { status: p.status }));
  }
  return ok(nextVersion(p, { status: "pausado" }, now));
}

export function withImage(p: Product, img: ProductImage, now: Date): Product {
  const images = [...p.images, { key: img.key, position: p.images.length }];
  return nextVersion(p, { images }, now);
}

export type ProductChanges = {
  name?: string;
  description?: string;
  price?: Money;
  categoryId?: string | null;
  options?: readonly ProductOption[];
};

/** Edits the product's data. The slug never changes, so links already shared keep working. */
export function edit(p: Product, changes: ProductChanges, now: Date): Result<Product, DomainError> {
  const name = changes.name === undefined ? p.name : changes.name.trim();
  if (name === "") return err(domainError("EMPTY_NAME", "The product needs a name"));
  const options = changes.options === undefined ? ok(p.options) : validateOptions(changes.options);
  if (!options.ok) return options;
  const next = nextVersion(
    p,
    {
      name,
      ...(changes.description !== undefined ? { description: changes.description } : {}),
      ...(changes.price !== undefined ? { price: changes.price } : {}),
      ...(changes.categoryId !== undefined ? { categoryId: changes.categoryId } : {}),
      options: options.value,
    },
    now,
  );
  // A published product must stay publishable (e.g. its price can't drop to zero).
  if (next.status === "publicado") {
    const check = canBePublished(next);
    if (!check.ok) return check;
  }
  return ok(next);
}

/** Replaces all images with this one (the panel handles a single photo per product). */
export const withOnlyImage = (p: Product, key: string, now: Date): Product =>
  nextVersion(p, { images: [{ key, position: 0 }] }, now);

/** Back to draft: out of the catalog, from any status. */
export const toDraft = (p: Product, now: Date): Product => nextVersion(p, { status: "borrador" }, now);
