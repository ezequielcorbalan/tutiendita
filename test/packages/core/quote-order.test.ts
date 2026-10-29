import { beforeEach, describe, expect, it } from "vitest";
import { money } from "../../../src/packages/core/domain/money";
import { isOk } from "../../../src/packages/core/domain/result";
import { createProduct } from "../../../src/packages/core/use-cases/create-product";
import { quoteOrder } from "../../../src/packages/core/use-cases/quote-order";
import {
  FixedClock,
  InMemoryCategoryRepository,
  InMemoryImageStorage,
  InMemoryProductRepository,
  SequentialIdGenerator,
} from "./doubles/in-memory";

const ars = (amount: number) => {
  const r = money(amount, "ARS");
  if (!isOk(r)) throw new Error("fixture");
  return r.value;
};
const png = {
  bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]),
  mimeType: "image/png",
};

let repo: InMemoryProductRepository;
let create: ReturnType<typeof createProduct>;

beforeEach(() => {
  repo = new InMemoryProductRepository();
  create = createProduct({
    repo,
    categories: new InMemoryCategoryRepository(),
    images: new InMemoryImageStorage(),
    clock: new FixedClock(new Date("2026-10-15T12:00:00Z")),
    ids: new SequentialIdGenerator(),
  });
});

async function product(name: string, amount: number, publish = true) {
  const r = await create({ name, price: ars(amount), gallery: [{ upload: 0 }], uploads: [png], publish });
  if (!isOk(r)) throw new Error("fixture");
  return r.value;
}

describe("quoteOrder", () => {
  it("uses the current prices and calculates the total on the server", async () => {
    const torta = await product("Torta", 2800000);
    const alfajores = await product("Alfajores", 750000);
    const r = await quoteOrder({ repo })([
      { productId: torta.id, quantity: 1 },
      { productId: alfajores.id, quantity: 2 },
    ]);
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;
    expect(r.value.total).toEqual(ars(4300000));
    expect(r.value.items.map((i) => [i.name, i.quantity, i.unitPrice.amount])).toEqual([
      ["Torta", 1, 2800000],
      ["Alfajores", 2, 750000],
    ]);
  });

  it("rejects drafts, paused and unknown products", async () => {
    const draft = await product("Budín", 450000, false);
    for (const productId of [draft.id, "nope"]) {
      const r = await quoteOrder({ repo })([{ productId, quantity: 1 }]);
      expect(isOk(r) ? null : r.error.code).toBe("PRODUCT_UNAVAILABLE");
    }
  });

  it("rejects an empty cart and quantities out of range", async () => {
    const torta = await product("Torta", 2800000);
    for (const lines of [
      [],
      [{ productId: torta.id, quantity: 0 }],
      [{ productId: torta.id, quantity: 100 }],
    ]) {
      const r = await quoteOrder({ repo })(lines);
      expect(isOk(r) ? null : r.error.code).toBe("INVALID_CART");
    }
  });
});
