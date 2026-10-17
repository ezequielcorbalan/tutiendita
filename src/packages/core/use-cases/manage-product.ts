import { type DomainError, domainError } from "../domain/errors";
import type { Money } from "../domain/money";
import { type ProductOption, withIds } from "../domain/options";
import {
  edit,
  type Product,
  type ProductStatus,
  pause,
  publish,
  toDraft,
  withOnlyImage,
} from "../domain/product";
import { err, ok, type Result } from "../domain/result";
import type { CategoryRepository } from "../ports/category-repository";
import type { Clock } from "../ports/clock";
import type { IdGenerator } from "../ports/id-generator";
import type { ImageStorage } from "../ports/image-storage";
import type { ProductRepository } from "../ports/product-repository";
import { imageQuotaReached, validateImage } from "./create-product";

export type ManageProductDeps = {
  repo: ProductRepository;
  categories: CategoryRepository;
  images: ImageStorage;
  clock: Clock;
  ids: IdGenerator;
  /** Largest photo accepted, in bytes. Default `MAX_IMAGE_SIZE`. */
  maxImageSize?: number;
};

export type UpdateProductInput = {
  name: string;
  description: string;
  price: Money;
  categoryId: string | null;
  status: ProductStatus;
  /** Variants, complete: replace the current ones (new options and values come without id). Omitted: unchanged. */
  options?: readonly ProductOption[];
  /** New photo: replaces the current one. */
  image?: { bytes: Uint8Array; mimeType: string };
};

const notFound = (id: string) => err(domainError("PRODUCT_NOT_FOUND", "The product does not exist", { id }));

function applyStatus(p: Product, status: ProductStatus, now: Date): Result<Product, DomainError> {
  if (status === p.status) return ok(p);
  if (status === "publicado") return publish(p, now);
  if (status === "pausado") return pause(p, now);
  return ok(toDraft(p, now));
}

/**
 * Edits a product from the panel. Everything is validated before uploading the new photo; the old
 * photos are deleted only after saving (best-effort), and the new one is deleted if saving fails.
 */
export const updateProduct =
  (deps: ManageProductDeps) =>
  async (id: string, e: UpdateProductInput): Promise<Result<Product, DomainError>> => {
    const current = await deps.repo.findById(id);
    if (current === null) return notFound(id);
    if (e.image !== undefined) {
      const v = validateImage(e.image, deps.maxImageSize);
      if (!v.ok) return v;
    }
    if (e.categoryId !== null && (await deps.categories.findById(e.categoryId)) === null) {
      return err(
        domainError("CATEGORY_NOT_FOUND", "The category does not exist", { categoryId: e.categoryId }),
      );
    }
    const now = deps.clock.now();
    // Status last: publishing needs the new price and photo. A virtual photo checks it before uploading.
    const edited = edit(
      current,
      {
        name: e.name,
        description: e.description,
        price: e.price,
        categoryId: e.categoryId,
        ...(e.options !== undefined ? { options: withIds(e.options, () => deps.ids.newId()) } : {}),
      },
      now,
    );
    if (!edited.ok) return edited;
    const simulated = e.image === undefined ? edited.value : withOnlyImage(edited.value, "pending", now);
    const check = applyStatus(simulated, e.status, now);
    if (!check.ok) return check;

    let product = edited.value;
    let uploadedKey: string | null = null;
    if (e.image !== undefined) {
      try {
        uploadedKey = (await deps.images.save(e.image.bytes, e.image.mimeType)).key;
      } catch (error) {
        const quota = imageQuotaReached(error);
        if (quota !== null) return err(quota);
        throw error;
      }
      product = withOnlyImage(product, uploadedKey, now);
    }
    const final = applyStatus(product, e.status, now);
    if (!final.ok) return final;
    // One save is one version, however many domain transitions happened.
    product = Object.freeze({ ...final.value, version: current.version + 1, updatedAt: now });
    try {
      await deps.repo.save(product);
    } catch (error) {
      if (uploadedKey !== null) await deps.images.remove(uploadedKey).catch(() => undefined);
      throw error;
    }
    if (uploadedKey !== null) {
      for (const img of current.images) await deps.images.remove(img.key).catch(() => undefined);
    }
    return ok(product);
  };

/** Deletes the product and then its photos (best-effort: a failure in R2 leaves an orphan file, not a broken product). */
export const deleteProduct =
  (deps: Pick<ManageProductDeps, "repo" | "images">) =>
  async (id: string): Promise<Result<{ id: string }, DomainError>> => {
    const current = await deps.repo.findById(id);
    if (current === null) return notFound(id);
    await deps.repo.remove(id);
    for (const img of current.images) await deps.images.remove(img.key).catch(() => undefined);
    return ok({ id });
  };
