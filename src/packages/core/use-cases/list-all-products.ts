import type { Product } from "../domain/product";
import type { ProductRepository } from "../ports/product-repository";

/** For the owner's panel: all products, including drafts and paused ones. */
export const listAllProducts = (deps: { repo: ProductRepository }) => (): Promise<Product[]> =>
  deps.repo.listAll();
