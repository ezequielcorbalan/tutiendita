import { type DomainError, domainError } from "../domain/errors";
import type { Money } from "../domain/money";
import { calculateTotal, type OrderItem } from "../domain/order";
import { err, ok, type Result } from "../domain/result";
import type { ProductRepository } from "../ports/product-repository";

export const MAX_CART_LINES = 50;
export const MAX_QUANTITY = 99;

export type CartLine = { productId: string; quantity: number };

/**
 * Prices the browser's cart on the server: current prices, only published products, total calculated here
 * (the browser is never trusted). Nothing is stored yet.
 */
export const quoteOrder =
  (deps: { repo: ProductRepository }) =>
  async (lines: readonly CartLine[]): Promise<Result<{ items: OrderItem[]; total: Money }, DomainError>> => {
    if (lines.length === 0 || lines.length > MAX_CART_LINES) {
      return err(
        domainError("INVALID_CART", "The cart must have between 1 and 50 products", { lines: lines.length }),
      );
    }
    const items: OrderItem[] = [];
    for (const line of lines) {
      if (!Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > MAX_QUANTITY) {
        return err(domainError("INVALID_CART", "Each quantity must be between 1 and 99", { ...line }));
      }
      const product = await deps.repo.findById(line.productId);
      if (product === null || product.status !== "publicado") {
        return err(
          domainError("PRODUCT_UNAVAILABLE", "A product in the cart is no longer for sale", {
            productId: line.productId,
          }),
        );
      }
      items.push({
        productId: product.id,
        name: product.name,
        unitPrice: product.price,
        quantity: line.quantity,
      });
    }
    const total = calculateTotal(items);
    return total.ok ? ok({ items, total: total.value }) : total;
  };
