import { describe, expect, it } from "vitest";
import { ulidGenerator } from "../../../src/packages/infra-cloudflare/ulid-generator";

describe("ulidGenerator", () => {
  it("generates 26 Crockford base32 characters", () => {
    const id = ulidGenerator.newId();
    expect(id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
  });

  it("two consecutive ids are different and increasing", () => {
    const a = ulidGenerator.newId();
    const b = ulidGenerator.newId();
    expect(a).not.toBe(b);
    expect(a < b).toBe(true);
  });

  it("a thousand consecutive ids (same millisecond) keep a strictly increasing order", () => {
    const ids = Array.from({ length: 1000 }, () => ulidGenerator.newId());
    for (let i = 1; i < ids.length; i++) {
      expect((ids[i - 1] ?? "") < (ids[i] ?? "")).toBe(true);
    }
  });
});
