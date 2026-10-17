import { type DomainError, domainError } from "../domain/errors";
import type { Order, OrderPaymentMethod } from "../domain/order";
import { err, ok, type Result } from "../domain/result";
import type { Clock } from "../ports/clock";
import type { IdGenerator } from "../ports/id-generator";
import type { OrderRepository } from "../ports/order-repository";
import type { ProductRepository } from "../ports/product-repository";
import { type CartLine, quoteOrder } from "./quote-order";

export const MAX_BUYER_NAME = 80;
export const MAX_ORDER_NOTE = 500;

export type PlaceOrderInput = {
  lines: readonly CartLine[];
  buyerName: string;
  note: string;
  paymentMethod: OrderPaymentMethod;
};

/** Stores the browser's cart as a new order: priced and totalled on the server via quoteOrder. */
export const placeOrder =
  (deps: { repo: ProductRepository; orders: OrderRepository; ids: IdGenerator; clock: Clock }) =>
  async (input: PlaceOrderInput): Promise<Result<Order, DomainError>> => {
    const name = input.buyerName.trim();
    const note = input.note.trim();
    if (name === "" || name.length > MAX_BUYER_NAME || note.length > MAX_ORDER_NOTE) {
      return err(
        domainError("INVALID_ORDER", "The order needs a buyer name (up to 80) and a note up to 500"),
      );
    }
    const quote = await quoteOrder({ repo: deps.repo })(input.lines);
    if (!quote.ok) return quote;
    const now = deps.clock.now();
    const order: Order = {
      id: deps.ids.newId(),
      items: quote.value.items,
      buyer: { name },
      paymentMethod: input.paymentMethod,
      total: quote.value.total,
      status: "nuevo",
      note,
      createdByAgent: false,
      createdAt: now,
      updatedAt: now,
    };
    await deps.orders.insert(order);
    return ok(order);
  };
