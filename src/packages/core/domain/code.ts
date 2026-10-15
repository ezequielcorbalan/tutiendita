/**
 * Human codes (claim and recovery): 120 bits in 24 Crockford base32 characters, shown in six
 * groups of four. The caller supplies the entropy (`Cryptography` port).
 */
export const CROCKFORD_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const CODE_BYTES = 15;
export const CODE_LENGTH = 24;

const WELL_FORMED = /^[0-9A-HJKMNP-TV-Z]{24}$/;

export function codeFromBytes(bytes: Uint8Array): string {
  if (bytes.length !== CODE_BYTES) {
    throw new Error(`A code needs ${CODE_BYTES} bytes, got ${bytes.length}`);
  }
  let output = "";
  let accumulated = 0;
  let bits = 0;
  for (const byte of bytes) {
    accumulated = (accumulated << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      output += CROCKFORD_ALPHABET[(accumulated >> bits) & 31];
    }
    accumulated &= (1 << bits) - 1;
  }
  return output;
}

/** As people type it → canonical form: no separators, uppercase, O→0 and I/L→1. */
export const normalizeCode = (text: string): string =>
  text
    .replace(/[\s-]+/g, "")
    .toUpperCase()
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1");

export const isWellFormedCode = (normalized: string): boolean => WELL_FORMED.test(normalized);

export const formatCode = (code: string): string => code.match(/.{1,4}/g)?.join("-") ?? "";

const BASE64URL_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

/** Unpadded base64url (RFC 4648 §5): session ids, challenges and `webauthn_user_id`. */
export function toBase64Url(bytes: Uint8Array): string {
  let output = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] ?? 0;
    const b = bytes[i + 1] ?? 0;
    const c = bytes[i + 2] ?? 0;
    const n = (a << 16) | (b << 8) | c;
    const remaining = bytes.length - i;
    output += BASE64URL_ALPHABET[(n >> 18) & 63];
    output += BASE64URL_ALPHABET[(n >> 12) & 63];
    if (remaining > 1) output += BASE64URL_ALPHABET[(n >> 6) & 63];
    if (remaining > 2) output += BASE64URL_ALPHABET[n & 63];
  }
  return output;
}
