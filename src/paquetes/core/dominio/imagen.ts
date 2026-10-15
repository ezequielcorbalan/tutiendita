/**
 * El MIME de una imagen lo declara quien la sube: se exige que los bytes empiecen con la firma
 * ("magic bytes") de ese formato. Un MIME sin firma conocida nunca coincide.
 */
const empiezaCon = (bytes: Uint8Array, firma: readonly number[], desde = 0): boolean =>
  bytes.byteLength >= desde + firma.length && firma.every((b, i) => bytes[desde + i] === b);

const ascii = (s: string): number[] => Array.from(s, (ch) => ch.charCodeAt(0));

const FIRMAS: Readonly<Record<string, (bytes: Uint8Array) => boolean>> = {
  "image/png": (b) => empiezaCon(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  "image/jpeg": (b) => empiezaCon(b, [0xff, 0xd8, 0xff]),
  "image/webp": (b) => empiezaCon(b, ascii("RIFF")) && empiezaCon(b, ascii("WEBP"), 8),
};

export const bytesCoincidenConMime = (bytes: Uint8Array, tipoMime: string): boolean =>
  Object.hasOwn(FIRMAS, tipoMime) && (FIRMAS[tipoMime]?.(bytes) ?? false);
