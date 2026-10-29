import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import type { ProductJson } from "../../src/lib/product-json";
import { call, clearD1, create, PNG_1X1, validCreation } from "../helpers";

/** A Worker without the IMAGENES binding: photos go to D1. */
const noBucket = { ...env, IMAGENES: undefined } as unknown as Env;

const blobCount = async () =>
  (await env.DB.prepare("SELECT COUNT(*) AS n FROM imagenes_blob").first<{ n: number }>())?.n ?? 0;

const codeOf = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code;

beforeEach(async () => {
  await clearD1();
});

describe("basic mode (no R2 binding)", () => {
  it("a second photo needs PRO (403 PRO_REQUIRED)", async () => {
    const { image: _single, ...noImage } = validCreation();
    const photo = { bytes: PNG_1X1, type: "image/png", name: "a.png" };
    const res = await create(
      {
        ...noImage,
        gallery: JSON.stringify([{ upload: 0 }, { upload: 1 }]),
        files: [photo, { ...photo, name: "b.png" }],
      },
      noBucket,
    );
    expect(res.status).toBe(403);
    expect(await codeOf(res)).toBe("PRO_REQUIRED");
  });

  it("stores the photo in D1 and serves it through /img", async () => {
    const res = await create(validCreation(), noBucket);
    expect(res.status).toBe(201);
    const product = (await res.json()) as ProductJson;
    expect(await blobCount()).toBe(1);
    const img = await call(product.images[0]?.url ?? "", undefined, noBucket);
    expect(img.status).toBe(200);
    expect(img.headers.get("content-type")).toBe("image/png");
    expect(new Uint8Array(await img.arrayBuffer())).toEqual(PNG_1X1);
  });

  it("answers 409 IMAGE_QUOTA_REACHED at 200 photos", async () => {
    const rows = Array.from({ length: 200 }, (_, i) =>
      env.DB.prepare(
        "INSERT INTO imagenes_blob (key, mime, bytes, creado_en) VALUES (?, 'image/png', ?, ?)",
      ).bind(`K${i}.png`, PNG_1X1, "2026-10-15T10:00:00.000Z"),
    );
    await env.DB.batch(rows);
    const res = await create(validCreation(), noBucket);
    expect(res.status).toBe(409);
    expect(await codeOf(res)).toBe("IMAGE_QUOTA_REACHED");
  });

  it("rejects a photo over 1.5 MB with 422 INVALID_IMAGE", async () => {
    const big = new Uint8Array(1.6 * 1024 * 1024);
    big.set(PNG_1X1.slice(0, 8));
    const res = await create(
      validCreation({ image: { bytes: big, type: "image/png", name: "big.png" } }),
      noBucket,
    );
    expect(res.status).toBe(422);
    expect(await codeOf(res)).toBe("INVALID_IMAGE");
  });
});
