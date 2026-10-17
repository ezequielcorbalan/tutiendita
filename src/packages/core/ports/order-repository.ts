import type { Order, OrderStatus } from "../domain/order";

export interface OrderRepository {
  insert(o: Order): Promise<void>;
  /** Open orders first (nuevo, contactado, pagado), closed after; newest first within each group. */
  list(): Promise<Order[]>;
  findById(id: string): Promise<Order | null>;
  updateStatus(id: string, status: OrderStatus, updatedAt: Date): Promise<void>;
}
