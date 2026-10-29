import { beforeEach, describe, expect, it } from "vitest";
import { createCategory } from "../../../src/packages/core/domain/category";
import { money } from "../../../src/packages/core/domain/money";
import type { Product } from "../../../src/packages/core/domain/product";
import { isErr, isOk } from "../../../src/packages/core/domain/result";
import { isValidSlug } from "../../../src/packages/core/domain/slug";
import { ImageQuotaError, MAX_BASIC_IMAGE_SIZE, MAX_IMAGE_SIZE } from "../../../src/packages/core/ports/image-storage";
import { DuplicateSlugError } from "../../../src/packages/core/ports/product-repository";
import { createProduct } from "../../../src/packages/core/use-cases/create-product";
import { getProduct } from "../../../src/packages/core/use-cases/get-product";
import { listAllProducts } from "../../../src/packages/core/use-cases/list-all-products";
import { listPublishedProducts } from "../../../src/packages/core/use-cases/list-published-products";
import { validateImage } from "../../../src/packages/core/use-cases/product-gallery";
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
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const png = { bytes: new Uint8Array([...PNG_SIGNATURE, 0, 0, 0, 13]), mimeType: "image/png" };
const jpeg = { bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16]), mimeType: "image/jpeg" };
const ascii = (t: string) => Array.from(t, (ch) => ch.charCodeAt(0));
const webp = {
  bytes: new Uint8Array([...ascii("RIFF"), 36, 0, 0, 0, ...ascii("WEBP"), ...ascii("VP8 ")]),
  mimeType: "image/webp",
};

let repo: InMemoryProductRepository;
let categories: InMemoryCategoryRepository;
let images: InMemoryImageStorage;
let create: ReturnType<typeof createProduct>;

beforeEach(() => {
  repo = new InMemoryProductRepository();
  categories = new InMemoryCategoryRepository();
  images = new InMemoryImageStorage();
  create = createProduct({
    repo,
    categories,
    images,
    clock: new FixedClock(new Date("2026-10-14T12:00:00Z")),
    ids: new SequentialIdGenerator(),
  });
});

describe("createProduct (use case)", () => {
  it("rejects a new product with PRODUCT_LIMIT_REACHED once maxProducts exist", async () => {
    const limited = createProduct({
      repo,
      categories,
      images,
      clock: new FixedClock(new Date("2026-10-14T12:00:00Z")),
      ids: new SequentialIdGenerator(),
      maxProducts: 2,
    });
    expect(isOk(await limited({ name: "Uno", price: ars(1) }))).toBe(true);
    expect(isOk(await limited({ name: "Dos", price: ars(1) }))).toBe(true);
    const third = await limited({ name: "Tres", price: ars(1) });
    expect(isErr(third) && third.error.code).toBe("PRODUCT_LIMIT_REACHED");
    expect(repo.byId.size).toBe(2);
  });

  it("has no product limit by default", async () => {
    for (const name of ["Uno", "Dos", "Tres"]) expect(isOk(await create({ name, price: ars(1) }))).toBe(true);
  });

  it("uploads the image, saves and publishes when asked", async () => {
    const r = await create({
      name: "Mate imperial",
      price: ars(4500),
      gallery: [{ upload: 0 }],
      uploads: [png],
      publish: true,
    });
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;
    expect(r.value.status).toBe("publicado");
    expect(r.value.slug).toBe("mate-imperial");
    expect(r.value.images).toHaveLength(1);
    expect(images.files.has(r.value.images[0]?.key ?? "")).toBe(true);
    expect(repo.byId.size).toBe(1);
  });

  it("the first save has version 1 even if an image is added and it is published", async () => {
    const r = await create({
      name: "Mate version",
      price: ars(4500),
      gallery: [{ upload: 0 }],
      uploads: [png],
      publish: true,
    });
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;
    expect(r.value.version).toBe(1);
    expect(repo.byId.get(r.value.id)?.version).toBe(1);
    expect(r.value.updatedAt).toEqual(r.value.createdAt);
  });

  it("a draft with an image is also saved with version 1", async () => {
    const r = await create({
      name: "Draft with photo",
      price: ars(100),
      gallery: [{ upload: 0 }],
      uploads: [png],
    });
    expect(isOk(r) && r.value.version).toBe(1);
  });

  it("creates a draft without an image if publishing is not requested", async () => {
    const r = await create({ name: "Draft", price: ars(100) });
    expect(isOk(r) && r.value.status).toBe("borrador");
    expect(images.files.size).toBe(0);
  });

  it("publishing without an image fails and leaves nothing saved", async () => {
    const r = await create({ name: "No photo", price: ars(100), publish: true });
    expect(isErr(r) && r.error.code).toBe("NO_IMAGE");
    expect(repo.byId.size).toBe(0);
    expect(images.files.size).toBe(0);
  });

  it("zero price with publish fails before uploading the image", async () => {
    const r = await create({
      name: "Free",
      price: ars(0),
      gallery: [{ upload: 0 }],
      uploads: [png],
      publish: true,
    });
    expect(isErr(r) && r.error.code).toBe("INVALID_PRICE");
    expect(images.files.size).toBe(0);
  });

  it("rejects a disallowed MIME type without uploading anything", async () => {
    const r = await create({
      name: "Gif",
      price: ars(100),
      gallery: [{ upload: 0 }],
      uploads: [{ ...png, mimeType: "image/gif" }],
    });
    expect(isErr(r) && r.error.code).toBe("INVALID_IMAGE");
    expect(images.files.size).toBe(0);
    expect(repo.byId.size).toBe(0);
  });

  it("rejects an image larger than 5 MB", async () => {
    const large = { bytes: new Uint8Array(MAX_IMAGE_SIZE + 1), mimeType: "image/jpeg" };
    const r = await create({ name: "Large", price: ars(100), gallery: [{ upload: 0 }], uploads: [large] });
    expect(isErr(r) && r.error.code).toBe("INVALID_IMAGE");
    expect(isErr(r) && r.error.details).toMatchObject({ max: MAX_IMAGE_SIZE });
    expect(images.files.size).toBe(0);
  });

  it.each([
    ["png", png],
    ["jpeg", jpeg],
    ["webp", webp],
  ])("accepts a %s whose bytes carry the declared MIME type's signature", async (_n, img) => {
    const r = await create({ name: "Photo", price: ars(100), gallery: [{ upload: 0 }], uploads: [img] });
    expect(isOk(r)).toBe(true);
    expect(images.files.size).toBe(1);
  });

  it.each([
    ["image/png with JPEG bytes", { ...jpeg, mimeType: "image/png" }],
    ["image/jpeg with PNG bytes", { ...png, mimeType: "image/jpeg" }],
    ["image/webp with PNG bytes", { ...png, mimeType: "image/webp" }],
    [
      "image/webp RIFF that is not WEBP",
      { bytes: new Uint8Array([...ascii("RIFF"), 0, 0, 0, 0, ...ascii("WAVE")]), mimeType: "image/webp" },
    ],
    [
      "image/png with truncated signature",
      { bytes: new Uint8Array([137, 80, 78, 71]), mimeType: "image/png" },
    ],
    [
      "image/png with HTML text",
      { bytes: new Uint8Array(ascii("<html><script>x</script>")), mimeType: "image/png" },
    ],
    ["empty image/jpeg", { bytes: new Uint8Array(0), mimeType: "image/jpeg" }],
  ])("rejects %s with INVALID_IMAGE without uploading anything", async (_n, img) => {
    const r = await create({ name: "Fake", price: ars(100), gallery: [{ upload: 0 }], uploads: [img] });
    expect(isErr(r) && r.error.code).toBe("INVALID_IMAGE");
    expect(images.files.size).toBe(0);
    expect(repo.byId.size).toBe(0);
  });

  it("resolves slug collisions with a numeric suffix", async () => {
    const a = await create({ name: "Mate", price: ars(1) });
    const b = await create({ name: "Mate", price: ars(1) });
    const c = await create({ name: "Mate", price: ars(1) });
    expect(isOk(a) && a.value.slug).toBe("mate");
    expect(isOk(b) && b.value.slug).toBe("mate-2");
    expect(isOk(c) && c.value.slug).toBe("mate-3");
  });

  it("with a repeated long name generates valid, distinct slugs of up to 80 characters", async () => {
    const name =
      "Alfajor triple de chocolate amargo relleno de dulce de leche repostero con nueces y almendras";
    expect(name.length).toBeGreaterThan(90);
    const slugs: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      const r = await create({ name, price: ars(1) });
      expect(isErr(r) && r.error).toBe(false);
      if (isOk(r)) slugs.push(r.value.slug);
    }
    expect(new Set(slugs).size).toBe(3);
    expect(slugs[1]).toMatch(/-2$/);
    expect(slugs[2]).toMatch(/-3$/);
    for (const s of slugs) {
      expect(s.length).toBeLessThanOrEqual(80);
      expect(isValidSlug(s)).toBe(true);
    }
  });

  it("on a race with a long name, the retry slug is also valid", async () => {
    const name = "x".repeat(100);
    class RacingRepo extends InMemoryProductRepository {
      attempts = 0;
      override async save(p: Product): Promise<void> {
        this.attempts += 1;
        if (this.attempts === 1) throw new DuplicateSlugError(p.slug);
        await super.save(p);
      }
    }
    const r = await createProduct({
      repo: new RacingRepo(),
      categories,
      images,
      clock: new FixedClock(new Date("2026-10-14T12:00:00Z")),
      ids: new SequentialIdGenerator(),
    })({ name, price: ars(1) });
    expect(isOk(r) && r.value.slug).toBe(`${"x".repeat(78)}-2`);
  });

  it("rejects a name that produces no slug", async () => {
    const r = await create({ name: "!!!", price: ars(1) });
    expect(isErr(r) && r.error.code).toBe("INVALID_SLUG");
  });

  it("rejects a missing category and accepts an existing one", async () => {
    const bad = await create({ name: "X", price: ars(1), categoryId: "nope" });
    expect(isErr(bad) && bad.error.code).toBe("CATEGORY_NOT_FOUND");
    const cat = createCategory({ name: "Sweets" }, { id: "c1", slug: "sweets" });
    if (!isOk(cat)) throw new Error("fixture");
    await categories.save(cat.value);
    const good = await create({ name: "Y", price: ars(1), categoryId: "c1" });
    expect(isOk(good) && good.value.categoryId).toBe("c1");
  });
});

describe("createProduct on save failures", () => {
  const buildWith = (r: InMemoryProductRepository) =>
    createProduct({
      repo: r,
      categories,
      images,
      clock: new FixedClock(new Date("2026-10-14T12:00:00Z")),
      ids: new SequentialIdGenerator(),
    });

  it("if save throws, deletes the uploaded image and propagates the original error", async () => {
    const fails = new Error("D1 down");
    class FailingRepo extends InMemoryProductRepository {
      override async save(_p: Product): Promise<void> {
        throw fails;
      }
    }
    await expect(
      buildWith(new FailingRepo())({ name: "Mate", price: ars(1), gallery: [{ upload: 0 }], uploads: [png] }),
    ).rejects.toBe(fails);
    expect(images.files.size).toBe(0);
  });

  it("if delete also throws, still propagates the original save error", async () => {
    const fails = new Error("D1 down");
    class FailingRepo extends InMemoryProductRepository {
      override async save(_p: Product): Promise<void> {
        throw fails;
      }
    }
    images.remove = async () => {
      throw new Error("R2 down");
    };
    await expect(
      buildWith(new FailingRepo())({ name: "Mate", price: ars(1), gallery: [{ upload: 0 }], uploads: [png] }),
    ).rejects.toBe(fails);
  });

  it("on DuplicateSlugError (race) retries with the next suffix without uploading the image again", async () => {
    class RacingRepo extends InMemoryProductRepository {
      attempts = 0;
      override async save(p: Product): Promise<void> {
        this.attempts += 1;
        if (this.attempts === 1) throw new DuplicateSlugError(p.slug);
        await super.save(p);
      }
    }
    const r2 = new RacingRepo();
    const r = await buildWith(r2)({ name: "Mate", price: ars(1), gallery: [{ upload: 0 }], uploads: [png] });
    expect(isOk(r) && r.value.slug).toBe("mate-2");
    expect([...r2.byId.values()].map((p) => p.slug)).toEqual(["mate-2"]);
    expect(images.files.size).toBe(1);
  });

  it("after 3 DuplicateSlugError in a row gives up: deletes the image and propagates", async () => {
    class AlwaysDuplicateRepo extends InMemoryProductRepository {
      attempts = 0;
      override async save(p: Product): Promise<void> {
        this.attempts += 1;
        throw new DuplicateSlugError(p.slug);
      }
    }
    const r2 = new AlwaysDuplicateRepo();
    await expect(
      buildWith(r2)({ name: "Mate", price: ars(1), gallery: [{ upload: 0 }], uploads: [png] }),
    ).rejects.toBeInstanceOf(DuplicateSlugError);
    expect(r2.attempts).toBe(3);
    expect(images.files.size).toBe(0);
  });
});

describe("listPublishedProducts and getProduct", () => {
  it("lists only published ones", async () => {
    await create({ name: "Pub", price: ars(1), gallery: [{ upload: 0 }], uploads: [png], publish: true });
    await create({ name: "Drft", price: ars(1) });
    const list = await listPublishedProducts({ repo })();
    expect(list.map((p) => p.slug)).toEqual(["pub"]);
  });

  it("listAllProducts includes drafts (for the panel)", async () => {
    await create({ name: "Pub", price: ars(1), gallery: [{ upload: 0 }], uploads: [png], publish: true });
    await create({ name: "Drft", price: ars(1) });
    const list = await listAllProducts({ repo })();
    expect(list.map((p) => [p.slug, p.status])).toEqual([
      ["pub", "publicado"],
      ["drft", "borrador"],
    ]);
  });

  it("get returns the published one and PRODUCT_NOT_FOUND for missing or draft", async () => {
    await create({ name: "Pub", price: ars(1), gallery: [{ upload: 0 }], uploads: [png], publish: true });
    await create({ name: "Drft", price: ars(1) });
    const get = getProduct({ repo });
    expect(isOk(await get("pub"))).toBe(true);
    const missing = await get("nothing");
    expect(isErr(missing) && missing.error.code).toBe("PRODUCT_NOT_FOUND");
    const draft = await get("drft");
    expect(isErr(draft) && draft.error.code).toBe("PRODUCT_NOT_FOUND");
  });
});

describe("basic photo storage limits", () => {
  const big = { bytes: new Uint8Array(2 * 1024 * 1024), mimeType: "image/png" };
  big.bytes.set(png.bytes);

  it("validateImage rejects 2 MB with the basic max size and accepts it by default", () => {
    const basic = validateImage(big, MAX_BASIC_IMAGE_SIZE);
    expect(isErr(basic) && basic.error.code).toBe("INVALID_IMAGE");
    expect(isOk(validateImage(big))).toBe(true);
  });

  it("createProduct uses deps.maxImageSize", async () => {
    const limited = createProduct({
      repo,
      categories,
      images,
      clock: new FixedClock(new Date("2026-10-14T12:00:00Z")),
      ids: new SequentialIdGenerator(),
      maxImageSize: MAX_BASIC_IMAGE_SIZE,
    });
    const r = await limited({ name: "Big", price: ars(100), gallery: [{ upload: 0 }], uploads: [big] });
    expect(isErr(r) && r.error.code).toBe("INVALID_IMAGE");
  });

  it("createProduct returns IMAGE_QUOTA_REACHED and saves no product when images.save throws ImageQuotaError", async () => {
    images.save = async () => {
      throw new ImageQuotaError(200);
    };
    const r = await create({
      name: "Full",
      price: ars(100),
      gallery: [{ upload: 0 }],
      uploads: [png],
      publish: true,
    });
    expect(isErr(r) && r.error.code).toBe("IMAGE_QUOTA_REACHED");
    expect(isErr(r) && r.error.details).toEqual({ max: 200 });
    expect(repo.byId.size).toBe(0);
  });

  it("createProduct rethrows other storage errors unchanged", async () => {
    images.save = async () => {
      throw new Error("boom");
    };
    await expect(
      create({ name: "Boom", price: ars(100), gallery: [{ upload: 0 }], uploads: [png] }),
    ).rejects.toThrow("boom");
    expect(repo.byId.size).toBe(0);
  });
});
