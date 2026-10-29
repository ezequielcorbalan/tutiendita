import { env } from "cloudflare:workers";
import { SAMPLE_CATALOG, SAMPLE_INDUSTRIES, samplePhotoPath } from "../../src/packages/core/index";
import { beforeEach, describe, expect, it } from "vitest";
import type { ProductJson } from "../../src/lib/product-json";
import {
  BASE,
  bucket,
  call,
  clearD1,
  clearR2,
  cookieHeader,
  seedStore,
  send,
  startTestSession,
} from "../helpers";

const errorOf = async (res: Response) => ((await res.json()) as { error: { code: string } }).error;
const r2Objects = async () => (await bucket().list()).objects.length;
const published = async () => (await (await call("/api/products")).json()) as ProductJson[];
const count = async (table: string) =>
  (await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first<{ n: number }>())?.n;

beforeEach(async () => {
  await clearD1();
  await clearR2();
});

describe("POST /api/samples", () => {
  it("loads the industry's categories and products, published and with their photo in R2", async () => {
    await seedStore("es");
    const res = await send(
      "POST",
      "/api/samples",
      { industry: "pasteleria" },
      { cookies: await startTestSession() },
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ created: 6 });
    const products = await published();
    expect(products).toHaveLength(6);
    const cake = products.find((p) => p.slug === "torta-de-chocolate");
    expect(cake?.name).toBe("Torta de chocolate");
    expect(cake?.categoryId).toBe("ejemplo-pasteleria-tortas");
    expect(cake?.images[0]?.key).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}\.webp$/);
    expect(cake?.description).toContain("Foto: ");
    expect(await r2Objects()).toBe(6);
    expect(await count("categorias")).toBe(3);
    // The photo is served by /img like any other.
    const img = await call(cake?.images[0]?.url ?? "");
    expect(img.status).toBe(200);
    expect(img.headers.get("content-type")).toBe("image/webp");
  });

  it("in the store's language", async () => {
    await seedStore("pt");
    await send("POST", "/api/samples", { industry: "almacen" }, { cookies: await startTestSession() });
    expect((await published()).map((p) => p.name)).toContain("Erva-mate (1 kg)");
  });

  it("is idempotent: loading twice duplicates no products, categories or photos", async () => {
    await seedStore();
    const cookies = await startTestSession();
    await send("POST", "/api/samples", { industry: "ropa" }, { cookies });
    const other = await send("POST", "/api/samples", { industry: "ropa" }, { cookies });
    expect(await other.json()).toEqual({ created: 0 });
    expect(await published()).toHaveLength(6);
    expect(await count("categorias")).toBe(3);
    expect(await r2Objects()).toBe(6);
  });

  it("without a session → 401 and creates nothing", async () => {
    await seedStore();
    const res = await send("POST", "/api/samples", { industry: "pasteleria" });
    expect(res.status).toBe(401);
    expect((await errorOf(res)).code).toBe("NOT_AUTHENTICATED");
    expect(await count("productos")).toBe(0);
  });

  it("with a session but from another origin → 403 and creates nothing", async () => {
    await seedStore();
    const res = await send(
      "POST",
      "/api/samples",
      { industry: "pasteleria" },
      { cookies: await startTestSession(), origin: "https://attacker.example" },
    );
    expect(res.status).toBe(403);
    expect((await errorOf(res)).code).toBe("ORIGIN_NOT_ALLOWED");
    expect(await count("productos")).toBe(0);
  });

  it("with the claim session → 403 ACCESS_LIMITED", async () => {
    const res = await send(
      "POST",
      "/api/samples",
      { industry: "pasteleria" },
      { cookies: await startTestSession("reclamo") },
    );
    expect(res.status).toBe(403);
    expect((await errorOf(res)).code).toBe("ACCESS_LIMITED");
  });

  it("an unknown industry → 422 INVALID_INPUT", async () => {
    const res = await send(
      "POST",
      "/api/samples",
      { industry: "ferreteria" },
      { cookies: await startTestSession() },
    );
    expect(res.status).toBe(422);
    expect((await errorOf(res)).code).toBe("INVALID_INPUT");
  });
});

describe("DELETE /api/samples", () => {
  it("deletes every sample product, its photos and its categories; own products stay", async () => {
    await seedStore();
    const cookies = await startTestSession();
    await send("POST", "/api/samples", { industry: "pasteleria" }, { cookies });
    await send("POST", "/api/samples", { industry: "artesanias" }, { cookies });
    const own = new FormData();
    own.set("name", "Pan de campo");
    own.set("price_amount", "250000");
    own.set("price_currency", "ARS");
    expect(
      (
        await call("/api/products", {
          method: "POST",
          body: own,
          headers: { origin: BASE, cookie: cookieHeader(cookies) },
        })
      ).status,
    ).toBe(201);

    const res = await send("DELETE", "/api/samples", undefined, { cookies });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ deleted: 12 });
    expect(await count("productos")).toBe(1);
    expect(await count("categorias")).toBe(0);
    expect(await count("imagenes_producto")).toBe(0);
    expect(await r2Objects()).toBe(0);
  });

  it("without a session → 401; from another origin → 403; deletes nothing", async () => {
    await seedStore();
    const cookies = await startTestSession();
    await send("POST", "/api/samples", { industry: "pasteleria" }, { cookies });
    expect((await send("DELETE", "/api/samples")).status).toBe(401);
    expect(
      (await send("DELETE", "/api/samples", undefined, { cookies, origin: "https://attacker.example" }))
        .status,
    ).toBe(403);
    expect(await count("productos")).toBe(6);
  });
});

describe("sample photos", () => {
  it("each catalog product has its WebP photo in public/ (under 60 KB)", async () => {
    for (const industry of SAMPLE_INDUSTRIES) {
      for (const p of SAMPLE_CATALOG[industry].categories.flatMap((c) => c.products)) {
        const path = samplePhotoPath(industry, p.key);
        const res = await env.ASSETS.fetch(new URL(path, BASE));
        expect(res.status, path).toBe(200);
        const bytes = new Uint8Array(await res.arrayBuffer());
        expect(new TextDecoder().decode(bytes.slice(8, 12)), path).toBe("WEBP");
        expect(bytes.byteLength, path).toBeLessThan(60 * 1024);
      }
    }
  });
});
