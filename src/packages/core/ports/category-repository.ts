import type { Category } from "../domain/category";

export interface CategoryRepository {
  list(): Promise<Category[]>;
  findById(id: string): Promise<Category | null>;
  save(c: Category): Promise<void>;
  /** Deletes the category only if no product uses it; returns whether it was deleted. */
  deleteIfUnused(id: string): Promise<boolean>;
}
