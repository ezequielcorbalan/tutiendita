import { type DomainError, domainError } from "../domain/errors";
import { canTransition, type Order, type OrderStatus } from "../domain/order";
import { err, ok, type Result } from "../domain/result";
import type { Clock } from "../ports/clock";
import type { OrderRepository } from "../ports/order-repository";

/** Open orders first, newest first inside each group (the repository sorts). */
export const listOrders = (deps: { orders: OrderRepository }) => (): Promise<Order[]> => deps.orders.list();

export const changeOrderStatus =
  (deps: { orders: OrderRepository; clock: Clock }) =>
  async (id: string, to: OrderStatus): Promise<Result<Order, DomainError>> => {
    const order = await deps.orders.findById(id);
    if (order === null) return err(domainError("ORDER_NOT_FOUND", "Order not found", { id }));
    if (!canTransition(order.status, to)) {
      return err(
        domainError("INVALID_TRANSITION", "That status change is not allowed", { from: order.status, to }),
      );
    }
    const updatedAt = deps.clock.now();
    await deps.orders.updateStatus(id, to, updatedAt);
    return ok({ ...order, status: to, updatedAt });
  };
