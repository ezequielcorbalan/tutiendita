export const ALLOWED_MIMES = ["image/jpeg", "image/png", "image/webp"] as const;
export type AllowedMime = (typeof ALLOWED_MIMES)[number];
export const EXTENSION_BY_MIME: Record<AllowedMime, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
/** The MIME for a stored key's extension, or undefined if it isn't an allowed one. */
export const mimeForExtension = (extension: string): AllowedMime | undefined =>
  ALLOWED_MIMES.find((mime) => EXTENSION_BY_MIME[mime] === extension);
export const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

/** Basic mode (photos in D1): most photos and largest size per photo. */
export const MAX_BASIC_PHOTOS = 200;
export const MAX_BASIC_IMAGE_SIZE = 1.5 * 1024 * 1024;

export interface ImageStorage {
  save(bytes: Uint8Array, mimeType: string): Promise<{ key: string }>;
  read(key: string): Promise<{ bytes: Uint8Array; mimeType: AllowedMime } | null>;
  remove(key: string): Promise<void>;
  /** Photos stored by this storage (the basic-mode quota counts them). */
  count(): Promise<number>;
}

/** Thrown by `save` when the basic-mode quota is full. */
export class ImageQuotaError extends Error {
  constructor(readonly max: number) {
    super(`The photo quota of ${max} is full`);
    this.name = "ImageQuotaError";
  }
}
