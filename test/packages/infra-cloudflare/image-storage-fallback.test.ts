import { env } from "cloudflare:test";
import type { IdGenerator } from "../../../src/packages/core/index";
import { describe, expect, it } from "vitest";
import { createD1ImageStorage } from "../../../src/packages/infra-cloudflare/d1/image-storage-d1";
import { withFallback } from "../../../src/packages/infra-cloudflare/image-storage-fallback";
import { createR2ImageStorage } from "../../../src/packages/infra-cloudflare/r2/image-storage-r2";

const fixedIds = (...ids: string[]): IdGenerator => {
  let i = 0;
  return { newId: () => ids[i++] ?? "NO-ID" };
};
const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);

describe("withFallback (R2 primary, D1 secondary)", () => {
  it("read falls back to the secondary", async () => {
    const d1 = createD1ImageStorage(env.DB, fixedIds("01ARZ3NDEKTSV4RRFFQ69G5FD1"));
    const { key } = await d1.save(bytes, "image/png");
    const storage = withFallback(createR2ImageStorage(env.IMAGENES, fixedIds()), d1);
    const read = await storage.read(key);
    expect(read?.mimeType).toBe("image/png");
    expect(read?.bytes).toEqual(bytes);
    expect(await storage.read("missing.png")).toBeNull();
  });

  it("save goes to the primary only", async () => {
    const d1 = createD1ImageStorage(env.DB, fixedIds());
    const storage = withFallback(
      createR2ImageStorage(env.IMAGENES, fixedIds("01ARZ3NDEKTSV4RRFFQ69G5FD2")),
      d1,
    );
    const { key } = await storage.save(bytes, "image/webp");
    expect(await env.IMAGENES.get(key)).not.toBeNull();
    expect(await d1.read(key)).toBeNull();
  });

  it("remove reaches both", async () => {
    const r2 = createR2ImageStorage(env.IMAGENES, fixedIds("01ARZ3NDEKTSV4RRFFQ69G5FD3"));
    const d1 = createD1ImageStorage(env.DB, fixedIds("01ARZ3NDEKTSV4RRFFQ69G5FD4"));
    const inR2 = (await r2.save(bytes, "image/png")).key;
    const inD1 = (await d1.save(bytes, "image/png")).key;
    const storage = withFallback(r2, d1);
    await storage.remove(inR2);
    await storage.remove(inD1);
    expect(await r2.read(inR2)).toBeNull();
    expect(await d1.read(inD1)).toBeNull();
    expect(await storage.read(inR2)).toBeNull();
    expect(await storage.read(inD1)).toBeNull();
  });
});
