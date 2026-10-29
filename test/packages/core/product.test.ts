import { describe, expect, it } from "vitest";
import { money } from "../../../src/packages/core/domain/money";
import {
  type CreationContext,
  edit,
  newProduct,
  type Product,
  pause,
  publish,
  withImages,
} from "../../../src/packages/core/domain/product";
import { isErr, isOk } from "../../../src/packages/core/domain/result";

const now = new Date("2026-10-14T12:00:00Z");
const after = new Date("2026-10-14T13:00:00Z");
const ctx: CreationContext = { id: "01ARZ3NDEKTSV4RRFFQ69G5FAV", slug: "mate-imperial", now };
const price = (amount: number) => {
  const r = money(amount, "ARS");
  if (!isOk(r)) throw new Error("fixture");
  return r.value;
};
const draft = (): Product => {
  const r = newProduct({ name: "Mate imperial", price: price(4500) }, ctx);
  if (!isOk(r)) throw new Error("fixture");
  return r.value;
};

const photo = (p: Product, keys: string[], at = now): Product => {
  const r = withImages(p, keys, at);
  if (!isOk(r)) throw new Error("fixture");
  return r.value;
};

describe("newProduct", () => {
  it("creates a draft with default values", () => {
    const r = newProduct({ name: "Mate imperial", price: price(4500) }, ctx);
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;
    expect(r.value).toMatchObject({
      id: ctx.id,
      slug: "mate-imperial",
      status: "borrador",
      version: 1,
      stock: null,
      federate: false,
      categoryId: null,
      description: "",
      images: [],
    });
    expect(r.value.createdAt).toEqual(now);
    expect(r.value.updatedAt).toEqual(now);
  });

  it("rejects an empty name", () => {
    const r = newProduct({ name: "   ", price: price(1) }, ctx);
    expect(isErr(r) && r.error.code).toBe("EMPTY_NAME");
  });

  it("rejects an invalid slug from the context", () => {
    const r = newProduct({ name: "Mate", price: price(1) }, { ...ctx, slug: "Mate Imperial" });
    expect(isErr(r) && r.error.code).toBe("INVALID_SLUG");
  });
});

describe("publish", () => {
  it("rejects publishing without images", () => {
    const r = publish(draft(), after);
    expect(isErr(r) && r.error.code).toBe("NO_IMAGE");
  });

  it("rejects publishing with a zero price", () => {
    const base = newProduct({ name: "Free", price: price(0), images: [{ key: "a.png", position: 0 }] }, ctx);
    if (!isOk(base)) throw new Error("fixture");
    const r = publish(base.value, after);
    expect(isErr(r) && r.error.code).toBe("INVALID_PRICE");
  });

  it("publishes a valid draft and increments the version", () => {
    const withPhoto = photo(draft(), ["a.png"]);
    const r = publish(withPhoto, after);
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;
    expect(r.value.status).toBe("publicado");
    expect(r.value.version).toBe(withPhoto.version + 1);
    expect(r.value.updatedAt).toEqual(after);
  });
});

describe("pause", () => {
  it("a draft cannot be paused", () => {
    const r = pause(draft(), after);
    expect(isErr(r) && r.error.code).toBe("INVALID_STATUS");
  });

  it("pauses a published one", () => {
    const pub = publish(photo(draft(), ["a.png"]), now);
    if (!isOk(pub)) throw new Error("fixture");
    const r = pause(pub.value, after);
    expect(isOk(r) && r.value.status).toBe("pausado");
  });
});

describe("withImages", () => {
  it("orders the gallery and caps it at 8", () => {
    const original = draft();
    const r = withImages(original, ["b.png", "a.png"], after);
    expect(isOk(r) && r.value.images).toEqual([
      { key: "b.png", position: 0 },
      { key: "a.png", position: 1 },
    ]);
    expect(isOk(r) && r.value.version).toBe(2);
    expect(isOk(r) && Object.isFrozen(r.value)).toBe(true);
    expect(original.images).toEqual([]);
    const nine = withImages(
      original,
      Array.from({ length: 9 }, (_, i) => `${i}.png`),
      after,
    );
    expect(isErr(nine) && nine.error.code).toBe("TOO_MANY_IMAGES");
    expect(isErr(nine) && nine.error.details).toEqual({ max: 8 });
    const eight = withImages(
      original,
      Array.from({ length: 8 }, (_, i) => `${i}.png`),
      after,
    );
    expect(isOk(eight)).toBe(true);
  });

  it("rejects a repeated key", () => {
    const r = withImages(draft(), ["a.png", "a.png"], after);
    expect(isErr(r) && r.error.code).toBe("INVALID_IMAGE");
  });

  it("clears value photos that are no longer in the gallery", () => {
    const opt = {
      id: "o1",
      name: "Color",
      values: [{ id: "v1", label: "Rojo", priceDelta: 0, imageKey: "b" }],
    };
    const p = newProduct(
      {
        name: "Taza",
        price: price(100),
        images: [
          { key: "a", position: 0 },
          { key: "b", position: 1 },
        ],
        options: [opt],
      },
      ctx,
    );
    if (!isOk(p)) throw new Error("fixture");
    const r = withImages(p.value, ["a"], after);
    expect(isOk(r) && r.value.options[0]?.values[0]?.imageKey).toBeNull();
    const kept = withImages(p.value, ["b"], after);
    expect(isOk(kept) && kept.value.options[0]?.values[0]?.imageKey).toBe("b");
  });
});

describe("variants (options)", () => {
  const size = {
    id: "o1",
    name: "Tamaño",
    values: [
      { id: "v1", label: "Chica", priceDelta: -4500, imageKey: null },
      { id: "v2", label: "Grande", priceDelta: 1000, imageKey: null },
    ],
  };

  it("a product is created with validated options", () => {
    const r = newProduct({ name: "Maceta", price: price(4500), options: [size] }, ctx);
    expect(isOk(r) && r.value.options[0]?.name).toBe("Tamaño");
    const bad = newProduct({ name: "Maceta", price: price(4500), options: [{ ...size, values: [] }] }, ctx);
    expect(isErr(bad) && bad.error.code).toBe("INVALID_OPTIONS");
  });

  it("can't be published if the cheapest combination costs zero or less", () => {
    const r = newProduct({ name: "Maceta", price: price(4500), options: [size] }, ctx);
    if (!isOk(r)) throw new Error("fixture");
    const withPhoto = photo(r.value, ["k.png"]);
    const pub = publish(withPhoto, after);
    expect(isErr(pub) && pub.error.code).toBe("INVALID_PRICE");
    const ok = edit(withPhoto, { price: price(4600) }, after);
    expect(isOk(ok) && isOk(publish(ok.value, after))).toBe(true);
  });

  it("edit replaces the options and validates them", () => {
    const p = draft();
    const r = edit(p, { options: [size] }, after);
    expect(isOk(r) && r.value.options).toEqual([size]);
    expect(isOk(r) && r.value.version).toBe(p.version + 1);
    const bad = edit(p, { options: [{ ...size, name: "" }] }, after);
    expect(isErr(bad) && bad.error.code).toBe("INVALID_OPTIONS");
  });

  it("edit rejects a value photo that isn't one of the product's", () => {
    const p = photo(draft(), ["a.png"]);
    const withValuePhoto = (imageKey: string) => [
      { ...size, values: [{ id: "v1", label: "Chica", priceDelta: 0, imageKey }] },
    ];
    const bad = edit(p, { options: withValuePhoto("zzz.png") }, after);
    expect(isErr(bad) && bad.error.code).toBe("INVALID_OPTIONS");
    expect(isErr(bad) && bad.error.details).toEqual({ imageKey: "zzz.png" });
    expect(isOk(edit(p, { options: withValuePhoto("a.png") }, after))).toBe(true);
  });

  it("newProduct rejects a value photo that isn't among its images", () => {
    const opt = { ...size, values: [{ id: "v1", label: "Chica", priceDelta: 0, imageKey: "zzz.png" }] };
    const r = newProduct({ name: "Maceta", price: price(4500), options: [opt] }, ctx);
    expect(isErr(r) && r.error.code).toBe("INVALID_OPTIONS");
  });
});
