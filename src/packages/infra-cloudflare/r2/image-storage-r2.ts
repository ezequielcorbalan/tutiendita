import type { AllowedMime, IdGenerator, ImageStorage } from "../../core/index";

const EXTENSIONS: Record<AllowedMime, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const isAllowedMime = (mime: string): mime is AllowedMime => Object.hasOwn(EXTENSIONS, mime);

/** Stores images in R2 with key `${ulid}.${ext}`; the domain already validated MIME and size. */
export function createR2ImageStorage(bucket: R2Bucket, ids: IdGenerator): ImageStorage {
  return {
    async save(bytes, mimeType) {
      if (!isAllowedMime(mimeType)) {
        throw new Error(`R2ImageStorage: MIME not allowed ${mimeType}`);
      }
      const key = `${ids.newId()}.${EXTENSIONS[mimeType]}`;
      await bucket.put(key, bytes, { httpMetadata: { contentType: mimeType } });
      return { key };
    },

    async remove(key) {
      await bucket.delete(key);
    },
  };
}
