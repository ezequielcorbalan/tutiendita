export const ALLOWED_MIMES = ["image/jpeg", "image/png", "image/webp"] as const;
export type AllowedMime = (typeof ALLOWED_MIMES)[number];
export const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

export interface ImageStorage {
  save(bytes: Uint8Array, mimeType: string): Promise<{ key: string }>;
  remove(key: string): Promise<void>;
}
