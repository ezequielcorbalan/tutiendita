import { type DomainError, domainError } from "../domain/errors";
import { bytesMatchMime } from "../domain/image";
import type { ProductOption } from "../domain/options";
import { MAX_PRODUCT_IMAGES, type Product } from "../domain/product";
import { err, ok, type Result } from "../domain/result";
import { ALLOWED_MIMES, ImageQuotaError, type ImageStorage, MAX_IMAGE_SIZE } from "../ports/image-storage";

/** A photo file sent in this save. */
export type Upload = { bytes: Uint8Array; mimeType: string };
/** A gallery entry or a value photo: a photo the product already has, or the n-th upload of this save. */
export type PhotoRef = { key: string } | { upload: number };
/**
 * Variants as the panel sends them (new options and values come without id). A value's `imageRef`:
 * omitted keeps the photo the value with that id has now (none for a new value), null removes it.
 */
export type OptionInput = {
  id: string;
  name: string;
  values: readonly { id: string; label: string; priceDelta: number; imageRef?: PhotoRef | null }[];
};

/** Allowed MIME type, maximum size, and the bytes carry the declared MIME type's signature. */
export function validateImage(
  img: { bytes: Uint8Array; mimeType: string },
  maxSize = MAX_IMAGE_SIZE,
): Result<true, DomainError> {
  if (!(ALLOWED_MIMES as readonly string[]).includes(img.mimeType)) {
    return err(
      domainError("INVALID_IMAGE", "Image format not allowed", {
        mimeType: img.mimeType,
        allowed: [...ALLOWED_MIMES],
      }),
    );
  }
  if (img.bytes.byteLength > maxSize) {
    return err(
      domainError("INVALID_IMAGE", "The image exceeds the maximum size", {
        bytes: img.bytes.byteLength,
        max: maxSize,
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

/** The basic-mode photo quota is full: nothing has been saved yet. */
export const imageQuotaReached = (error: unknown): DomainError | null =>
  error instanceof ImageQuotaError
    ? domainError("IMAGE_QUOTA_REACHED", "The basic photo storage is full", { max: error.max })
    : null;

const invalidImage = (message: string, details?: Record<string, unknown>) =>
  err(domainError("INVALID_IMAGE", message, details));

const isUpload = (ref: PhotoRef): ref is { upload: number } => "upload" in ref;

/**
 * Everything that can be checked before uploading: the files, the upload indexes (in range, each upload
 * exactly once in the gallery), kept keys only among `currentKeys`, no repeats, and the size cap.
 */
export function checkGallery(
  gallery: readonly PhotoRef[],
  uploads: readonly Upload[],
  currentKeys: readonly string[],
  options: readonly OptionInput[] | undefined,
  maxImageSize?: number,
): Result<true, DomainError> {
  for (const u of uploads) {
    const v = validateImage(u, maxImageSize);
    if (!v.ok) return v;
  }
  const inRange = (n: number) => Number.isInteger(n) && n >= 0 && n < uploads.length;
  const refs = [...gallery, ...(options ?? []).flatMap((o) => o.values.flatMap((v) => v.imageRef ?? []))];
  const bad = refs.find((r) => isUpload(r) && !inRange(r.upload));
  if (bad !== undefined) return invalidImage("A photo points to a file that wasn't sent", { ref: bad });
  const used = gallery.filter(isUpload).map((r) => r.upload);
  if (used.length !== uploads.length || new Set(used).size !== used.length) {
    return invalidImage("Every file sent must appear once in the gallery");
  }
  const kept = gallery.flatMap((r) => (isUpload(r) ? [] : [r.key]));
  const foreign = kept.find((k) => !currentKeys.includes(k));
  if (foreign !== undefined) return invalidImage("The product doesn't have that photo", { key: foreign });
  const dup = kept.find((k, i) => kept.indexOf(k) !== i);
  if (dup !== undefined) return invalidImage("A photo is repeated", { key: dup });
  if (gallery.length > MAX_PRODUCT_IMAGES) {
    return err(
      domainError("TOO_MANY_IMAGES", `At most ${MAX_PRODUCT_IMAGES} photos per product`, {
        max: MAX_PRODUCT_IMAGES,
      }),
    );
  }
  return ok(true);
}

/** The key of each ref, given the keys the uploads got (or placeholders before uploading). */
export const keyOf =
  (uploaded: readonly string[]) =>
  (ref: PhotoRef): string =>
    isUpload(ref) ? (uploaded[ref.upload] ?? "") : ref.key;

/** Stand-in keys to build the product before uploading; real keys never take this shape. */
export const placeholders = (n: number): string[] => Array.from({ length: n }, (_, i) => `\0upload-${i}`);

/** Options and values without id get a fresh one (once, so building the product twice gives the same ids). */
export const withInputIds = (options: readonly OptionInput[], newId: () => string): OptionInput[] =>
  options.map((o) => ({
    ...o,
    id: o.id.trim() || newId(),
    values: o.values.map((v) => ({ ...v, id: v.id.trim() || newId() })),
  }));

/** Options with each value's `imageRef` turned into an `imageKey`; omitted keeps what `current` has. */
export const resolveOptions = (
  options: readonly OptionInput[],
  current: Product | null,
  key: (ref: PhotoRef) => string,
): ProductOption[] => {
  const now = new Map(current?.options.flatMap((o) => o.values.map((v) => [v.id, v.imageKey])) ?? []);
  return options.map((o) => ({
    id: o.id,
    name: o.name,
    values: o.values.map(({ imageRef, ...v }) => ({
      ...v,
      imageKey: imageRef === undefined ? (now.get(v.id) ?? null) : imageRef === null ? null : key(imageRef),
    })),
  }));
};

/**
 * Basic mode keeps what the product has but adds nothing: no second photo uploaded, no value getting
 * a photo it didn't have.
 */
export function checkPro(
  current: Product | null,
  next: Product,
  uploads: number,
  pro: boolean,
): Result<true, DomainError> {
  if (pro) return ok(true);
  const before = new Map(current?.options.flatMap((o) => o.values.map((v) => [v.id, v.imageKey])) ?? []);
  const newValuePhoto = next.options.some((o) =>
    o.values.some((v) => v.imageKey !== null && v.imageKey !== (before.get(v.id) ?? null)),
  );
  if ((uploads > 0 && next.images.length > 1) || newValuePhoto) {
    return err(domainError("PRO_REQUIRED", "More photos need professional photo storage"));
  }
  return ok(true);
}

/** Best-effort: a storage failure leaves an orphan file, never a broken product. */
export async function removeAll(images: ImageStorage, keys: readonly string[]): Promise<void> {
  for (const key of keys) await images.remove(key).catch(() => undefined);
}

/**
 * Uploads in order. If one fails, the ones already uploaded are removed: a full quota is
 * IMAGE_QUOTA_REACHED, anything else is rethrown.
 */
export async function uploadAll(
  images: ImageStorage,
  uploads: readonly Upload[],
): Promise<Result<string[], DomainError>> {
  const keys: string[] = [];
  try {
    for (const u of uploads) keys.push((await images.save(u.bytes, u.mimeType)).key);
    return ok(keys);
  } catch (error) {
    await removeAll(images, keys);
    const quota = imageQuotaReached(error);
    if (quota !== null) return err(quota);
    throw error;
  }
}
