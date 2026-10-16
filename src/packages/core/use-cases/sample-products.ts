import { createCategory } from "../domain/category";
import type { DomainError } from "../domain/errors";
import { optionsFromTemplates } from "../domain/options";
import { ok, type Result } from "../domain/result";
import {
  SAMPLE_CATALOG,
  SAMPLE_CURRENCY,
  SAMPLE_INDUSTRIES,
  type SampleIndustry,
  sampleCategoryId,
  sampleDescription,
  sampleOptions,
  samplePhotoPath,
  sampleProductId,
} from "../domain/samples";
import { generateSlug } from "../domain/slug";
import { DEFAULT_LANGUAGE } from "../domain/store";
import type { StoreRepository } from "../ports/store-repository";
import { type CreateProductDeps, createProduct } from "./create-product";

export type SampleProductsDeps = CreateProductDeps & {
  store: StoreRepository;
  /** Bytes of the sample photo at `path` (a static asset of the app). */
  readPhoto: (path: string) => Promise<Uint8Array>;
};

/**
 * Creates the industry's sample categories and products, published and in the store's language. Ids are
 * fixed: whatever already exists is not created again (loading twice does not duplicate). If the owner
 * already has a category with the same slug, the products go there. Product slugs are resolved as in a
 * normal creation (with a suffix if the name is taken).
 * shortcut: two simultaneous loads of the same industry can leave an orphan photo in R2, if it bothers, lock in D1.
 */
export const loadSampleProducts =
  (deps: SampleProductsDeps) =>
  async (industry: SampleIndustry): Promise<Result<{ created: number }, DomainError>> => {
    const language = (await deps.store.get())?.language ?? DEFAULT_LANGUAGE;
    const existing = await deps.categories.list();
    let created = 0;
    for (const cat of SAMPLE_CATALOG[industry].categories) {
      const id = sampleCategoryId(industry, cat.key);
      const slug = generateSlug(cat.name[language]);
      let category = existing.find((c) => c.id === id) ?? existing.find((c) => c.slug === slug);
      if (category === undefined) {
        const created = createCategory(
          { name: cat.name[language], optionTemplates: sampleOptions(cat.options ?? [], language) },
          { id, slug },
        );
        if (!created.ok) return created;
        await deps.categories.save(created.value);
        category = created.value;
      }
      for (const p of cat.products) {
        const productId = sampleProductId(industry, p.key);
        if ((await deps.repo.findById(productId)) !== null) continue;
        const bytes = await deps.readPhoto(samplePhotoPath(industry, p.key));
        // Its own variants or the category's (an own category with the same slug too), with ids derived from
        // the product's fixed id: the generator below only knows that one.
        const templates =
          p.options !== undefined ? sampleOptions(p.options, language) : category.optionTemplates;
        let n = 0;
        const options = optionsFromTemplates(templates, () => {
          n += 1;
          return `${productId}:${n}`;
        });
        const r = await createProduct({ ...deps, ids: { newId: () => productId } })({
          name: p.name[language],
          description: sampleDescription(p, language),
          price: { amount: p.price, currency: SAMPLE_CURRENCY },
          image: { bytes, mimeType: "image/webp" },
          categoryId: category.id,
          options,
          publish: true,
        });
        if (!r.ok) return r;
        created += 1;
      }
    }
    return ok({ created });
  };

/**
 * Deletes every sample product (of any industry) with its photos, and the sample categories left without
 * products (if the owner added products of their own to them, they stay).
 */
export const deleteSampleProducts =
  (deps: Pick<CreateProductDeps, "repo" | "categories" | "images">) =>
  async (): Promise<{ deleted: number }> => {
    let deleted = 0;
    for (const industry of SAMPLE_INDUSTRIES) {
      for (const cat of SAMPLE_CATALOG[industry].categories) {
        for (const p of cat.products) {
          const product = await deps.repo.findById(sampleProductId(industry, p.key));
          if (product === null) continue;
          await deps.repo.remove(product.id);
          for (const img of product.images) {
            try {
              await deps.images.remove(img.key);
            } catch {
              // best-effort: the product is gone; an orphan photo in R2 breaks nothing
            }
          }
          deleted += 1;
        }
        await deps.categories.deleteIfUnused(sampleCategoryId(industry, cat.key));
      }
    }
    return { deleted };
  };
