import { type DomainError, domainError } from "./errors";
import { type OptionTemplate, validateTemplates } from "./options";
import { err, ok, type Result } from "./result";
import { isValidSlug } from "./slug";

export type Category = {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly parentId: string | null;
  /** Variant templates copied into the products created in this category. */
  readonly optionTemplates: readonly OptionTemplate[];
};

export type CategoryInput = {
  name: string;
  parentId?: string | null;
  optionTemplates?: readonly OptionTemplate[];
};
export type CategoryContext = { id: string; slug: string };

export function createCategory(e: CategoryInput, ctx: CategoryContext): Result<Category, DomainError> {
  const name = e.name.trim();
  if (name === "") {
    return err(domainError("EMPTY_NAME", "The category needs a name"));
  }
  if (!isValidSlug(ctx.slug)) {
    return err(domainError("INVALID_SLUG", "The slug format is not valid", { slug: ctx.slug }));
  }
  const templates = validateTemplates(e.optionTemplates ?? []);
  if (!templates.ok) return templates;
  return ok(
    Object.freeze({
      id: ctx.id,
      name,
      slug: ctx.slug,
      parentId: e.parentId ?? null,
      optionTemplates: templates.value,
    }),
  );
}

/** Renames and/or replaces the templates. The slug never changes (its public URL /c/<slug> stays). */
export function editCategory(
  c: Category,
  changes: { name?: string; optionTemplates?: readonly OptionTemplate[] },
): Result<Category, DomainError> {
  const name = changes.name === undefined ? c.name : changes.name.trim();
  if (name === "") return err(domainError("EMPTY_NAME", "The category needs a name"));
  const templates =
    changes.optionTemplates === undefined
      ? ok(c.optionTemplates)
      : validateTemplates(changes.optionTemplates);
  if (!templates.ok) return templates;
  return ok(Object.freeze({ ...c, name, optionTemplates: templates.value }));
}
