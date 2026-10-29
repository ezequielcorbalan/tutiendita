import { env } from "cloudflare:test";
import {
  DuplicateSlugError,
  isOk,
  money,
  newProduct,
  type Product,
  pause,
  publish,
  withImages,
} from "../../../src/packages/core/index";
import { beforeEach, describe, expect, it } from "vitest";
import { createD1ProductRepository } from "../../../src/packages/infra-cloudflare/d1/product-repository-d1";

const t0 = new Date("2026-10-14T10:00:00.000Z");
const t1 = new Date("2026-10-14T11:00:00.000Z");
const ars = (amount: number) => {
  const r = money(amount, "ARS");
  if (!isOk(r)) throw new Error("fixture");
  return r.value;
};
const product = (id: string, slug: string, now: Date, options: { published?: boolean } = {}): Product => {
  const base = newProduct(
    { name: `Product ${slug}`, price: ars(4500), description: "desc" },
    { id, slug, now },
  );
  if (!isOk(base)) throw new Error("fixture");
  const photos = withImages(base.value, ["a.png", "b.png"], now);
  if (!isOk(photos)) throw new Error("fixture");
  const withPhoto = photos.value;
  if (!options.published) return withPhoto;
  const pub = publish(withPhoto, now);
  if (!isOk(pub)) throw new Error("fixture");
  return pub.value;
};

describe("D1ProductRepository", () => {
  const repo = createD1ProductRepository(env.DB);

  beforeEach(async () => {
    await env.DB.prepare("DELETE FROM imagenes_producto").run();
    await env.DB.prepare("DELETE FROM productos").run();
  });

  it("save and findBySlug return the same product, with images in order and dates intact", async () => {
    const p = product("01ARZ3NDEKTSV4RRFFQ69G5FA1", "mate", t0, { published: true });
    await repo.save(p);
    const read = await repo.findBySlug("mate");
    expect(read).not.toBeNull();
    expect(read).toEqual(p);
    expect(read?.images.map((i) => i.key)).toEqual(["a.png", "b.png"]);
    expect(read?.createdAt).toEqual(t0);
  });

  it("count includes drafts and published products", async () => {
    expect(await repo.count()).toBe(0);
    await repo.save(product("01ARZ3NDEKTSV4RRFFQ69G5FA1", "uno", t0));
    await repo.save(product("01ARZ3NDEKTSV4RRFFQ69G5FA2", "dos", t0, { published: true }));
    expect(await repo.count()).toBe(2);
  });

  it("findById and slugExists", async () => {
    const p = product("01ARZ3NDEKTSV4RRFFQ69G5FA2", "bombilla", t0);
    await repo.save(p);
    expect((await repo.findById(p.id))?.slug).toBe("bombilla");
    expect(await repo.findById("nope")).toBeNull();
    expect(await repo.slugExists("bombilla")).toBe(true);
    expect(await repo.slugExists("other")).toBe(false);
  });

  it("listPublished excludes drafts and paused, sorted by creation descending", async () => {
    await repo.save(product("01ARZ3NDEKTSV4RRFFQ69G5FA3", "old", t0, { published: true }));
    await repo.save(product("01ARZ3NDEKTSV4RRFFQ69G5FA4", "new", t1, { published: true }));
    await repo.save(product("01ARZ3NDEKTSV4RRFFQ69G5FA5", "draft", t1));
    const paused = pause(product("01ARZ3NDEKTSV4RRFFQ69G5FA7", "paused", t1, { published: true }), t1);
    if (!isOk(paused)) throw new Error("fixture");
    await repo.save(paused.value);
    const list = await repo.listPublished();
    expect(list.map((p) => p.slug)).toEqual(["new", "old"]);
  });

  it("listAll includes drafts and paused, with their images, newest to oldest", async () => {
    await repo.save(product("01ARZ3NDEKTSV4RRFFQ69G5FB1", "old", t0, { published: true }));
    await repo.save(product("01ARZ3NDEKTSV4RRFFQ69G5FB2", "draft", t1));
    const paused = pause(product("01ARZ3NDEKTSV4RRFFQ69G5FB3", "paused", t1, { published: true }), t1);
    if (!isOk(paused)) throw new Error("fixture");
    await repo.save(paused.value);
    const list = await repo.listAll();
    expect(list.map((p) => [p.slug, p.status])).toEqual([
      ["draft", "borrador"],
      ["paused", "pausado"],
      ["old", "publicado"],
    ]);
    expect(list[0]?.images.map((i) => i.key)).toEqual(["a.png", "b.png"]);
  });

  it("saving the same id twice updates and replaces images without duplicating", async () => {
    const p = product("01ARZ3NDEKTSV4RRFFQ69G5FA6", "yerba", t0);
    await repo.save(p);
    const replaced = withImages({ ...p, images: [] } as Product, ["c.png"], t1);
    if (!isOk(replaced)) throw new Error("fixture");
    const updated = replaced.value;
    await repo.save(updated);
    const read = await repo.findById(p.id);
    expect(read?.images).toEqual([{ key: "c.png", position: 0 }]);
    expect(read?.version).toBe(updated.version);
    const total = await env.DB.prepare("SELECT COUNT(*) AS n FROM productos").first<{ n: number }>();
    expect(total?.n).toBe(1);
  });

  it("saving another product with a used slug throws DuplicateSlugError and leaves nothing half-done", async () => {
    await repo.save(product("01ARZ3NDEKTSV4RRFFQ69G5FA8", "mate", t0));
    const attempt = repo.save(product("01ARZ3NDEKTSV4RRFFQ69G5FA9", "mate", t1));
    await expect(attempt).rejects.toBeInstanceOf(DuplicateSlugError);
    await expect(attempt).rejects.toMatchObject({ slug: "mate" });
    expect(await repo.findById("01ARZ3NDEKTSV4RRFFQ69G5FA9")).toBeNull();
    const imgs = await env.DB.prepare("SELECT COUNT(*) AS n FROM imagenes_producto").first<{ n: number }>();
    expect(imgs?.n).toBe(2);
  });

  it("remove deletes the product and its images, leaving the others", async () => {
    await repo.save(product("01ARZ3NDEKTSV4RRFFQ69G5FB1", "uno", t0));
    await repo.save(product("01ARZ3NDEKTSV4RRFFQ69G5FB2", "dos", t0));
    await repo.remove("01ARZ3NDEKTSV4RRFFQ69G5FB1");
    expect(await repo.findById("01ARZ3NDEKTSV4RRFFQ69G5FB1")).toBeNull();
    expect(await repo.slugExists("dos")).toBe(true);
    const imgs = await env.DB.prepare("SELECT COUNT(*) AS n FROM imagenes_producto").first<{ n: number }>();
    expect(imgs?.n).toBe(2);
  });
});

describe("D1ProductRepository options", () => {
  const repo = createD1ProductRepository(env.DB);
  const options = [
    {
      id: "o1",
      name: "Relleno",
      values: [
        { id: "v1", label: "Dulce de leche", priceDelta: 0, imageKey: null },
        { id: "v2", label: "Chocolate", priceDelta: 50000, imageKey: null },
      ],
    },
    { id: "o2", name: "Tamaño", values: [{ id: "v3", label: "Grande", priceDelta: 0, imageKey: null }] },
  ];
  const count = async (table: string) =>
    (await env.DB.prepare(`SELECT count(*) AS n FROM ${table}`).all<{ n: number }>()).results[0]?.n;

  beforeEach(async () => {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM productos"),
      env.DB.prepare("DELETE FROM imagenes_producto"),
    ]);
  });

  it("saves the options with their values in order, lists them with the products and replaces them on save", async () => {
    const base = product("01ARZ3NDEKTSV4RRFFQ69G5FO1", "torta", t0, { published: true });
    await repo.save({ ...base, options });
    expect((await repo.findBySlug("torta"))?.options).toEqual(options);
    expect((await repo.listPublished())[0]?.options.map((o) => o.name)).toEqual(["Relleno", "Tamaño"]);
    await repo.save({ ...base, options: [options[1] as (typeof options)[number]] });
    expect((await repo.findById(base.id))?.options.map((o) => o.id)).toEqual(["o2"]);
    expect(await count("valores_opcion")).toBe(1);
    await repo.remove(base.id);
    expect(await count("opciones_producto")).toBe(0);
    expect(await count("valores_opcion")).toBe(0);
  });

  it("saves and reads several images and a value's photo", async () => {
    const base = product("01ARZ3NDEKTSV4RRFFQ69G5FO3", "galeria", t0);
    const photos = withImages(base, ["a.png", "b.png", "c.png"], t0);
    if (!isOk(photos)) throw new Error("fixture");
    const withPhotoOptions = [
      {
        id: "o1",
        name: "Color",
        values: [
          { id: "v1", label: "Rojo", priceDelta: 0, imageKey: "b.png" },
          { id: "v2", label: "Azul", priceDelta: 0, imageKey: null },
        ],
      },
    ];
    await repo.save({ ...photos.value, options: withPhotoOptions });
    const found = await repo.findById(base.id);
    expect(found?.images.map((i) => i.key)).toEqual(["a.png", "b.png", "c.png"]);
    expect(found?.options).toEqual(withPhotoOptions);
  });

  it("saves 5 options with 30 values each (more than 100 bound parameters)", async () => {
    const base = product("01ARZ3NDEKTSV4RRFFQ69G5FO4", "muchos-valores", t0);
    const many = Array.from({ length: 5 }, (_, o) => ({
      id: `o${o}`,
      name: `Option ${o}`,
      values: Array.from({ length: 30 }, (_, v) => ({
        id: `o${o}v${v}`,
        label: `Value ${v}`,
        priceDelta: v,
        imageKey: v % 2 === 0 ? "a.png" : null,
      })),
    }));
    await repo.save({ ...base, options: many });
    expect((await repo.findById(base.id))?.options).toEqual(many);
  });

  it("a product without options reads back with an empty list", async () => {
    const base = product("01ARZ3NDEKTSV4RRFFQ69G5FO2", "sin-opciones", t0);
    await repo.save(base);
    expect((await repo.findById(base.id))?.options).toEqual([]);
  });
});
