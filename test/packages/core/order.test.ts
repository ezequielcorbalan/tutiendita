import { describe, expect, it } from "vitest";
import { money } from "../../../src/packages/core/domain/money";
import { calculateTotal, canTransition, isOpen, ORDER_STATUSES, type OrderItem } from "../../../src/packages/core/domain/order";
import { isErr, isOk } from "../../../src/packages/core/domain/result";

const price = (amount: number, currency = "ARS") => {
  const r = money(amount, currency);
  if (!isOk(r)) throw new Error("fixture");
  return r.value;
};
const item = (amount: number, quantity: number, currency = "ARS"): OrderItem => ({
  productId: "p1",
  name: "x",
  unitPrice: price(amount, currency),
  quantity,
});

describe("calculateTotal", () => {
  it("sums quantities times unit price", () => {
    const r = calculateTotal([item(4500, 2), item(1000, 1)]);
    expect(isOk(r) && r.value).toEqual({ amount: 10000, currency: "ARS" });
  });

  it("rejects zero or negative quantity", () => {
    expect(isErr(calculateTotal([item(100, 0)]))).toBe(true);
    expect(isErr(calculateTotal([item(100, -1)]))).toBe(true);
  });

  it("rejects mixed currencies", () => {
    const r = calculateTotal([item(100, 1), item(100, 1, "USD")]);
    expect(isErr(r) && r.error.code).toBe("INVALID_PRICE");
  });

  it("rejects an order without items", () => {
    expect(isErr(calculateTotal([]))).toBe(true);
  });
});

describe("canTransition", () => {
  it("follows the flow new → contacted → paid → delivered", () => {
    expect(canTransition("nuevo", "contactado")).toBe(true);
    expect(canTransition("nuevo", "pagado")).toBe(true);
    expect(canTransition("pagado", "entregado")).toBe(true);
  });

  it("allows cancelling from any non-final status", () => {
    expect(canTransition("nuevo", "cancelado")).toBe(true);
    expect(canTransition("pagado", "cancelado")).toBe(true);
  });

  it("does not go back or leave final statuses", () => {
    expect(canTransition("entregado", "nuevo")).toBe(false);
    expect(canTransition("cancelado", "nuevo")).toBe(false);
    expect(canTransition("pagado", "nuevo")).toBe(false);
  });
});

describe("order status", () => {
  it("open statuses are the three before delivery or cancellation", () => {
    expect(ORDER_STATUSES).toEqual(["nuevo", "contactado", "pagado", "entregado", "cancelado"]);
    expect(ORDER_STATUSES.map(isOpen)).toEqual([true, true, true, false, false]);
  });
});
