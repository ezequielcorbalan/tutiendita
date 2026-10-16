import { type DomainError, domainError } from "./errors";
import { add, type Money, multiply } from "./money";
import { err, ok, type Result } from "./result";

// Stored in D1: values stay in Spanish (new, contacted, paid, delivered, cancelled).
export type OrderStatus = "nuevo" | "contactado" | "pagado" | "entregado" | "cancelado";

export type OrderItem = {
  readonly productId: string;
  readonly name: string;
  /** The chosen variant ("Relleno: Dulce de leche · Talle: M"), if the product has options. */
  readonly variant?: string;
  /** Price frozen at order time, with the variant's adjustments. */
  readonly unitPrice: Money;
  readonly quantity: number;
};

/** Confirmed purchase intent. Not a payment: money never goes through the system. */
export type Order = {
  readonly id: string;
  readonly items: readonly OrderItem[];
  readonly buyer: {
    readonly name: string;
    readonly phone: string;
    readonly email: string | null;
  };
  readonly paymentMethod: string;
  readonly status: OrderStatus;
  readonly note: string;
  readonly createdByAgent: boolean;
  readonly createdAt: Date;
};

/** The total is always calculated on the server; the browser is never trusted. */
export function calculateTotal(items: readonly OrderItem[]): Result<Money, DomainError> {
  const first = items[0];
  if (first === undefined) {
    return err(domainError("INVALID_PRICE", "An order needs at least one item"));
  }
  let total: Money = { amount: 0, currency: first.unitPrice.currency };
  for (const item of items) {
    if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
      return err(
        domainError("INVALID_PRICE", "The quantity must be an integer greater than zero", {
          productId: item.productId,
          quantity: item.quantity,
        }),
      );
    }
    if (item.unitPrice.currency !== total.currency) {
      return err(
        domainError("INVALID_PRICE", "All items must be in the same currency", {
          expected: total.currency,
          received: item.unitPrice.currency,
        }),
      );
    }
    total = add(total, multiply(item.unitPrice, item.quantity));
  }
  return ok(total);
}

export const transitions: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  nuevo: ["contactado", "pagado", "cancelado"],
  contactado: ["pagado", "cancelado"],
  pagado: ["entregado", "cancelado"],
  entregado: [],
  cancelado: [],
};

export const canTransition = (from: OrderStatus, to: OrderStatus): boolean => transitions[from].includes(to);
