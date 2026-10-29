import { describe, expect, it } from "vitest";
import {
  CROCKFORD_ALPHABET,
  codeFromBytes,
  formatCode,
  isWellFormedCode,
  normalizeCode,
  toBase64Url,
} from "../../../src/packages/core/domain/code";

describe("codeFromBytes", () => {
  it("15 bytes (120 bits) → 24 Crockford alphabet characters", () => {
    const c = codeFromBytes(Uint8Array.from({ length: 15 }, (_, i) => i * 17));
    expect(c).toHaveLength(24);
    for (const ch of c) expect(CROCKFORD_ALPHABET).toContain(ch);
  });

  it("all zeros → 24 '0' and all 0xff → 24 'Z'", () => {
    expect(codeFromBytes(new Uint8Array(15))).toBe("0".repeat(24));
    expect(codeFromBytes(new Uint8Array(15).fill(0xff))).toBe("Z".repeat(24));
  });

  it("encodes 5 bits at a time in order (big endian)", () => {
    // 0b00001_00010_00011_00100_00101_00110_00111_01000 = 0x08 0x86 0x42 0x98 0xe8
    const bytes = new Uint8Array(15);
    bytes.set([0x08, 0x86, 0x42, 0x98, 0xe8]);
    expect(codeFromBytes(bytes).slice(0, 8)).toBe("12345678");
  });

  it("rejects a length other than 15 bytes", () => {
    expect(() => codeFromBytes(new Uint8Array(14))).toThrow(/15 bytes/);
  });
});

describe("normalizeCode", () => {
  it("removes hyphens and spaces and uppercases", () => {
    expect(normalizeCode(" 7kq2-m9xd 4rta ")).toBe("7KQ2M9XD4RTA");
  });

  it("O → 0 and I/L → 1 (the characters people mix up)", () => {
    expect(normalizeCode("oOiIlL")).toBe("001111");
  });
});

describe("formatCode and isWellFormedCode", () => {
  it("six groups of four separated by hyphens", () => {
    expect(formatCode("ABCDEFGHJKMNPQRSTVWXYZ01")).toBe("ABCD-EFGH-JKMN-PQRS-TVWX-YZ01");
  });

  it("a normalized 24-character alphabet code is well formed; others are not", () => {
    expect(isWellFormedCode("ABCDEFGHJKMNPQRSTVWXYZ01")).toBe(true);
    expect(isWellFormedCode("ABCD")).toBe(false);
    expect(isWellFormedCode("ABCDEFGHJKMNPQRSTVWXYZ0U")).toBe(false);
  });
});

describe("toBase64Url", () => {
  it("encodes without padding using the URL alphabet", () => {
    expect(toBase64Url(Uint8Array.from([0xfb, 0xff, 0xbf]))).toBe("-_-_");
    expect(toBase64Url(Uint8Array.from([0x66, 0x6f]))).toBe("Zm8");
    expect(toBase64Url(Uint8Array.from([0x66]))).toBe("Zg");
    expect(toBase64Url(new Uint8Array(0))).toBe("");
  });
});
