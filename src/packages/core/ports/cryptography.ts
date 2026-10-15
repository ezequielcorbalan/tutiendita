/** Core does not touch global `crypto`: entropy and hashes come through this port. */
export interface Cryptography {
  randomBytes(n: number): Uint8Array;
  /** SHA-256 of the UTF-8 text, in lowercase hex. */
  sha256Hex(text: string): Promise<string>;
  constantTimeEquals(a: string, b: string): boolean;
}

/**
 * SHA-256 (hex) of the last build's claim code, or `null` if the build did not embed it. The app provides
 * it from the virtual module `virtual:tiendita/claim`.
 */
export type ClaimCodeHash = () => string | null;
