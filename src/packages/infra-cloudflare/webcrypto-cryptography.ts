import type { Cryptography } from "../core/index";

const hex = (bytes: ArrayBuffer): string =>
  [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");

/** Workers' WebCrypto caps PBKDF2 at 100 000 iterations. */
const PASSWORD_ITERATIONS = 100_000;
const SALT_BYTES = 16;

const toBase64 = (bytes: Uint8Array): string => btoa(String.fromCharCode(...bytes));
const fromBase64 = (text: string): Uint8Array<ArrayBuffer> => {
  const binary = atob(text);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

const pbkdf2 = async (
  password: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number,
): Promise<Uint8Array> => {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    key,
    256,
  );
  return new Uint8Array(bits);
};

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

  /** `pbkdf2-sha256$<iterations>$<salt>$<hash>`: the parameters travel with the hash. */
  hashPassword: async (password) => {
    const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
    const hash = await pbkdf2(password, salt, PASSWORD_ITERATIONS);
    return `pbkdf2-sha256$${PASSWORD_ITERATIONS}$${toBase64(salt)}$${toBase64(hash)}`;
  },

  verifyPassword: async (password, stored) => {
    const [scheme, iterations, salt, hash] = stored.split("$");
    if (scheme !== "pbkdf2-sha256" || !iterations || !salt || !hash) return false;
    const expected = await pbkdf2(password, fromBase64(salt), Number(iterations));
    return webCryptography.constantTimeEquals(toBase64(expected), hash);
  },
};
