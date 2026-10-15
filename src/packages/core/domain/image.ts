/**
 * An image's MIME type is declared by the uploader: the bytes must start with that format's
 * signature ("magic bytes"). A MIME type without a known signature never matches.
 */
const startsWith = (bytes: Uint8Array, signature: readonly number[], from = 0): boolean =>
  bytes.byteLength >= from + signature.length && signature.every((b, i) => bytes[from + i] === b);

const ascii = (s: string): number[] => Array.from(s, (ch) => ch.charCodeAt(0));

const SIGNATURES: Readonly<Record<string, (bytes: Uint8Array) => boolean>> = {
  "image/png": (b) => startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  "image/jpeg": (b) => startsWith(b, [0xff, 0xd8, 0xff]),
  "image/webp": (b) => startsWith(b, ascii("RIFF")) && startsWith(b, ascii("WEBP"), 8),
};

export const bytesMatchMime = (bytes: Uint8Array, mimeType: string): boolean =>
  Object.hasOwn(SIGNATURES, mimeType) && (SIGNATURES[mimeType]?.(bytes) ?? false);
