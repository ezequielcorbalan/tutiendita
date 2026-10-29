import { beforeEach, describe, expect, it } from "vitest";
import { validateTemplates } from "../../../src/packages/core/domain/options";
import { isOk } from "../../../src/packages/core/domain/result";
import { SAMPLE_CATALOG, SAMPLE_INDUSTRIES, sampleOptions } from "../../../src/packages/core/domain/samples";
import { generateSlug, isValidSlug } from "../../../src/packages/core/domain/slug";
import { LANGUAGES, type Language, type Store } from "../../../src/packages/core/domain/store";
import { ImageQuotaError } from "../../../src/packages/core/ports/image-storage";
import { deleteSampleProducts, loadSampleProducts } from "../../../src/packages/core/use-cases/sample-products";
import {
  FixedClock,
  InMemoryCategoryRepository,
  InMemoryImageStorage,
  InMemoryProductRepository,
  InMemoryStoreRepository,
  SequentialIdGenerator,
} from "./doubles/in-memory";

const ascii = (t: string) => Array.from(t, (ch) => ch.charCodeAt(0));
const WEBP = new Uint8Array([...ascii("RIFF"), 36, 0, 0, 0, ...ascii("WEBP"), ...ascii("VP8 ")]);

const store = (language: Language): Store => ({
  id: "t",
  name: "Dulce",
  description: "",
  logoKey: null,
  currency: "ARS",
  language,
  contact: { whatsapp: null, email: null },
  domain: null,
  heartbeatEnabled: true,
  heartbeatSentAt: null,
});

let repo: InMemoryProductRepository;
let categories: InMemoryCategoryRepository;
let images: InMemoryImageStorage;
let readPaths: string[];

const deps = (language: Language = "es") => ({
  repo,
  categories,
  images,
  clock: new FixedClock(new Date("2026-10-15T10:00:00.000Z")),
  ids: new SequentialIdGenerator(),
  store: new InMemoryStoreRepository(store(language)),
  readPhoto: async (path: string) => {
    readPaths.push(path);
    return WEBP;
  },
});

beforeEach(() => {
  repo = new InMemoryProductRepository();
  categories = new InMemoryCategoryRepository();
  categories.products = repo;
  images = new InMemoryImageStorage();
  readPaths = [];
});

describe("sample catalog", () => {
  it("bakery first; each industry with 2 or 3 categories and 6 products", () => {
    expect(SAMPLE_INDUSTRIES[0]).toBe("pasteleria");
    for (const industry of SAMPLE_INDUSTRIES) {
      const { categories: cats } = SAMPLE_CATALOG[industry];
      expect(cats.length).toBeGreaterThanOrEqual(2);
      expect(cats.length).toBeLessThanOrEqual(3);
      expect(cats.flatMap((c) => c.products)).toHaveLength(6);
    }
  });

  it("texts in the three languages, valid unique slugs and a credit for each photo", () => {
    for (const language of LANGUAGES) {
      const cats = SAMPLE_INDUSTRIES.flatMap((r) => SAMPLE_CATALOG[r].categories);
      const categorySlugs = cats.map((c) => generateSlug(c.name[language]));
      const productSlugs = cats.flatMap((c) => c.products.map((p) => generateSlug(p.name[language])));
      for (const s of [...categorySlugs, ...productSlugs]) expect(isValidSlug(s), s).toBe(true);
      expect(new Set(categorySlugs).size).toBe(categorySlugs.length);
      expect(new Set(productSlugs).size).toBe(productSlugs.length);
      for (const p of cats.flatMap((c) => c.products)) {
        expect(p.description[language]).not.toBe("");
        expect(p.price).toBeGreaterThan(0);
        expect(p.photo.author, p.key).not.toBe("");
        expect(p.photo.license, p.key).not.toBe("");
        expect(p.photo.source, p.key).toMatch(/^https:\/\/commons\.wikimedia\.org\/wiki\/File:/);
      }
    }
  });
});

describe("loadSampleProducts", () => {
  it("creates the categories and the published products, with photo and credit, in the store's language", async () => {
    const r = await loadSampleProducts(deps("es"))("pasteleria");
    expect(r).toEqual({ ok: true, value: { created: 6 } });
    expect((await categories.list()).map((c) => c.slug)).toEqual([
      "tortas",
      "facturas-y-medialunas",
      "alfajores-y-galletitas",
    ]);
    const cake = await repo.findById("ejemplo-pasteleria-torta-de-chocolate");
    expect(cake?.name).toBe("Torta de chocolate");
    expect(cake?.slug).toBe("torta-de-chocolate");
    expect(cake?.status).toBe("publicado");
    expect(cake?.categoryId).toBe("ejemplo-pasteleria-tortas");
    expect(cake?.price).toEqual({ amount: 2_800_000, currency: "ARS" });
    expect(cake?.description).toMatch(/\n\nFoto: .+ \(.+\), https:\/\/commons\.wikimedia\.org\//);
    expect(cake?.images).toHaveLength(1);
    expect(images.files.size).toBe(6);
    expect(readPaths).toContain("/samples/pasteleria/torta-de-chocolate.webp");
    expect(await repo.listPublished()).toHaveLength(6);
  });

  it("categories bring their variant templates and the products are created with them (or their own)", async () => {
    await loadSampleProducts(deps("es"))("pasteleria");
    const cakes = await categories.findById("ejemplo-pasteleria-tortas");
    expect(cakes?.optionTemplates.map((o) => o.name)).toEqual(["Relleno", "Cobertura"]);
    const cake = await repo.findById("ejemplo-pasteleria-torta-de-chocolate");
    expect(cake?.options.map((o) => o.name)).toEqual(["Relleno", "Cobertura"]);
    expect(cake?.options[0]?.values.map((v) => v.label)).toContain("Dulce de leche");
    expect(cake?.options[0]?.id).toBeTruthy();
    const cheesecake = await repo.findById("ejemplo-pasteleria-cheesecake");
    expect(cheesecake?.options[0]?.values.map((v) => v.label)).toContain("Maracuyá");
    expect((await repo.findById("ejemplo-pasteleria-lemon-pie"))?.options).toEqual([]);

    await loadSampleProducts(deps("es"))("artesanias");
    const pot = await repo.findById("ejemplo-artesanias-maceta-de-barro");
    expect(pot?.options.map((o) => o.name)).toEqual(["Tamaño"]);
    expect(pot?.options[0]?.values.map((v) => v.priceDelta)).toEqual([-500_000, 0, 700_000]);
  });

  it("in every industry and language, the cheapest variant of each sample still costs more than zero", () => {
    for (const industry of SAMPLE_INDUSTRIES) {
      for (const cat of SAMPLE_CATALOG[industry].categories) {
        for (const p of cat.products) {
          const options = p.options ?? cat.options ?? [];
          const cheapest = options.reduce(
            (sum, o) => sum + Math.min(...o.values.map((v) => v.priceDelta)),
            p.price,
          );
          expect(cheapest).toBeGreaterThan(0);
          for (const language of ["es", "en", "pt"] as const) {
            expect(isOk(validateTemplates(sampleOptions(options, language)))).toBe(true);
          }
        }
      }
    }
  });

  it("in English, names and slugs are English", async () => {
    await loadSampleProducts(deps("en"))("ropa");
    expect((await categories.list()).map((c) => c.name)).toEqual([
      "Tees and sweatshirts",
      "Pants",
      "Outerwear",
    ]);
    expect((await repo.findById("ejemplo-ropa-jean"))?.slug).toBe("classic-jeans");
    expect((await repo.findById("ejemplo-ropa-jean"))?.description).toContain("\n\nPhoto: ");
  });

  it("loading twice duplicates nothing", async () => {
    await loadSampleProducts(deps())("almacen");
    const r = await loadSampleProducts(deps())("almacen");
    expect(r).toEqual({ ok: true, value: { created: 0 } });
    expect(repo.byId.size).toBe(6);
    expect(categories.byId.size).toBe(3);
    expect(images.files.size).toBe(6);
  });

  it("if an own category with the same slug exists, it uses that one", async () => {
    await categories.save({
      id: "mine",
      name: "Cerámica",
      slug: "ceramica",
      parentId: null,
      optionTemplates: [],
    });
    await loadSampleProducts(deps())("artesanias");
    expect(categories.byId.has("ejemplo-artesanias-ceramica")).toBe(false);
    expect((await repo.findById("ejemplo-artesanias-taza-de-ceramica"))?.categoryId).toBe("mine");
  });

  it("an own product with the same name keeps its slug; the sample one takes another", async () => {
    await loadSampleProducts(deps())("pasteleria");
    repo.byId.delete("ejemplo-pasteleria-lemon-pie");
    const own = {
      ...(await repo.findById("ejemplo-pasteleria-cheesecake")),
      id: "own",
      slug: "lemon-pie",
    };
    await repo.save(own as never);
    await loadSampleProducts(deps())("pasteleria");
    expect((await repo.findById("ejemplo-pasteleria-lemon-pie"))?.slug).toBe("lemon-pie-2");
  });

  it("returns IMAGE_QUOTA_REACHED when the photo storage is full", async () => {
    images.save = async () => {
      throw new ImageQuotaError(200);
    };
    const r = await loadSampleProducts(deps("es"))("pasteleria");
    expect(isOk(r) ? null : r.error.code).toBe("IMAGE_QUOTA_REACHED");
    expect(repo.byId.size).toBe(0);
  });
});

describe("deleteSampleProducts", () => {
  it("deletes the sample products with their photos and the empty categories; keeps the own ones", async () => {
    await loadSampleProducts(deps())("pasteleria");
    await loadSampleProducts(deps())("ropa");
    const cake = await repo.findById("ejemplo-pasteleria-torta-de-chocolate");
    // An own product in a sample category: that category stays.
    await repo.save({
      ...(cake as NonNullable<typeof cake>),
      id: "own",
      slug: "mi-torta",
      images: [],
    });
    const r = await deleteSampleProducts(deps())();
    expect(r).toEqual({ deleted: 12 });
    expect([...repo.byId.keys()]).toEqual(["own"]);
    expect([...categories.byId.keys()]).toEqual(["ejemplo-pasteleria-tortas"]);
    expect(images.files.size).toBe(0);
    expect(await deleteSampleProducts(deps())()).toEqual({ deleted: 0 });
  });
});
