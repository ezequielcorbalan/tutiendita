import type { ImageStorage } from "../core/index";

/**
 * Reads try `primary` and then `secondary` (photos saved before a storage switch stay visible); new
 * photos and the quota count go to `primary`; removal reaches both, since the key may live in either.
 */
export const withFallback = (primary: ImageStorage, secondary: ImageStorage): ImageStorage => ({
  save: (bytes, mimeType) => primary.save(bytes, mimeType),
  read: async (key) => (await primary.read(key)) ?? secondary.read(key),
  remove: async (key) => {
    await Promise.all([primary.remove(key), secondary.remove(key)]);
  },
  count: () => primary.count(),
});
