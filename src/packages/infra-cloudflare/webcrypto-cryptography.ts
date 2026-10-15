import type { Cryptography } from "../core/index";

const hex = (bytes: ArrayBuffer): string =>
  [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");

/** The `Cryptography` port with WebCrypto (available in Workers with no dependencies). */
export const webCryptography: Cryptography = {
  randomBytes: (n) => crypto.getRandomValues(new Uint8Array(n)),

  sha256Hex: async (text) => hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))),

  /** Always walks the whole text: timing does not depend on where they differ (hashes have fixed length). */
  constantTimeEquals: (a, b) => {
    let difference = a.length ^ b.length;
    for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
      difference |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
    }
    return difference === 0;
  },
};
