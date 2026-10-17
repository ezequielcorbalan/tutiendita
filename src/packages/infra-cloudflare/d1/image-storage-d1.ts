import {
  type AllowedMime,
  EXTENSION_BY_MIME,
  type IdGenerator,
  ImageQuotaError,
  type ImageStorage,
  MAX_BASIC_PHOTOS,
} from "../../core/index";
import { count, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { iso } from "./dates";
import { imageBlobs } from "./schema";

const isAllowedMime = (mime: string): mime is AllowedMime => Object.hasOwn(EXTENSION_BY_MIME, mime);

/** Stores images in D1 with key `${ulid}.${ext}`, up to MAX_BASIC_PHOTOS; the domain already validated MIME and size. */
export function createD1ImageStorage(db: D1Database, ids: IdGenerator): ImageStorage {
  const orm = drizzle(db);
  const countImages = async () => {
    const [row] = await orm.select({ total: count() }).from(imageBlobs);
    return row?.total ?? 0;
  };
  return {
    async save(bytes, mimeType) {
      if (!isAllowedMime(mimeType)) {
        throw new Error(`D1ImageStorage: MIME not allowed ${mimeType}`);
      }
      // shortcut: count-then-insert can reach 201 under two concurrent uploads, fine for a 200 quota
      if ((await countImages()) >= MAX_BASIC_PHOTOS) throw new ImageQuotaError(MAX_BASIC_PHOTOS);
      const key = `${ids.newId()}.${EXTENSION_BY_MIME[mimeType]}`;
      await orm
        .insert(imageBlobs)
        .values({ key, mime: mimeType, bytes: Buffer.from(bytes), createdAt: iso(new Date()) });
      return { key };
    },

    async read(key) {
      const [row] = await orm.select().from(imageBlobs).where(eq(imageBlobs.key, key));
      if (!row || !isAllowedMime(row.mime)) return null;
      return { bytes: new Uint8Array(row.bytes), mimeType: row.mime };
    },

    count: countImages,

    async remove(key) {
      await orm.delete(imageBlobs).where(eq(imageBlobs.key, key));
    },
  };
}
