/** Core does not touch global `crypto`: entropy and hashes come through this port. */
export interface Cryptography {
  randomBytes(n: number): Uint8Array;
  /** SHA-256 of the UTF-8 text, in lowercase hex. */
  sha256Hex(text: string): Promise<string>;
  constantTimeEquals(a: string, b: string): boolean;
  /** A slow, salted hash of a password; the result is opaque and stored as it is. */
  hashPassword(password: string): Promise<string>;
  verifyPassword(password: string, stored: string): Promise<boolean>;
}

/**
 * SHA-256 (hex) of the last build's claim code, or `null` if the build did not embed it. The app provides
 * it from the virtual module `virtual:tiendita/claim`.
 */
export type ClaimCodeHash = () => string | null;
