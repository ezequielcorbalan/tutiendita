import { type DomainError, domainError } from "../domain/errors";
import type { Money } from "../domain/money";
import { optionsFromTemplates } from "../domain/options";
import { newProduct as newProductEntity, type Product, publish } from "../domain/product";
import { err, ok, type Result } from "../domain/result";
import { generateSlug, isValidSlug, MAX_SLUG_LENGTH } from "../domain/slug";
import type { CategoryRepository } from "../ports/category-repository";
import type { Clock } from "../ports/clock";
import type { IdGenerator } from "../ports/id-generator";
import type { ImageStorage } from "../ports/image-storage";
import { DuplicateSlugError, type ProductRepository } from "../ports/product-repository";
import {
  checkGallery,
  checkPro,
  keyOf,
  type OptionInput,
  type PhotoRef,
  placeholders,
  removeAll,
  resolveOptions,
  type Upload,
  uploadAll,
  withInputIds,
} from "./product-gallery";

export type CreateProductInput = {
  name: string;
  description?: string;
  price: Money;
  /** The photos, in order; each `{ upload: n }` is `uploads[n]`. Omitted: none. */
  gallery?: readonly PhotoRef[];
  uploads?: readonly Upload[];
  categoryId?: string | null;
  /** Variants. If omitted, the category's templates are copied (none without a category). */
  options?: readonly OptionInput[];
  stock?: number | null;
  publish?: boolean;
};

export type CreateProductDeps = {
  repo: ProductRepository;
  categories: CategoryRepository;
  images: ImageStorage;
  clock: Clock;
  ids: IdGenerator;
  /** Largest photo accepted, in bytes. Default `MAX_IMAGE_SIZE`; basic mode (photos in D1) passes less. */
  maxImageSize?: number;
  /** Professional photo storage: more than one photo and photos per value. Default false. */
  pro?: boolean;
};

const MAX_SLUG_ATTEMPTS = 50;
/** Attempts of `repo.save` on `DuplicateSlugError` (race between two creations with the same name). */
const MAX_SAVE_ATTEMPTS = 3;

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
 * Order: validate everything possible without side effects (photos, category, slug, and the whole product
 * built with stand-in keys) and only then upload the photos and save. If anything fails after uploading,
 * every photo of this call is deleted (best-effort: if storage also fails, an orphan object may remain) and
 * the original error is returned or rethrown. If saving throws `DuplicateSlugError` (another creation won
 * the race for the slug), the slug is recalculated and saving is retried up to MAX_SAVE_ATTEMPTS times,
 * reusing the already uploaded photos.
 */
export const createProduct =
  (deps: CreateProductDeps) =>
  async (e: CreateProductInput): Promise<Result<Product, DomainError>> => {
    const gallery = e.gallery ?? [];
    const uploads = e.uploads ?? [];
    const valid = checkGallery(gallery, uploads, [], e.options, deps.maxImageSize);
    if (!valid.ok) return valid;
    let category = null;
    if (e.categoryId !== undefined && e.categoryId !== null) {
      category = await deps.categories.findById(e.categoryId);
      if (category === null) {
        return err(
          domainError("CATEGORY_NOT_FOUND", "The category does not exist", { categoryId: e.categoryId }),
        );
      }
    }
    const slug = await resolveUniqueSlug(e.name, deps.repo);
    if (!slug.ok) return slug;

    const now = deps.clock.now();
    const options =
      e.options !== undefined
        ? withInputIds(e.options, () => deps.ids.newId())
        : optionsFromTemplates(category?.optionTemplates ?? [], () => deps.ids.newId());
    const ctx = { id: deps.ids.newId(), slug: slug.value.slug, now };
    const build = (uploaded: readonly string[]): Result<Product, DomainError> => {
      const key = keyOf(uploaded);
      const base = newProductEntity(
        {
          name: e.name,
          price: e.price,
          ...(e.description !== undefined ? { description: e.description } : {}),
          ...(e.categoryId !== undefined ? { categoryId: e.categoryId } : {}),
          ...(e.stock !== undefined ? { stock: e.stock } : {}),
          images: gallery.map((ref, position) => ({ key: key(ref), position })),
          options: resolveOptions(options, null, key),
        },
        ctx,
      );
      if (!base.ok || e.publish !== true) return base;
      const pub = publish(base.value, now);
      // Domain transitions increment `version`, but nothing has been saved yet:
      // the product starts with the creation version and date (those of the first save).
      return pub.ok
        ? ok(Object.freeze({ ...pub.value, version: base.value.version, updatedAt: base.value.updatedAt }))
        : pub;
    };
    // Stand-in keys: a product that can't be built (or published) fails before anything is uploaded.
    const check = build(placeholders(uploads.length));
    if (!check.ok) return check;
    const pro = checkPro(null, check.value, uploads.length, deps.pro ?? false);
    if (!pro.ok) return pro;

    const uploaded = await uploadAll(deps.images, uploads);
    if (!uploaded.ok) return uploaded;
    try {
      const built = build(uploaded.value);
      if (!built.ok) {
        await removeAll(deps.images, uploaded.value);
        return built;
      }
      let product = built.value;
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
      // best-effort: reporting the original error takes priority
      await removeAll(deps.images, uploaded.value);
      throw error;
    }
  };
