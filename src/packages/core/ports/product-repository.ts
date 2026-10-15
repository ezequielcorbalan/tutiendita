import type { Product } from "../domain/product";

export interface ProductRepository {
  listPublished(): Promise<Product[]>;
  /** Published, drafts and paused, in the same order as `listPublished`. */
  listAll(): Promise<Product[]>;
  findBySlug(slug: string): Promise<Product | null>;
  findById(id: string): Promise<Product | null>;
  slugExists(slug: string): Promise<boolean>;
  /** Inserts or replaces by id, including its images. */
  save(p: Product): Promise<void>;
  /** Deletes the product and its images (the rows; the caller deletes the files in R2). */
  remove(id: string): Promise<void>;
}

/** Thrown by `save` if another product already uses that slug (e.g. two concurrent creations with the same name). */
export class DuplicateSlugError extends Error {
  constructor(readonly slug: string) {
    super(`A product with the slug "${slug}" already exists`);
    this.name = "DuplicateSlugError";
  }
}
