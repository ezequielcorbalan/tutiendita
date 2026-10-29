import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import type { ProductJson } from "../../src/lib/product-json";
import {
  BASE,
  bucket,
  call,
  clearD1,
  clearR2,
  create,
  creationHeaders,
  form,
  validCreation,
} from "../helpers";

type ErrorBody = { error: { code: string } };
const codeOf = async (res: Response) => ((await res.json()) as ErrorBody).error.code;
const r2Objects = async () => (await bucket().list()).objects.map((o) => o.key);
const PNG_2 = Uint8Array.from(
  atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="),
  (c) => c.charCodeAt(0),
);

async function seedCategory(id = "c1", name = "Tortas", slug = "tortas") {
  await env.DB.prepare("INSERT INTO categorias (id, nombre, slug) VALUES (?, ?, ?)")
    .bind(id, name, slug)
    .run();
}

const update = async (id: string, fields: Parameters<typeof form>[0], headers?: Headers) =>
  call(`/api/products/${id}`, {
    method: "PUT",
    body: form(fields),
    headers: headers ?? (await creationHeaders()),
  });

const edition = (extra: Parameters<typeof form>[0] = {}) => ({
  name: "Dulce de leche casero",
  description: "Nueva receta",
  price_amount: "5200",
  price_currency: "ARS",
  status: "publicado",
  category_id: "",
  ...extra,
});

beforeEach(async () => {
  await clearD1();
  await clearR2();
});

describe("creating with a category", () => {
  it("saves the chosen category; an unknown one is rejected", async () => {
    await seedCategory();
    const ok = await create(validCreation({ category_id: "c1" }));
    expect(((await ok.json()) as ProductJson).categoryId).toBe("c1");
    const bad = await create(validCreation({ category_id: "nope" }));
    expect(await codeOf(bad)).toBe("CATEGORY_NOT_FOUND");
  });
});

describe("PUT /api/products/:id", () => {
  it("edits the product keeping its slug, and a new photo replaces the old one in R2", async () => {
    await seedCategory();
    const p = (await (await create(validCreation())).json()) as ProductJson;
    const res = await update(
      p.id,
      edition({ category_id: "c1", image: { bytes: PNG_2, type: "image/png", name: "nueva.png" } }),
    );
    expect(res.status).toBe(200);
    const edited = (await res.json()) as ProductJson;
    expect(edited).toMatchObject({
      name: "Dulce de leche casero",
      description: "Nueva receta",
      slug: p.slug,
      categoryId: "c1",
    });
    expect(edited.price.amount).toBe(5200);
    expect(await r2Objects()).toEqual([edited.images[0]?.key]);
  });

  it("pauses it: it leaves the public list", async () => {
    const p = (await (await create(validCreation())).json()) as ProductJson;
    expect((await update(p.id, edition({ status: "pausado" }))).status).toBe(200);
    expect(await (await call("/api/products")).json()).toEqual([]);
  });

  it("without a session 401, from another origin 403, unknown id 404, invalid status 422", async () => {
    const p = (await (await create(validCreation())).json()) as ProductJson;
    const noSession = await call(`/api/products/${p.id}`, {
      method: "PUT",
      body: form(edition()),
      headers: { origin: BASE },
    });
    expect(noSession.status).toBe(401);
    const headers = await creationHeaders();
    headers.set("origin", "https://otro.example");
    expect((await update(p.id, edition(), headers)).status).toBe(403);
    expect((await update("nope", edition())).status).toBe(404);
    expect((await update(p.id, edition({ status: "eliminado" }))).status).toBe(422);
  });
});

describe("DELETE /api/products/:id", () => {
  it("deletes the product and its photo; without a session 401", async () => {
    const p = (await (await create(validCreation())).json()) as ProductJson;
    const noSession = await call(`/api/products/${p.id}`, { method: "DELETE", headers: { origin: BASE } });
    expect(noSession.status).toBe(401);
    const res = await call(`/api/products/${p.id}`, { method: "DELETE", headers: await creationHeaders() });
    expect(res.status).toBe(200);
    expect(await r2Objects()).toEqual([]);
    expect((await call(`/api/products/${p.slug}`)).status).toBe(404);
    const again = await call(`/api/products/${p.id}`, { method: "DELETE", headers: await creationHeaders() });
    expect(again.status).toBe(404);
  });
});
