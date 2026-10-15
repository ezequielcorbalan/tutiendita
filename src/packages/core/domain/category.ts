import { type DomainError, domainError } from "./errors";
import { err, ok, type Result } from "./result";
import { isValidSlug } from "./slug";

export type Category = {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly parentId: string | null;
};

export type CategoryInput = { name: string; parentId?: string | null };
export type CategoryContext = { id: string; slug: string };

export function createCategory(e: CategoryInput, ctx: CategoryContext): Result<Category, DomainError> {
  const name = e.name.trim();
  if (name === "") {
    return err(domainError("EMPTY_NAME", "The category needs a name"));
  }
  if (!isValidSlug(ctx.slug)) {
    return err(domainError("INVALID_SLUG", "The slug format is not valid", { slug: ctx.slug }));
  }
  return ok(Object.freeze({ id: ctx.id, name, slug: ctx.slug, parentId: e.parentId ?? null }));
}
