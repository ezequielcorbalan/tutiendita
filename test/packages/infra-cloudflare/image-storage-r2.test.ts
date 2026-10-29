import { env } from "cloudflare:test";
import type { IdGenerator } from "../../../src/packages/core/index";
import { describe, expect, it } from "vitest";
import { createR2ImageStorage } from "../../../src/packages/infra-cloudflare/r2/image-storage-r2";

const fixedIds = (...ids: string[]): IdGenerator => {
  let i = 0;
  return { newId: () => ids[i++] ?? "NO-ID" };
};
const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);

describe("R2ImageStorage", () => {
  it("saves with key = id + extension from the MIME", async () => {
    const storage = createR2ImageStorage(
      env.IMAGENES,
      fixedIds("01ARZ3NDEKTSV4RRFFQ69G5FB1", "01ARZ3NDEKTSV4RRFFQ69G5FB2", "01ARZ3NDEKTSV4RRFFQ69G5FB3"),
    );
    expect(await storage.save(bytes, "image/jpeg")).toEqual({ key: "01ARZ3NDEKTSV4RRFFQ69G5FB1.jpg" });
    expect(await storage.save(bytes, "image/png")).toEqual({ key: "01ARZ3NDEKTSV4RRFFQ69G5FB2.png" });
    expect(await storage.save(bytes, "image/webp")).toEqual({ key: "01ARZ3NDEKTSV4RRFFQ69G5FB3.webp" });
  });

  it("the stored object has the same bytes and contentType", async () => {
    const storage = createR2ImageStorage(env.IMAGENES, fixedIds("01ARZ3NDEKTSV4RRFFQ69G5FB4"));
    const { key } = await storage.save(bytes, "image/png");
    const object = await env.IMAGENES.get(key);
    expect(object).not.toBeNull();
    expect(new Uint8Array(await (object as R2ObjectBody).arrayBuffer())).toEqual(bytes);
    expect(object?.httpMetadata?.contentType).toBe("image/png");
  });

  it("remove leaves get as null", async () => {
    const storage = createR2ImageStorage(env.IMAGENES, fixedIds("01ARZ3NDEKTSV4RRFFQ69G5FB5"));
    const { key } = await storage.save(bytes, "image/webp");
    await storage.remove(key);
    expect(await env.IMAGENES.get(key)).toBeNull();
  });

  it("a disallowed MIME is an infrastructure error and saves nothing", async () => {
    const storage = createR2ImageStorage(env.IMAGENES, fixedIds("01ARZ3NDEKTSV4RRFFQ69G5FB6"));
    await expect(storage.save(bytes, "image/gif")).rejects.toThrow(/image\/gif/);
    const listed = await env.IMAGENES.list({ prefix: "01ARZ3NDEKTSV4RRFFQ69G5FB6" });
    expect(listed.objects).toHaveLength(0);
  });

  it("read returns the stored bytes and mime", async () => {
    const storage = createR2ImageStorage(env.IMAGENES, fixedIds("01ARZ3NDEKTSV4RRFFQ69G5FB7"));
    const { key } = await storage.save(bytes, "image/webp");
    const read = await storage.read(key);
    expect(read?.mimeType).toBe("image/webp");
    expect(read?.bytes).toEqual(bytes);
  });

  it("read of an unknown key is null", async () => {
    const storage = createR2ImageStorage(env.IMAGENES, fixedIds());
    expect(await storage.read("missing.png")).toBeNull();
  });
});
