import type { Product } from "../domain/product";
import type { ProductRepository } from "../ports/product-repository";

export const listPublishedProducts = (deps: { repo: ProductRepository }) => (): Promise<Product[]> =>
  deps.repo.listPublished();
