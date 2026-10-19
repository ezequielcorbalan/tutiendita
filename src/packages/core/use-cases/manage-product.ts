import { type DomainError, domainError } from "../domain/errors";
import type { Money } from "../domain/money";
import {
  edit,
  type Product,
  type ProductStatus,
  pause,
  publish,
  toDraft,
  withImages,
} from "../domain/product";
import { err, ok, type Result } from "../domain/result";
import type { CategoryRepository } from "../ports/category-repository";
import type { Clock } from "../ports/clock";
import type { IdGenerator } from "../ports/id-generator";
import type { ImageStorage } from "../ports/image-storage";
import type { ProductRepository } from "../ports/product-repository";
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

export type ManageProductDeps = {
  repo: ProductRepository;
  categories: CategoryRepository;
  images: ImageStorage;
  clock: Clock;
  ids: IdGenerator;
  /** Largest photo accepted, in bytes. Default `MAX_IMAGE_SIZE`. */
  maxImageSize?: number;
  /** Professional photo storage: more than one photo and photos per value. Default false. */
  pro?: boolean;
};

export type UpdateProductInput = {
  name: string;
  description: string;
  price: Money;
  categoryId: string | null;
  status: ProductStatus;
  /** Variants, complete: replace the current ones (new options and values come without id). Omitted: unchanged. */
  options?: readonly OptionInput[];
  /** The whole gallery, in order; each `{ upload: n }` is `uploads[n]`. Omitted: photos unchanged. */
  gallery?: readonly PhotoRef[];
  uploads?: readonly Upload[];
};

const notFound = (id: string) => err(domainError("PRODUCT_NOT_FOUND", "The product does not exist", { id }));

function applyStatus(p: Product, status: ProductStatus, now: Date): Result<Product, DomainError> {
  if (status === p.status) return ok(p);
  if (status === "publicado") return publish(p, now);
  if (status === "pausado") return pause(p, now);
  return ok(toDraft(p, now));
}

/**
 * Edits a product from the panel. Everything is validated before uploading the new photos (the whole
 * product is built first with stand-in keys); the photos that left the gallery are deleted only after
 * saving (best-effort), and the new ones are deleted if anything fails after uploading.
 */
export const updateProduct =
  (deps: ManageProductDeps) =>
  async (id: string, e: UpdateProductInput): Promise<Result<Product, DomainError>> => {
    const current = await deps.repo.findById(id);
    if (current === null) return notFound(id);
    const gallery = e.gallery ?? current.images.map((img) => ({ key: img.key }));
    const uploads = e.uploads ?? [];
    const valid = checkGallery(
      gallery,
      uploads,
      current.images.map((img) => img.key),
      e.options,
      deps.maxImageSize,
    );
    if (!valid.ok) return valid;
    if (e.categoryId !== null && (await deps.categories.findById(e.categoryId)) === null) {
      return err(
        domainError("CATEGORY_NOT_FOUND", "The category does not exist", { categoryId: e.categoryId }),
      );
    }
    const now = deps.clock.now();
    const options = e.options !== undefined ? withInputIds(e.options, () => deps.ids.newId()) : undefined;
    // Photos first (value photos that leave the gallery are cleared), then the data. Publishing goes last
    // (it needs the new price and photos); leaving "publicado" goes before the data, so the publishable
    // check of the in-between state doesn't block it.
    const build = (uploaded: readonly string[]): Result<Product, DomainError> => {
      const key = keyOf(uploaded);
      const photos = withImages(current, gallery.map(key), now);
      if (!photos.ok) return photos;
      const unpublished = e.status === "publicado" ? photos : applyStatus(photos.value, e.status, now);
      if (!unpublished.ok) return unpublished;
      const edited = edit(
        unpublished.value,
        {
          name: e.name,
          description: e.description,
          price: e.price,
          categoryId: e.categoryId,
          ...(options !== undefined ? { options: resolveOptions(options, photos.value, key) } : {}),
        },
        now,
      );
      if (!edited.ok) return edited;
      const final = applyStatus(edited.value, e.status, now);
      // One save is one version, however many domain transitions happened.
      return final.ok
        ? ok(Object.freeze({ ...final.value, version: current.version + 1, updatedAt: now }))
        : final;
    };
    const check = build(placeholders(uploads.length));
    if (!check.ok) return check;
    const pro = checkPro(current, check.value, uploads.length, deps.pro ?? false);
    if (!pro.ok) return pro;

    const uploaded = await uploadAll(deps.images, uploads);
    if (!uploaded.ok) return uploaded;
    let product: Product;
    try {
      const built = build(uploaded.value);
      if (!built.ok) {
        await removeAll(deps.images, uploaded.value);
        return built;
      }
      product = built.value;
      await deps.repo.save(product);
    } catch (error) {
      await removeAll(deps.images, uploaded.value);
      throw error;
    }
    const kept = new Set(product.images.map((img) => img.key));
    await removeAll(
      deps.images,
      current.images.filter((img) => !kept.has(img.key)).map((img) => img.key),
    );
    return ok(product);
  };

/** Deletes the product and then its photos (best-effort: a failure in R2 leaves an orphan file, not a broken product). */
export const deleteProduct =
  (deps: Pick<ManageProductDeps, "repo" | "images">) =>
  async (id: string): Promise<Result<{ id: string }, DomainError>> => {
    const current = await deps.repo.findById(id);
    if (current === null) return notFound(id);
    await deps.repo.remove(id);
    await removeAll(
      deps.images,
      current.images.map((img) => img.key),
    );
    return ok({ id });
  };
