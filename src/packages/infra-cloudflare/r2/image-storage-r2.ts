import {
  type AllowedMime,
  EXTENSION_BY_MIME,
  type IdGenerator,
  type ImageStorage,
  mimeForExtension,
} from "../../core/index";

const isAllowedMime = (mime: string): mime is AllowedMime => Object.hasOwn(EXTENSION_BY_MIME, mime);

/** Stores images in R2 with key `${ulid}.${ext}`; the domain already validated MIME and size. */
export function createR2ImageStorage(bucket: R2Bucket, ids: IdGenerator): ImageStorage {
  return {
    async save(bytes, mimeType) {
      if (!isAllowedMime(mimeType)) {
        throw new Error(`R2ImageStorage: MIME not allowed ${mimeType}`);
      }
      const key = `${ids.newId()}.${EXTENSION_BY_MIME[mimeType]}`;
      await bucket.put(key, bytes, { httpMetadata: { contentType: mimeType } });
      return { key };
    },

    async read(key) {
      const object = await bucket.get(key);
      if (!object) return null;
      const mimeType = mimeForExtension(key.slice(key.lastIndexOf(".") + 1));
      if (!mimeType) return null;
      return { bytes: new Uint8Array(await object.arrayBuffer()), mimeType };
    },

    async count() {
      return 0; // no quota in professional mode
    },

    async remove(key) {
      await bucket.delete(key);
    },
  };
}
