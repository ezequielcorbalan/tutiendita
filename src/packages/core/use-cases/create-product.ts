import { type DomainError, domainError } from "../domain/errors";
import { bytesMatchMime } from "../domain/image";
import type { Money } from "../domain/money";
import {
  canBePublished,
  newProduct as newProductEntity,
  type Product,
  publish,
  withImage,
} from "../domain/product";
import { err, ok, type Result } from "../domain/result";
import { generateSlug, isValidSlug, MAX_SLUG_LENGTH } from "../domain/slug";
import type { CategoryRepository } from "../ports/category-repository";
import type { Clock } from "../ports/clock";
import type { IdGenerator } from "../ports/id-generator";
import { ALLOWED_MIMES, type ImageStorage, MAX_IMAGE_SIZE } from "../ports/image-storage";
import { DuplicateSlugError, type ProductRepository } from "../ports/product-repository";

export type CreateProductInput = {
  name: string;
  description?: string;
  price: Money;
  image?: { bytes: Uint8Array; mimeType: string };
  categoryId?: string | null;
  stock?: number | null;
  publish?: boolean;
};

export type CreateProductDeps = {
  repo: ProductRepository;
  categories: CategoryRepository;
  images: ImageStorage;
  clock: Clock;
  ids: IdGenerator;
};

const MAX_SLUG_ATTEMPTS = 50;
/** Attempts of `repo.save` on `DuplicateSlugError` (race between two creations with the same name). */
const MAX_SAVE_ATTEMPTS = 3;

/** Allowed MIME type, maximum size, and the bytes carry the declared MIME type's signature. */
export function validateImage(img: { bytes: Uint8Array; mimeType: string }): Result<true, DomainError> {
  if (!(ALLOWED_MIMES as readonly string[]).includes(img.mimeType)) {
    return err(
      domainError("INVALID_IMAGE", "Image format not allowed", {
        mimeType: img.mimeType,
        allowed: [...ALLOWED_MIMES],
      }),
    );
  }
  if (img.bytes.byteLength > MAX_IMAGE_SIZE) {
    return err(
      domainError("INVALID_IMAGE", "The image exceeds the maximum size", {
        bytes: img.bytes.byteLength,
        max: MAX_IMAGE_SIZE,
      }),
    );
  }
  if (!bytesMatchMime(img.bytes, img.mimeType)) {
    return err(
      domainError("INVALID_IMAGE", "The file content is not an image of the declared type", {
        mimeType: img.mimeType,
      }),
    );
  }
  return ok(true);
}

/** `base` with suffix `-n` (n > 1), trimming the base so it does not exceed the maximum slug length. */
const slugCandidate = (base: string, n: number): string => {
  if (n === 1) return base;
  const suffix = `-${n}`;
  return base.slice(0, MAX_SLUG_LENGTH - suffix.length).replace(/-+$/, "") + suffix;
};

/** First free slug for `name`, trying suffixes from `from` (1 = no suffix). */
async function resolveUniqueSlug(
  name: string,
  repo: ProductRepository,
  from = 1,
): Promise<Result<{ slug: string; n: number }, DomainError>> {
  const base = generateSlug(name);
  if (!isValidSlug(base)) {
    return err(domainError("INVALID_SLUG", "The name does not produce a valid slug", { name }));
  }
  for (let n = from; n <= MAX_SLUG_ATTEMPTS; n += 1) {
    const candidate = slugCandidate(base, n);
    if (!(await repo.slugExists(candidate))) return ok({ slug: candidate, n });
  }
  return err(domainError("INVALID_SLUG", "Could not generate a unique slug", { name }));
}

/**
 * Order: validate everything possible without side effects (image, category, slug, publishing rules)
 * and only then upload the image and save. If `repo.save` throws, the uploaded image is deleted
 * (best-effort: if R2 also fails, an orphan object may remain) and the original error is rethrown.
 * If it throws `DuplicateSlugError` (another creation won the race for the slug), the slug is recalculated
 * and saving is retried up to MAX_SAVE_ATTEMPTS times, reusing the already uploaded image.
 */
export const createProduct =
  (deps: CreateProductDeps) =>
  async (e: CreateProductInput): Promise<Result<Product, DomainError>> => {
    if (e.image !== undefined) {
      const v = validateImage(e.image);
      if (!v.ok) return v;
    }
    if (e.categoryId !== undefined && e.categoryId !== null) {
      const cat = await deps.categories.findById(e.categoryId);
      if (cat === null) {
        return err(
          domainError("CATEGORY_NOT_FOUND", "The category does not exist", { categoryId: e.categoryId }),
        );
      }
    }
    const slug = await resolveUniqueSlug(e.name, deps.repo);
    if (!slug.ok) return slug;

    const now = deps.clock.now();
    const base = newProductEntity(
      {
        name: e.name,
        price: e.price,
        ...(e.description !== undefined ? { description: e.description } : {}),
        ...(e.categoryId !== undefined ? { categoryId: e.categoryId } : {}),
        ...(e.stock !== undefined ? { stock: e.stock } : {}),
      },
      { id: deps.ids.newId(), slug: slug.value.slug, now },
    );
    if (!base.ok) return base;

    if (e.publish === true) {
      // Early check with a "virtual" image so nothing is uploaded if it will fail on price.
      const simulated =
        e.image === undefined ? base.value : withImage(base.value, { key: "pending", position: 0 }, now);
      const check = canBePublished(simulated);
      if (!check.ok) return check;
    }

    let product = base.value;
    let uploadedKey: string | null = null;
    if (e.image !== undefined) {
      const { key } = await deps.images.save(e.image.bytes, e.image.mimeType);
      uploadedKey = key;
      product = withImage(product, { key, position: 0 }, now);
    }
    if (e.publish === true) {
      const pub = publish(product, now);
      if (!pub.ok) return pub;
      product = pub.value;
    }
    // Domain transitions increment `version`, but nothing has been saved yet:
    // the product starts with the creation version and date (those of the first save).
    product = Object.freeze({
      ...product,
      version: base.value.version,
      updatedAt: base.value.updatedAt,
    });
    try {
      let n = slug.value.n;
      for (let attempt = 1; ; attempt += 1) {
        try {
          await deps.repo.save(product);
          return ok(product);
        } catch (error) {
          if (!(error instanceof DuplicateSlugError) || attempt >= MAX_SAVE_ATTEMPTS) throw error;
          const other = await resolveUniqueSlug(e.name, deps.repo, n + 1);
          if (!other.ok) throw error;
          n = other.value.n;
          product = Object.freeze({ ...product, slug: other.value.slug });
        }
      }
    } catch (error) {
      if (uploadedKey !== null) {
        try {
          await deps.images.remove(uploadedKey);
        } catch {
          // best-effort: reporting the original error takes priority
        }
      }
      throw error;
    }
  };
