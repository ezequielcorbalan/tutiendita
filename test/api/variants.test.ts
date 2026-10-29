import { beforeEach, describe, expect, it } from "vitest";
import type { CategoryJson, ProductJson } from "../../src/lib/product-json";
import { BASE, call, clearD1, clearR2, create, creationHeaders, form, validCreation } from "../helpers";

const FILLING = [
  {
    name: "Relleno",
    values: [
      { label: "Dulce de leche", price_delta: 0 },
      { label: "Chocolate", price_delta: 50000 },
    ],
  },
];

async function json(method: string, path: string, body?: unknown, signedIn = true) {
  const headers = signedIn ? await creationHeaders() : new Headers({ origin: BASE });
  headers.set("content-type", "application/json");
  return call(path, { method, headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
}

const codeOf = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code;

beforeEach(async () => {
  await clearD1();
  await clearR2();
});

describe("/api/categories", () => {
  it("creates, lists, updates and deletes (only without products), with variant templates", async () => {
    const res = await json("POST", "/api/categories", { name: "Tortas", option_templates: FILLING });
    expect(res.status).toBe(201);
    const cat = (await res.json()) as CategoryJson;
    expect(cat).toMatchObject({ name: "Tortas", slug: "tortas" });
    expect(cat.optionTemplates[0]?.values[1]).toEqual({ label: "Chocolate", priceDelta: 50000 });

    const list = (await (await call("/api/categories")).json()) as CategoryJson[];
    expect(list.map((c) => c.name)).toEqual(["Tortas"]);

    const updated = await json("PUT", `/api/categories/${cat.id}`, {
      name: "Tortas y postres",
      option_templates: [],
    });
    expect(((await updated.json()) as CategoryJson).optionTemplates).toEqual([]);

    await create(validCreation({ category_id: cat.id }));
    const blocked = await json("DELETE", `/api/categories/${cat.id}`);
    expect(blocked.status).toBe(422);
    expect(await codeOf(blocked)).toBe("CATEGORY_HAS_PRODUCTS");
    expect((await json("DELETE", "/api/categories/nope")).status).toBe(404);
  });

  it("changes need a session; bad templates are rejected", async () => {
    expect((await json("POST", "/api/categories", { name: "Tortas" }, false)).status).toBe(401);
    const bad = await json("POST", "/api/categories", {
      name: "Tortas",
      option_templates: [{ name: "Relleno", values: [] }],
    });
    expect(bad.status).toBe(422);
    expect(await codeOf(bad)).toBe("INVALID_OPTIONS");
    expect((await json("POST", "/api/categories", { name: " " })).status).toBe(422);
  });
});

describe("products with variants", () => {
  it("a product created in a category takes its templates; explicit options win", async () => {
    const cat = (await (
      await json("POST", "/api/categories", { name: "Tortas", option_templates: FILLING })
    ).json()) as CategoryJson;
    const fromCategory = (await (await create(validCreation({ category_id: cat.id }))).json()) as ProductJson;
    expect(fromCategory.options.map((o) => o.name)).toEqual(["Relleno"]);
    expect(fromCategory.options[0]?.values.map((v) => v.label)).toEqual(["Dulce de leche", "Chocolate"]);

    const own = JSON.stringify([{ name: "Tamaño", values: [{ label: "Grande", price_delta: 100000 }] }]);
    const explicit = (await (
      await create(validCreation({ name: "Otra", category_id: cat.id, options: own }))
    ).json()) as ProductJson;
    expect(explicit.options.map((o) => o.name)).toEqual(["Tamaño"]);
  });

  it("PUT replaces the options keeping the ids sent; without options it leaves them as they were", async () => {
    const created = (await (
      await create(validCreation({ options: JSON.stringify(FILLING) }))
    ).json()) as ProductJson;
    const [option] = created.options;
    if (!option) throw new Error("fixture");
    const put = async (extra: Record<string, string>) =>
      call(`/api/products/${created.id}`, {
        method: "PUT",
        headers: await creationHeaders(),
        body: form(validCreation({ status: "publicado", ...extra })),
      });
    const kept = JSON.stringify([
      {
        id: option.id,
        name: "Relleno",
        values: [{ id: option.values[0]?.id, label: "Dulce de leche", price_delta: 0 }],
      },
    ]);
    const r = (await (await put({ options: kept })).json()) as ProductJson;
    expect(r.options[0]?.id).toBe(option.id);
    expect(r.options[0]?.values.map((v) => v.id)).toEqual([option.values[0]?.id]);
    const untouched = (await (await put({})).json()) as ProductJson;
    expect(untouched.options).toEqual(r.options);
    const bad = await put({ options: "not json" });
    expect(bad.status).toBe(422);
  });

  it("the quote prices the chosen variant and names it; an incomplete selection is rejected", async () => {
    const p = (await (
      await create(
        validCreation({ name: "Torta", price_amount: "2800000", options: JSON.stringify(FILLING) }),
      )
    ).json()) as ProductJson;
    const [option] = p.options;
    const chocolate = option?.values[1];
    if (!option || !chocolate) throw new Error("fixture");
    const quote = (items: unknown) =>
      call("/api/orders/quote", {
        method: "POST",
        body: JSON.stringify({ items }),
        headers: { "content-type": "application/json", origin: BASE },
      });
    const ok = await quote([{ product_id: p.id, quantity: 2, selection: { [option.id]: chocolate.id } }]);
    expect(ok.status).toBe(200);
    const body = (await ok.json()) as {
      items: { variant: string | null; unit_price: { amount: number } }[];
      total: { amount: number };
    };
    expect(body.items[0]).toMatchObject({ variant: "Relleno: Chocolate", unit_price: { amount: 2850000 } });
    expect(body.total.amount).toBe(5700000);
    const missing = await quote([{ product_id: p.id, quantity: 1 }]);
    expect(missing.status).toBe(422);
    expect(await codeOf(missing)).toBe("INVALID_SELECTION");
  });
});
