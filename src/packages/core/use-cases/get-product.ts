import { type DomainError, domainError } from "../domain/errors";
import type { Product } from "../domain/product";
import { err, ok, type Result } from "../domain/result";
import type { ProductRepository } from "../ports/product-repository";

/** For the public: only published products exist. Drafts and paused ones respond as not found. */
export const getProduct =
  (deps: { repo: ProductRepository }) =>
  async (slug: string): Promise<Result<Product, DomainError>> => {
    const p = await deps.repo.findBySlug(slug);
    if (p === null || p.status !== "publicado") {
      return err(domainError("PRODUCT_NOT_FOUND", "There is no published product with that slug", { slug }));
    }
    return ok(p);
  };
