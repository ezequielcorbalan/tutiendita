import { beforeEach, describe, expect, it } from "vitest";
import { createCategory } from "../../../src/packages/core/domain/category";
import { money } from "../../../src/packages/core/domain/money";
import { isOk } from "../../../src/packages/core/domain/result";
import { ImageQuotaError } from "../../../src/packages/core/ports/image-storage";
import { createProduct } from "../../../src/packages/core/use-cases/create-product";
import { deleteProduct, updateProduct } from "../../../src/packages/core/use-cases/manage-product";
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

let repo: InMemoryProductRepository;
let categories: InMemoryCategoryRepository;
let images: InMemoryImageStorage;
let update: ReturnType<typeof updateProduct>;
const clock = new FixedClock(new Date("2026-10-15T12:00:00Z"));

async function seed(publish = true) {
  const r = await createProduct({ repo, categories, images, clock, ids: new SequentialIdGenerator() })({
    name: "Torta de chocolate",
    price: ars(2800000),
    gallery: [{ upload: 0 }],
    uploads: [png],
    publish,
  });
  if (!isOk(r)) throw new Error("fixture");
  return r.value;
}

const input = (over: Partial<Parameters<typeof update>[1]> = {}) => ({
  name: "Torta de chocolate",
  description: "",
  price: ars(2800000),
  categoryId: null,
  status: "publicado" as const,
  options: [],
  ...over,
});

beforeEach(() => {
  repo = new InMemoryProductRepository();
  categories = new InMemoryCategoryRepository();
  images = new InMemoryImageStorage();
  update = updateProduct({ repo, categories, images, clock, ids: new SequentialIdGenerator() });
});

describe("updateProduct", () => {
  it("edits name, description, price and category; the slug stays and it's one more version", async () => {
    const p = await seed();
    const c = createCategory({ name: "Tortas" }, { id: "c1", slug: "tortas" });
    if (!isOk(c)) throw new Error("fixture");
    await categories.save(c.value);
    const r = await update(
      p.id,
      input({
        name: "Torta húmeda",
        description: "Con dulce de leche",
        price: ars(3000000),
        categoryId: "c1",
      }),
    );
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;
    expect(r.value).toMatchObject({
      name: "Torta húmeda",
      description: "Con dulce de leche",
      categoryId: "c1",
      slug: p.slug,
      version: p.version + 1,
    });
    expect(repo.byId.get(p.id)?.price.amount).toBe(3000000);
  });

  it("a new photo replaces the old one and the old file is deleted", async () => {
    const p = await seed();
    const old = p.images[0]?.key ?? "";
    const r = await update(p.id, input({ gallery: [{ upload: 0 }], uploads: [png] }));
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;
    expect(r.value.images).toHaveLength(1);
    expect(r.value.images[0]?.key).not.toBe(old);
    expect(images.files.has(old)).toBe(false);
  });

  it("pauses, goes back to draft and publishes again", async () => {
    const p = await seed();
    for (const status of ["pausado", "borrador", "publicado"] as const) {
      const r = await update(p.id, input({ status }));
      expect(isOk(r) && r.value.status).toBe(status);
    }
  });

  it("publishing a draft without a photo fails and nothing is saved", async () => {
    const r0 = await createProduct({ repo, categories, images, clock, ids: new SequentialIdGenerator() })({
      name: "Budín",
      price: ars(450050),
    });
    if (!isOk(r0)) throw new Error("fixture");
    const r = await update(r0.value.id, input({ name: "Budín", status: "publicado" }));
    expect(isOk(r) ? null : r.error.code).toBe("NO_IMAGE");
    expect(repo.byId.get(r0.value.id)?.status).toBe("borrador");
  });

  it("a published product can't drop its price to zero; an invalid photo is rejected before uploading", async () => {
    const p = await seed();
    const zero = await update(p.id, input({ price: ars(0) }));
    expect(isOk(zero) ? null : zero.error.code).toBe("INVALID_PRICE");
    const before = images.files.size;
    const bad = await update(
      p.id,
      input({
        gallery: [{ upload: 0 }],
        uploads: [{ bytes: new Uint8Array([1, 2, 3]), mimeType: "image/png" }],
      }),
    );
    expect(isOk(bad) ? null : bad.error.code).toBe("INVALID_IMAGE");
    expect(images.files.size).toBe(before);
  });

  it("IMAGE_QUOTA_REACHED when images.save throws ImageQuotaError, and the product is unchanged", async () => {
    const p = await seed();
    const files = images.files.size;
    images.save = async () => {
      throw new ImageQuotaError(200);
    };
    const r = await update(p.id, input({ name: "Other name", gallery: [{ upload: 0 }], uploads: [png] }));
    expect(isOk(r) ? null : r.error.code).toBe("IMAGE_QUOTA_REACHED");
    expect(isOk(r) ? null : r.error.details).toEqual({ max: 200 });
    expect(repo.byId.get(p.id)).toEqual(p);
    expect(images.files.size).toBe(files);
  });

  it("unknown product or category gives a clear error", async () => {
    const missing = await update("nope", input());
    expect(isOk(missing) ? null : missing.error.code).toBe("PRODUCT_NOT_FOUND");
    const p = await seed();
    const cat = await update(p.id, input({ categoryId: "nope" }));
    expect(isOk(cat) ? null : cat.error.code).toBe("CATEGORY_NOT_FOUND");
  });
});

describe("deleteProduct", () => {
  it("deletes the product and its photos", async () => {
    const p = await seed();
    const r = await deleteProduct({ repo, images })(p.id);
    expect(isOk(r)).toBe(true);
    expect(repo.byId.has(p.id)).toBe(false);
    expect(images.files.size).toBe(0);
    const again = await deleteProduct({ repo, images })(p.id);
    expect(isOk(again) ? null : again.error.code).toBe("PRODUCT_NOT_FOUND");
  });
});
