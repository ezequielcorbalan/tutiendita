import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import type { ProductJson } from "../../src/lib/product-json";
import {
  BASE,
  bucket,
  call,
  clearD1,
  clearR2,
  cookieHeader,
  create,
  creationHeaders,
  form,
  PNG_1X1,
  startTestSession,
  validCreation,
} from "../helpers";

type ErrorBody = { error: { code: string; message?: string; details?: Record<string, unknown> } };

const errorOf = async (res: Response) => ((await res.json()) as ErrorBody).error;
const r2Objects = async () => (await bucket().list()).objects.map((o) => o.key);
const GIF_1X1 = Uint8Array.from(atob("R0lGODlhAQABAAAAACw="), (c) => c.charCodeAt(0));

beforeEach(async () => {
  await clearD1();
  await clearR2();
});

describe("POST /api/products", () => {
  it("creates a published product with an image (201) and uploads the image to R2", async () => {
    const res = await create(validCreation());
    expect(res.status).toBe(201);
    const p = (await res.json()) as ProductJson;
    expect(p.slug).toBe("dulce-de-leche-artesanal-500g");
    expect(p.status).toBe("publicado");
    expect(p.price).toEqual({ amount: 4500, currency: "ARS" });
    expect(p.images).toHaveLength(1);
    const [img] = p.images;
    expect(img?.key).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}\.png$/);
    expect(img?.url).toBe(`/img/${img?.key}`);
    expect(await r2Objects()).toEqual([img?.key]);
  });

  it("unpublished it stays a draft and doesn't show in the public list", async () => {
    const res = await create(validCreation({ publish: "false" }));
    expect(res.status).toBe(201);
    expect(((await res.json()) as ProductJson).status).toBe("borrador");
    expect(await (await call("/api/products")).json()).toEqual([]);
  });

  it("two products with the same name coexist (slug -2)", async () => {
    await create(validCreation());
    const res = await create(validCreation());
    expect(((await res.json()) as ProductJson).slug).toBe("dulce-de-leche-artesanal-500g-2");
  });

  it("no session → 401 NOT_AUTHENTICATED, nothing saved", async () => {
    const res = await call("/api/products", {
      method: "POST",
      body: form(validCreation()),
      headers: { origin: BASE },
    });
    expect(res.status).toBe(401);
    expect((await errorOf(res)).code).toBe("NOT_AUTHENTICATED");
    expect(await r2Objects()).toEqual([]);
  });

  it("with a session but a foreign Origin → 403 ORIGIN_NOT_ALLOWED", async () => {
    const headers = await creationHeaders();
    headers.set("origin", "https://attacker.example");
    const res = await call("/api/products", { method: "POST", body: form(validCreation()), headers });
    expect(res.status).toBe(403);
    expect((await errorOf(res)).code).toBe("ORIGIN_NOT_ALLOWED");
    expect(await r2Objects()).toEqual([]);
  });

  it("no Origin or Sec-Fetch-Site → 403; with Sec-Fetch-Site: same-origin it's accepted", async () => {
    const headers = await creationHeaders();
    headers.delete("origin");
    const noOrigin = await call("/api/products", {
      method: "POST",
      body: form(validCreation()),
      headers,
    });
    expect(noOrigin.status).toBe(403);
    headers.set("sec-fetch-site", "same-origin");
    const sameSite = await call("/api/products", {
      method: "POST",
      body: form(validCreation()),
      headers,
    });
    expect(sameSite.status).toBe(201);
  });

  it.each(["recuperacion", "reclamo"] as const)("with a %s session → 403 ACCESS_LIMITED", async (type) => {
    const cookies = await startTestSession(type);
    const res = await call("/api/products", {
      method: "POST",
      body: form(validCreation()),
      headers: { origin: BASE, cookie: cookieHeader(cookies) },
    });
    expect(res.status).toBe(403);
    expect((await errorOf(res)).code).toBe("ACCESS_LIMITED");
  });

  it("no image and publish=true → 422 NO_IMAGE, nothing saved", async () => {
    const { image: _unused, ...fields } = validCreation();
    const res = await create(fields);
    expect(res.status).toBe(422);
    expect((await errorOf(res)).code).toBe("NO_IMAGE");
    const rows = await env.DB.prepare("SELECT count(*) AS n FROM productos").first<{ n: number }>();
    expect(rows?.n).toBe(0);
  });

  it("price 0 with publish=true → 422 INVALID_PRICE and empty R2", async () => {
    const res = await create(validCreation({ price_amount: "0" }));
    expect(res.status).toBe(422);
    expect((await errorOf(res)).code).toBe("INVALID_PRICE");
    expect(await r2Objects()).toEqual([]);
  });

  it.each(["12.50", "-1", "abc", "", "1e3", "99999999999999999999"])(
    "price_amount=%j → 422 INVALID_INPUT on that field",
    async (amount) => {
      const res = await create(validCreation({ price_amount: amount }));
      expect(res.status).toBe(422);
      const e = await errorOf(res);
      expect(e.code).toBe("INVALID_INPUT");
      expect(e.details?.fields).toHaveProperty("price_amount");
      expect(await r2Objects()).toEqual([]);
    },
  );

  it("invalid currency, name and publish → 422 INVALID_INPUT with each field", async () => {
    const res = await create(validCreation({ price_currency: "ars", name: "  ", publish: "yes" }));
    expect(res.status).toBe(422);
    const e = await errorOf(res);
    expect(e.code).toBe("INVALID_INPUT");
    expect(Object.keys(e.details?.fields as object).sort()).toEqual(["name", "price_currency", "publish"]);
  });

  it("empty form → 422 INVALID_INPUT, never 500", async () => {
    const res = await call("/api/products", {
      method: "POST",
      body: new FormData(),
      headers: await creationHeaders(),
    });
    expect(res.status).toBe(422);
    expect((await errorOf(res)).code).toBe("INVALID_INPUT");
  });

  it("image/gif → 422 INVALID_IMAGE and empty R2", async () => {
    const res = await create(validCreation({ image: { bytes: GIF_1X1, type: "image/gif", name: "a.gif" } }));
    expect(res.status).toBe(422);
    expect((await errorOf(res)).code).toBe("INVALID_IMAGE");
    expect(await r2Objects()).toEqual([]);
  });

  it("allowed MIME with a misleading extension → 422 INVALID_IMAGE and empty R2", async () => {
    const res = await create(
      validCreation({ image: { bytes: PNG_1X1, type: "image/png", name: "virus.exe" } }),
    );
    expect(res.status).toBe(422);
    expect((await errorOf(res)).code).toBe("INVALID_IMAGE");
    expect(await r2Objects()).toEqual([]);
  });

  it("allowed MIME with content that isn't that image → 422 INVALID_IMAGE and empty R2", async () => {
    const res = await create(
      validCreation({ image: { bytes: GIF_1X1, type: "image/png", name: "photo.png" } }),
    );
    expect(res.status).toBe(422);
    expect((await errorOf(res)).code).toBe("INVALID_IMAGE");
    expect(await r2Objects()).toEqual([]);
  });

  it("over 5 MB → 422 INVALID_IMAGE and empty R2", async () => {
    const large = new Uint8Array(5 * 1024 * 1024 + 1);
    large.set([0xff, 0xd8, 0xff, 0xe0]);
    const res = await create(
      validCreation({ image: { bytes: large, type: "image/jpeg", name: "large.jpg" } }),
    );
    expect(res.status).toBe(422);
    const e = await errorOf(res);
    expect(e.code).toBe("INVALID_IMAGE");
    expect(e.details).toMatchObject({ max: 5 * 1024 * 1024 });
    expect(await r2Objects()).toEqual([]);
  });

  it("body over 41 MB → 413 BODY_TOO_LARGE, nothing saved", async () => {
    const huge = new Uint8Array(41 * 1024 * 1024 + 1);
    huge.set([0xff, 0xd8, 0xff, 0xe0]);
    const res = await create(validCreation({ image: { bytes: huge, type: "image/jpeg", name: "huge.jpg" } }));
    expect(res.status).toBe(413);
    expect((await errorOf(res)).code).toBe("BODY_TOO_LARGE");
    expect(await r2Objects()).toEqual([]);
    const rows = await env.DB.prepare("SELECT count(*) AS n FROM productos").first<{ n: number }>();
    expect(rows?.n).toBe(0);
  });

  it("a 120-character name and a 5000-character description are accepted (201)", async () => {
    const res = await create(validCreation({ name: "n".repeat(120), description: "d".repeat(5000) }));
    expect(res.status).toBe(201);
  });

  it("a name over 120 or a description over 5000 characters → 422 INVALID_INPUT", async () => {
    const res = await create(validCreation({ name: "n".repeat(121), description: "d".repeat(5001) }));
    expect(res.status).toBe(422);
    const e = await errorOf(res);
    expect(e.code).toBe("INVALID_INPUT");
    expect(Object.keys(e.details?.fields as object).sort()).toEqual(["description", "name"]);
    expect(await r2Objects()).toEqual([]);
  });
});

describe("GET /api/products", () => {
  it("lists the published ones and gets one by slug", async () => {
    const created = (await (await create(validCreation())).json()) as ProductJson;
    const list = (await (await call("/api/products")).json()) as ProductJson[];
    expect(list.map((p) => p.slug)).toEqual([created.slug]);

    const res = await call(`/api/products/${created.slug}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(created);
  });

  it("unknown slug → 404 PRODUCT_NOT_FOUND", async () => {
    const res = await call("/api/products/does-not-exist");
    expect(res.status).toBe(404);
    expect((await errorOf(res)).code).toBe("PRODUCT_NOT_FOUND");
  });

  it("a draft by slug → 404", async () => {
    const created = (await (await create(validCreation({ publish: "false" }))).json()) as ProductJson;
    expect((await call(`/api/products/${created.slug}`)).status).toBe(404);
  });

  it("unknown route under /api → 404 JSON", async () => {
    const res = await call("/api/something-else");
    expect(res.status).toBe(404);
    expect((await errorOf(res)).code).toBe("NOT_FOUND");
  });
});

describe("GET /img/:key", () => {
  it("returns the uploaded bytes with content-type and immutable cache", async () => {
    const created = (await (await create(validCreation())).json()) as ProductJson;
    const res = await call(created.images[0]?.url ?? "");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("cache-control")).toContain("immutable");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(PNG_1X1);
  });

  it.each([
    ["png", "image/png"],
    ["jpg", "image/jpeg"],
    ["webp", "image/webp"],
  ])("derives the content-type from the .%s extension, even if R2 has no metadata", async (ext, type) => {
    const key = `01ARZ3NDEKTSV4RRFFQ69G5FAW.${ext}`;
    await bucket().put(key, PNG_1X1);
    const res = await call(`/img/${key}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe(type);
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("content-security-policy")).toContain("default-src 'none'");
  });

  it("ignores a misleading content-type stored in the R2 metadata", async () => {
    const key = "01ARZ3NDEKTSV4RRFFQ69G5FAX.png";
    await bucket().put(key, "<script>alert(1)</script>", { httpMetadata: { contentType: "text/html" } });
    const res = await call(`/img/${key}`);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it.each([
    "/img/does-not-exist.png",
    "/img/01ARZ3NDEKTSV4RRFFQ69G5FAV.png", // valid format, but it doesn't exist
    "/img/01ARZ3NDEKTSV4RRFFQ69G5FAV.gif",
    "/img/..%2Fproductos",
    "/img/..%2F..%2Fapi%2Fproducts",
    "/img/a/b.png",
    "/img/",
  ])("%s → 404", async (path) => {
    expect((await call(path)).status).toBe(404);
  });

  it("a key with '..' or a foreign key doesn't reach existing R2 objects", async () => {
    await bucket().put("secret.txt", "no");
    expect((await call("/img/..%2Fsecret.txt")).status).toBe(404);
    expect((await call("/img/secret.txt")).status).toBe(404);
  });
});

describe("unexpected errors", () => {
  it("an infrastructure exception → 500 INTERNAL without leaking details", async () => {
    const broken = { ...env, DB: undefined as unknown as D1Database };
    const res = await call("/api/products", undefined, broken);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: { code: "INTERNAL" } });
  });
});
