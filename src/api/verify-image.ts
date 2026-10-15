import { ALLOWED_MIMES, type AllowedMime, type DomainError, domainError } from "../packages/core/index";

/**
 * HTTP edge check, before the use case: the client declares the file name, so its extension (if any)
 * must match the MIME. A disallowed MIME, the size and the byte signature are decided by the domain
 * (createProduct), so they hold at any entry point.
 */
const EXTENSIONS: Record<AllowedMime, readonly string[]> = {
  "image/jpeg": ["jpg", "jpeg"],
  "image/png": ["png"],
  "image/webp": ["webp"],
};

const isAllowedMime = (mime: string): mime is AllowedMime =>
  (ALLOWED_MIMES as readonly string[]).includes(mime);

export function verifyImage(name: string, mimeType: string): DomainError | null {
  if (!isAllowedMime(mimeType)) return null;
  const dot = name.lastIndexOf(".");
  const extension = dot > 0 ? name.slice(dot + 1).toLowerCase() : null;
  if (extension !== null && !EXTENSIONS[mimeType].includes(extension)) {
    return domainError("INVALID_IMAGE", "The file extension doesn't match its type", {
      name,
      mimeType,
    });
  }
  return null;
}
