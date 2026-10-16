import { type Category, editCategory, createCategory as newCategory } from "../domain/category";
import { type DomainError, domainError } from "../domain/errors";
import type { OptionTemplate } from "../domain/options";
import { err, ok, type Result } from "../domain/result";
import { generateSlug, isValidSlug, MAX_SLUG_LENGTH } from "../domain/slug";
import type { CategoryRepository } from "../ports/category-repository";
import type { IdGenerator } from "../ports/id-generator";

export type ManageCategoryDeps = { categories: CategoryRepository; ids: IdGenerator };
export type CategoryChanges = { name: string; optionTemplates: readonly OptionTemplate[] };

const MAX_SLUG_ATTEMPTS = 50;

/** First free slug for `name` among the store's categories (few of them: the list is enough). */
async function uniqueSlug(name: string, repo: CategoryRepository): Promise<Result<string, DomainError>> {
  const base = generateSlug(name);
  if (!isValidSlug(base)) {
    return err(domainError("INVALID_SLUG", "The name does not produce a valid slug", { name }));
  }
  const taken = new Set((await repo.list()).map((c) => c.slug));
  for (let n = 1; n <= MAX_SLUG_ATTEMPTS; n += 1) {
    const suffix = n === 1 ? "" : `-${n}`;
    const candidate = base.slice(0, MAX_SLUG_LENGTH - suffix.length).replace(/-+$/, "") + suffix;
    if (!taken.has(candidate)) return ok(candidate);
  }
  return err(domainError("INVALID_SLUG", "Could not generate a unique slug", { name }));
}

const notFound = (id: string) =>
  err(domainError("CATEGORY_NOT_FOUND", "The category does not exist", { id }));

export const addCategory =
  (deps: ManageCategoryDeps) =>
  async (e: CategoryChanges): Promise<Result<Category, DomainError>> => {
    const slug = await uniqueSlug(e.name, deps.categories);
    if (!slug.ok) return slug;
    const c = newCategory(
      { name: e.name, optionTemplates: e.optionTemplates },
      { id: deps.ids.newId(), slug: slug.value },
    );
    if (!c.ok) return c;
    await deps.categories.save(c.value);
    return ok(c.value);
  };

export const updateCategory =
  (deps: Pick<ManageCategoryDeps, "categories">) =>
  async (id: string, e: CategoryChanges): Promise<Result<Category, DomainError>> => {
    const current = await deps.categories.findById(id);
    if (current === null) return notFound(id);
    const c = editCategory(current, e);
    if (!c.ok) return c;
    await deps.categories.save(c.value);
    return ok(c.value);
  };

/** Only a category without products can be deleted; move them first. */
export const deleteCategory =
  (deps: Pick<ManageCategoryDeps, "categories">) =>
  async (id: string): Promise<Result<{ id: string }, DomainError>> => {
    if ((await deps.categories.findById(id)) === null) return notFound(id);
    const deleted = await deps.categories.deleteIfUnused(id);
    if (!deleted) {
      return err(domainError("CATEGORY_HAS_PRODUCTS", "The category still has products", { id }));
    }
    return ok({ id });
  };
