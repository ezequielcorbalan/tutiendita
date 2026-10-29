import { describe, expect, it } from "vitest";
import { webCryptography } from "../../../src/packages/infra-cloudflare/webcrypto-cryptography";

describe("password hash", () => {
  it("verifies the right password, rejects others, and salts every hash", async () => {
    const first = await webCryptography.hashPassword("Tigre-Manzana-2026!");
    const second = await webCryptography.hashPassword("Tigre-Manzana-2026!");
    expect(first).toMatch(/^pbkdf2-sha256\$100000\$/);
    expect(first).not.toBe(second);
    expect(await webCryptography.verifyPassword("Tigre-Manzana-2026!", first)).toBe(true);
    expect(await webCryptography.verifyPassword("Tigre-Manzana-2026?", first)).toBe(false);
    expect(await webCryptography.verifyPassword("anything", "not-a-hash")).toBe(false);
  });
});
