import { beforeEach, describe, expect, it } from "vitest";
import { money } from "../../../src/packages/core/domain/money";
import type { Product } from "../../../src/packages/core/domain/product";
import { isOk } from "../../../src/packages/core/domain/result";
import { ImageQuotaError } from "../../../src/packages/core/ports/image-storage";
import { type CreateProductInput, createProduct } from "../../../src/packages/core/use-cases/create-product";
import { type UpdateProductInput, updateProduct } from "../../../src/packages/core/use-cases/manage-product";
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

let repo: InMemoryProductRepository;
let categories: InMemoryCategoryRepository;
let images: InMemoryImageStorage;
const clock = new FixedClock(new Date("2026-10-19T12:00:00Z"));
const deps = (pro: boolean) => ({ repo, categories, images, clock, ids: new SequentialIdGenerator(), pro });
const create = (e: CreateProductInput, pro = true) => createProduct(deps(pro))(e);
const update = (id: string, e: Partial<UpdateProductInput>, pro = true) =>
  updateProduct(deps(pro))(id, {
    name: "Remera",
    description: "",
    price: ars(1000000),
    categoryId: null,
    status: "publicado",
    ...e,
  });

/** A published PRO product with `n` photos; value "red" points to the second one when n > 1. */
async function seed(n: number): Promise<Product> {
  const r = await create({
    name: "Remera",
    price: ars(1000000),
    publish: true,
    gallery: Array.from({ length: n }, (_, i) => ({ upload: i })),
    uploads: Array.from({ length: n }, () => png),
    options: [
      {
        id: "color",
        name: "Color",
        values: [
          { id: "red", label: "Rojo", priceDelta: 0, imageRef: n > 1 ? { upload: 1 } : null },
          { id: "blue", label: "Azul", priceDelta: 0 },
        ],
      },
    ],
  });
  if (!isOk(r)) throw new Error(`fixture: ${r.error.code}`);
  return r.value;
}
const valueKey = (p: Product | undefined, id: string) =>
  p?.options.flatMap((o) => o.values).find((v) => v.id === id)?.imageKey;
const keys = (p: Product | undefined) => p?.images.map((i) => i.key);

beforeEach(() => {
  repo = new InMemoryProductRepository();
  categories = new InMemoryCategoryRepository();
  images = new InMemoryImageStorage();
});

describe("product gallery", () => {
  it("pro: creates with 3 uploads in order and a value pointing to upload 1", async () => {
    const r = await create({
      name: "Remera",
      price: ars(1000000),
      gallery: [{ upload: 2 }, { upload: 0 }, { upload: 1 }],
      uploads: [png, png, png],
      options: [
        {
          id: "",
          name: "Color",
          values: [{ id: "", label: "Rojo", priceDelta: 0, imageRef: { upload: 1 } }],
        },
      ],
    });
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;
    // Uploads happen in index order: img-1 is upload 0, img-2 upload 1, img-3 upload 2.
    expect(keys(r.value)).toEqual(["img-3", "img-1", "img-2"]);
    expect(r.value.images.map((i) => i.position)).toEqual([0, 1, 2]);
    expect(r.value.options[0]?.values[0]?.imageKey).toBe("img-2");
    expect(repo.byId.get(r.value.id)).toEqual(r.value);
  });

  it("pro: update keeps, reorders, adds and removes photos; removed files are deleted after saving", async () => {
    const p = await seed(3); // img-1, img-2 (red), img-3
    const r = await update(p.id, {
      gallery: [{ key: "img-3" }, { upload: 0 }, { key: "img-1" }],
      uploads: [png],
    });
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;
    expect(keys(r.value)).toEqual(["img-3", "img-4", "img-1"]);
    expect(valueKey(r.value, "red")).toBeNull(); // its photo left the gallery
    expect(images.files.has("img-2")).toBe(false);
    expect([...images.files.keys()].sort()).toEqual(["img-1", "img-3", "img-4"]);
    expect(r.value.version).toBe(p.version + 1);
  });

  it("rejects a kept key the product doesn't have", async () => {
    const other = await seed(1);
    const p = await seed(2);
    const before = images.files.size;
    for (const key of [other.images[0]?.key ?? "", "missing"]) {
      const r = await update(p.id, { gallery: [{ key }, { upload: 0 }], uploads: [png] });
      expect(codeOf(r)).toBe("INVALID_IMAGE");
    }
    const created = await create({ name: "Otra", price: ars(1), gallery: [{ key: "img-1" }] });
    expect(codeOf(created)).toBe("INVALID_IMAGE");
    expect(images.files.size).toBe(before);
    expect(repo.byId.get(p.id)).toEqual(p);
  });

  it("rejects bad upload references before uploading", async () => {
    const p = await seed(1);
    const before = images.files.size;
    const cases: Partial<UpdateProductInput>[] = [
      { gallery: [{ upload: 1 }], uploads: [png] }, // out of range
      { gallery: [{ upload: -1 }, { upload: 0 }], uploads: [png] },
      { gallery: [{ upload: 0 }, { upload: 0 }], uploads: [png] }, // twice
      { gallery: [{ upload: 0 }], uploads: [png, png] }, // upload 1 unused
      { uploads: [png] }, // no gallery: nobody references it
      { gallery: [{ key: p.images[0]?.key ?? "" }, { key: p.images[0]?.key ?? "" }] }, // repeated key
      {
        gallery: [{ upload: 0 }],
        uploads: [png],
        options: [
          {
            id: "color",
            name: "Color",
            values: [{ id: "red", label: "Rojo", priceDelta: 0, imageRef: { upload: 3 } }],
          },
        ],
      },
      { gallery: [{ upload: 0 }], uploads: [{ bytes: new Uint8Array([1, 2, 3]), mimeType: "image/png" }] },
    ];
    for (const c of cases) expect(codeOf(await update(p.id, c))).toBe("INVALID_IMAGE");
    expect(images.files.size).toBe(before);
  });

  it("caps the gallery at 8", async () => {
    const nine = {
      gallery: Array.from({ length: 9 }, (_, i) => ({ upload: i })),
      uploads: Array.from({ length: 9 }, () => png),
    };
    expect(codeOf(await create({ name: "Nueve", price: ars(1), ...nine }))).toBe("TOO_MANY_IMAGES");
    const p = await seed(8);
    const before = images.files.size;
    const r = await update(p.id, {
      gallery: [...p.images.map((i) => ({ key: i.key })), { upload: 0 }],
      uploads: [png],
    });
    expect(codeOf(r)).toBe("TOO_MANY_IMAGES");
    expect(images.files.size).toBe(before);
  });

  it("basic: a second photo or a new value photo is PRO_REQUIRED", async () => {
    const p = await seed(1);
    const before = images.files.size;
    const second = await update(p.id, { gallery: [{ key: "img-1" }, { upload: 0 }], uploads: [png] }, false);
    expect(codeOf(second)).toBe("PRO_REQUIRED");
    const valuePhoto = await update(
      p.id,
      {
        options: [
          {
            id: "color",
            name: "Color",
            values: [{ id: "red", label: "Rojo", priceDelta: 0, imageRef: { key: "img-1" } }],
          },
        ],
      },
      false,
    );
    expect(codeOf(valuePhoto)).toBe("PRO_REQUIRED");
    const two = await create(
      { name: "Dos", price: ars(1), gallery: [{ upload: 0 }, { upload: 1 }], uploads: [png, png] },
      false,
    );
    expect(codeOf(two)).toBe("PRO_REQUIRED");
    expect(images.files.size).toBe(before);
    expect(repo.byId.get(p.id)).toEqual(p);
  });

  it("basic: replacing the only photo still works", async () => {
    const created = await create(
      { name: "Una", price: ars(1), publish: true, gallery: [{ upload: 0 }], uploads: [png] },
      false,
    );
    if (!isOk(created)) throw new Error("fixture");
    const r = await update(
      created.value.id,
      { name: "Una", gallery: [{ upload: 0 }], uploads: [png] },
      false,
    );
    expect(isOk(r)).toBe(true);
    expect(keys(isOk(r) ? r.value : undefined)).toEqual(["img-2"]);
    expect(images.files.has("img-1")).toBe(false);
  });

  it("basic save without gallery or imageRef keeps everything", async () => {
    const p = await seed(5);
    const r = await update(
      p.id,
      {
        name: "Remera lisa",
        options: [
          {
            id: "color",
            name: "Color",
            values: [
              { id: "red", label: "Rojo", priceDelta: 0 },
              { id: "blue", label: "Azul", priceDelta: 0 },
            ],
          },
        ],
      },
      false,
    );
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;
    expect(r.value.name).toBe("Remera lisa");
    expect(keys(r.value)).toEqual(keys(p));
    expect(valueKey(r.value, "red")).toBe("img-2");
    expect(images.files.size).toBe(5);
  });

  it("imageRef null removes a value's photo; omitted keeps it", async () => {
    const p = await seed(2);
    const redOnBlue = await update(p.id, {
      options: [
        {
          id: "color",
          name: "Color",
          values: [
            { id: "red", label: "Rojo", priceDelta: 0 },
            { id: "blue", label: "Azul", priceDelta: 0, imageRef: { key: "img-1" } },
            { id: "", label: "Verde", priceDelta: 0 },
          ],
        },
      ],
    });
    expect(isOk(redOnBlue)).toBe(true);
    if (!isOk(redOnBlue)) return;
    expect(valueKey(redOnBlue.value, "red")).toBe("img-2");
    expect(valueKey(redOnBlue.value, "blue")).toBe("img-1");
    expect(redOnBlue.value.options[0]?.values[2]?.imageKey).toBeNull();
    const cleared = await update(p.id, {
      options: [
        { id: "color", name: "Color", values: [{ id: "red", label: "Rojo", priceDelta: 0, imageRef: null }] },
      ],
    });
    expect(isOk(cleared) && valueKey(cleared.value, "red")).toBeNull();
    // Basic mode may remove a value photo: nothing new is added.
    const p2 = await seed(2);
    const basic = await update(
      p2.id,
      {
        options: [
          {
            id: "color",
            name: "Color",
            values: [{ id: "red", label: "Rojo", priceDelta: 0, imageRef: null }],
          },
        ],
      },
      false,
    );
    expect(isOk(basic)).toBe(true);
    // A value photo that isn't in the final gallery is rejected by the domain.
    const outside = await update(p2.id, {
      gallery: [{ key: "img-3" }],
      options: [
        {
          id: "color",
          name: "Color",
          values: [{ id: "red", label: "Rojo", priceDelta: 0, imageRef: { key: "img-4" } }],
        },
      ],
    });
    expect(codeOf(outside)).toBe("INVALID_OPTIONS");
  });

  it("removing every photo while moving to draft or paused works; staying published needs a photo", async () => {
    for (const status of ["borrador", "pausado"] as const) {
      const p = await seed(2);
      const r = await update(p.id, { status, gallery: [] });
      expect(isOk(r)).toBe(true);
      expect(isOk(r) && [r.value.status, r.value.images.length]).toEqual([status, 0]);
      expect(images.files.has(p.images[0]?.key ?? "")).toBe(false);
    }
    const p = await seed(2);
    const r = await update(p.id, { status: "publicado", gallery: [] });
    expect(codeOf(r)).toBe("NO_IMAGE");
    expect(repo.byId.get(p.id)).toEqual(p);
  });

  it("removes uploaded files when a later step fails", async () => {
    const p = await seed(1);
    const before = [...images.files.keys()];
    // Quota reached on the 2nd upload: the 1st is removed.
    const save = images.save.bind(images);
    let calls = 0;
    images.save = async (bytes, mimeType) => {
      calls += 1;
      if (calls === 2) throw new ImageQuotaError(200);
      return save(bytes, mimeType);
    };
    const quota = await update(p.id, { gallery: [{ upload: 0 }, { upload: 1 }], uploads: [png, png] });
    expect(codeOf(quota)).toBe("IMAGE_QUOTA_REACHED");
    expect([...images.files.keys()]).toEqual(before);
    // A storage error on the 2nd upload: the 1st is removed and the error propagates.
    calls = 0;
    const boom = new Error("R2 down");
    images.save = async (bytes, mimeType) => {
      calls += 1;
      if (calls === 2) throw boom;
      return save(bytes, mimeType);
    };
    await expect(update(p.id, { gallery: [{ upload: 0 }, { upload: 1 }], uploads: [png, png] })).rejects.toBe(
      boom,
    );
    expect([...images.files.keys()]).toEqual(before);
    // Saving fails: every upload of the call is removed.
    images.save = save;
    const d1 = new Error("D1 down");
    repo.save = async () => {
      throw d1;
    };
    await expect(update(p.id, { gallery: [{ upload: 0 }, { upload: 1 }], uploads: [png, png] })).rejects.toBe(
      d1,
    );
    await expect(
      create({ name: "Falla", price: ars(1), gallery: [{ upload: 0 }, { upload: 1 }], uploads: [png, png] }),
    ).rejects.toBe(d1);
    expect([...images.files.keys()]).toEqual(before);
  });
});
