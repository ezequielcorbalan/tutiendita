import { env } from "cloudflare:test";
import { type IdGenerator, ImageQuotaError, MAX_BASIC_PHOTOS } from "../../../src/packages/core/index";
import { describe, expect, it } from "vitest";
import { createD1ImageStorage } from "../../../src/packages/infra-cloudflare/d1/image-storage-d1";

const fixedIds = (...ids: string[]): IdGenerator => {
  let i = 0;
  return { newId: () => ids[i++] ?? "NO-ID" };
};
const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);

describe("D1ImageStorage", () => {
  it("saves with key = id + extension and read returns the same bytes and mime", async () => {
    const storage = createD1ImageStorage(
      env.DB,
      fixedIds("01ARZ3NDEKTSV4RRFFQ69G5FC1", "01ARZ3NDEKTSV4RRFFQ69G5FC2"),
    );
    expect(await storage.save(bytes, "image/png")).toEqual({ key: "01ARZ3NDEKTSV4RRFFQ69G5FC1.png" });
    expect(await storage.save(bytes, "image/jpeg")).toEqual({ key: "01ARZ3NDEKTSV4RRFFQ69G5FC2.jpg" });
    const read = await storage.read("01ARZ3NDEKTSV4RRFFQ69G5FC1.png");
    expect(read?.mimeType).toBe("image/png");
    expect(read?.bytes).toEqual(bytes);
  });

  it("read of an unknown key is null", async () => {
    const storage = createD1ImageStorage(env.DB, fixedIds());
    expect(await storage.read("missing.png")).toBeNull();
  });

  it("remove leaves read as null and count drops", async () => {
    const storage = createD1ImageStorage(env.DB, fixedIds("01ARZ3NDEKTSV4RRFFQ69G5FC3"));
    const before = await storage.count();
    const { key } = await storage.save(bytes, "image/webp");
    expect(await storage.count()).toBe(before + 1);
    await storage.remove(key);
    expect(await storage.read(key)).toBeNull();
    expect(await storage.count()).toBe(before);
  });

  it("the 201st save throws ImageQuotaError with max 200", async () => {
    const storage = createD1ImageStorage(env.DB, fixedIds("01ARZ3NDEKTSV4RRFFQ69G5FC4"));
    const current = await storage.count();
    const insert = env.DB.prepare(
      "INSERT INTO imagenes_blob (key, mime, bytes, creado_en) VALUES (?, 'image/png', x'01', '2026-10-17T10:00:00.000Z')",
    );
    await env.DB.batch(
      Array.from({ length: MAX_BASIC_PHOTOS - current }, (_, n) => insert.bind(`quota-${n}.png`)),
    );
    expect(await storage.count()).toBe(MAX_BASIC_PHOTOS);
    const error = await storage.save(bytes, "image/png").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ImageQuotaError);
    expect((error as ImageQuotaError).max).toBe(200);
    await env.DB.prepare("DELETE FROM imagenes_blob WHERE key LIKE 'quota-%'").run();
  });

  it("a disallowed MIME throws and saves nothing", async () => {
    const storage = createD1ImageStorage(env.DB, fixedIds("01ARZ3NDEKTSV4RRFFQ69G5FC5"));
    const before = await storage.count();
    await expect(storage.save(bytes, "image/gif")).rejects.toThrow(/image\/gif/);
    expect(await storage.count()).toBe(before);
  });
});
