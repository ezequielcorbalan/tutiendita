import type { IdGenerator } from "../core/index";

/** Crockford base32 alphabet (no I, L, O, U). */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const TIME_LENGTH = 10;
const RANDOM_LENGTH = 16;

let lastTime = -1;
let lastRandom: number[] = [];

const encodeTime = (ms: number): string => {
  let rest = ms;
  let output = "";
  for (let i = 0; i < TIME_LENGTH; i++) {
    output = ALPHABET.charAt(rest % 32) + output;
    rest = Math.floor(rest / 32);
  }
  return output;
};

/** 16 base32 digits = 80 random bits. */
const newRandom = (): number[] => {
  const bytes = new Uint8Array(RANDOM_LENGTH);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b % 32);
};

/** Adds 1 to the base32 digits; overflows only if all 80 bits are 1 (practically impossible). */
const increment = (digits: number[]): number[] => {
  const next = [...digits];
  for (let i = next.length - 1; i >= 0; i--) {
    const d = next[i] ?? 0;
    if (d < 31) {
      next[i] = d + 1;
      return next;
    }
    next[i] = 0;
  }
  throw new Error("ULID: randomness exhausted within the same millisecond");
};

/**
 * Monotonic ULID: within the same millisecond (or if the clock goes back) it increments the previous
 * randomness, so two consecutive ids always sort in increasing order.
 */
export const ulidGenerator: IdGenerator = {
  newId(): string {
    const now = Date.now();
    if (now > lastTime) {
      lastTime = now;
      lastRandom = newRandom();
    } else {
      lastRandom = increment(lastRandom);
    }
    return encodeTime(lastTime) + lastRandom.map((d) => ALPHABET.charAt(d)).join("");
  },
};
