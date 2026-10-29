import { beforeEach, describe, expect, it } from "vitest";
import { money } from "../../../src/packages/core/domain/money";
import type { OptionTemplate, ProductOption } from "../../../src/packages/core/domain/options";
import { isOk } from "../../../src/packages/core/domain/result";
import { createProduct } from "../../../src/packages/core/use-cases/create-product";
import { addCategory, deleteCategory, updateCategory } from "../../../src/packages/core/use-cases/manage-category";
import { updateProduct } from "../../../src/packages/core/use-cases/manage-product";
import { quoteOrder } from "../../../src/packages/core/use-cases/quote-order";
import {
  FixedClock,
  InMemoryCategoryRepository,
  InMemoryImageStorage,
  InMemoryProductRepository,
  SequentialIdGenerator,
} from "./doubles/in-memory";

const ars = (amount: number) => {
  const r = money(amount, "ARS");
  if (!isOk(r)) throw new Error("fixture");
  return r.value;
};
const png = {
  bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]),
  mimeType: "image/png",
};
const codeOf = (r: { ok: boolean; error?: { code: string } }) => (r.ok ? null : r.error?.code);
const TEMPLATES: OptionTemplate[] = [
  {
    name: "Relleno",
    values: [
      { label: "Dulce de leche", priceDelta: 0 },
      { label: "Chocolate", priceDelta: 50000 },
    ],
  },
];

let repo: InMemoryProductRepository;
let categories: InMemoryCategoryRepository;
let images: InMemoryImageStorage;
const clock = new FixedClock(new Date("2026-10-15T12:00:00Z"));
let ids: SequentialIdGenerator;
const deps = () => ({ repo, categories, images, clock, ids });

beforeEach(() => {
  repo = new InMemoryProductRepository();
  categories = new InMemoryCategoryRepository();
  categories.products = repo;
  images = new InMemoryImageStorage();
  ids = new SequentialIdGenerator();
});

describe("categories", () => {
  it("creates with a unique slug and templates, updates and deletes only when unused", async () => {
    const create = addCategory(deps());
    const a = await create({ name: "Tortas", optionTemplates: TEMPLATES });
    const b = await create({ name: "Tortas", optionTemplates: [] });
    expect(isOk(a) && a.value.slug).toBe("tortas");
    expect(isOk(b) && b.value.slug).toBe("tortas-2");
    expect(isOk(a) && a.value.optionTemplates[0]?.name).toBe("Relleno");
    if (!isOk(a)) return;

    const renamed = await updateCategory(deps())(a.value.id, {
      name: "Tortas y postres",
      optionTemplates: [],
    });
    expect(isOk(renamed) && renamed.value).toMatchObject({
      slug: "tortas",
      name: "Tortas y postres",
      optionTemplates: [],
    });
    expect(codeOf(await updateCategory(deps())("nope", { name: "x", optionTemplates: [] }))).toBe(
      "CATEGORY_NOT_FOUND",
    );

    await createProduct(deps())({ name: "Torta", price: ars(100), categoryId: a.value.id });
    expect(codeOf(await deleteCategory(deps())(a.value.id))).toBe("CATEGORY_HAS_PRODUCTS");
    if (isOk(b)) expect(isOk(await deleteCategory(deps())(b.value.id))).toBe(true);
  });
});

describe("product options", () => {
  it("a product created in a category copies its templates as options with fresh ids", async () => {
    const cat = await addCategory(deps())({ name: "Tortas", optionTemplates: TEMPLATES });
    if (!isOk(cat)) throw new Error("fixture");
    const r = await createProduct(deps())({ name: "Torta", price: ars(2800000), categoryId: cat.value.id });
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;
    expect(r.value.options).toHaveLength(1);
    expect(r.value.options[0]?.values.map((v) => v.label)).toEqual(["Dulce de leche", "Chocolate"]);
    expect(r.value.options[0]?.id).toMatch(/^id-/);
  });

  it("explicit options win over the templates, and new ones without id get one", async () => {
    const cat = await addCategory(deps())({ name: "Tortas", optionTemplates: TEMPLATES });
    if (!isOk(cat)) throw new Error("fixture");
    const own: ProductOption[] = [
      { id: "", name: "Tamaño", values: [{ id: "", label: "Grande", priceDelta: 0, imageKey: null }] },
    ];
    const r = await createProduct(deps())({
      name: "Torta",
      price: ars(100),
      categoryId: cat.value.id,
      options: own,
    });
    expect(isOk(r) && r.value.options.map((o) => o.name)).toEqual(["Tamaño"]);
    expect(isOk(r) && r.value.options[0]?.values[0]?.id).toMatch(/^id-/);
    const none = await createProduct(deps())({
      name: "Otra",
      price: ars(100),
      categoryId: cat.value.id,
      options: [],
    });
    expect(isOk(none) && none.value.options).toEqual([]);
  });

  it("updateProduct replaces the options keeping the ids it receives", async () => {
    const created = await createProduct(deps())({
      name: "Maceta",
      price: ars(450000),
      gallery: [{ upload: 0 }],
      uploads: [png],
      publish: true,
    });
    if (!isOk(created)) throw new Error("fixture");
    const r = await updateProduct(deps())(created.value.id, {
      name: "Maceta",
      description: "",
      price: ars(450000),
      categoryId: null,
      status: "publicado",
      options: [
        {
          id: "keep",
          name: "Tamaño",
          values: [
            { id: "small", label: "Chica", priceDelta: -100000 },
            { id: "", label: "Grande", priceDelta: 200000 },
          ],
        },
      ],
    });
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;
    expect(r.value.options[0]?.id).toBe("keep");
    expect(r.value.options[0]?.values.map((v) => v.id)).toEqual(["small", expect.stringMatching(/^id-/)]);
  });
});

describe("quoteOrder with a selection", () => {
  it("prices the chosen values and names the variant; an incomplete selection is rejected", async () => {
    const options: ProductOption[] = [
      {
        id: "o1",
        name: "Relleno",
        values: [
          { id: "v1", label: "Dulce de leche", priceDelta: 0, imageKey: null },
          { id: "v2", label: "Chocolate", priceDelta: 50000, imageKey: null },
        ],
      },
    ];
    const created = await createProduct(deps())({
      name: "Torta",
      price: ars(2800000),
      gallery: [{ upload: 0 }],
      uploads: [png],
      publish: true,
      options,
    });
    if (!isOk(created)) throw new Error("fixture");
    const quote = quoteOrder({ repo });
    const r = await quote([{ productId: created.value.id, quantity: 2, selection: { o1: "v2" } }]);
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;
    expect(r.value.items[0]).toMatchObject({
      name: "Torta",
      variant: "Relleno: Chocolate",
      unitPrice: ars(2850000),
    });
    expect(r.value.total).toEqual(ars(5700000));
    expect(codeOf(await quote([{ productId: created.value.id, quantity: 1 }]))).toBe("INVALID_SELECTION");
  });
});
