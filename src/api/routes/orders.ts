import { MAX_CART_LINES, MAX_QUANTITY } from "../../packages/core/index";
import { Hono } from "hono";
import { z } from "zod";
import { build } from "../../container";
import { respondDomainError } from "../errors";
import type { ApiEnv } from "../types";
import { validate } from "../validation";

const quoteSchema = z.object({
  items: z
    .array(
      z.object({
        product_id: z.string().max(64),
        quantity: z.number().int().min(1).max(MAX_QUANTITY),
        // Option id → value id, one per option of the product.
        selection: z
          .record(z.string().max(64), z.string().max(64))
          .refine((s) => Object.keys(s).length <= 10, "Too many options")
          .optional(),
      }),
    )
    .min(1)
    .max(MAX_CART_LINES),
});

/** Orders from the public store. For now only the quote: the cart priced on the server before sending it by WhatsApp. */
export const orderRoutes = new Hono<ApiEnv>().post("/quote", validate("json", quoteSchema), async (c) => {
  const r = await build(c.env).quoteOrder(
    c.req.valid("json").items.map((i) => ({
      productId: i.product_id,
      quantity: i.quantity,
      ...(i.selection !== undefined ? { selection: i.selection } : {}),
    })),
  );
  if (!r.ok) return respondDomainError(c, r.error);
  return c.json({
    items: r.value.items.map((i) => ({
      product_id: i.productId,
      name: i.name,
      variant: i.variant ?? null,
      quantity: i.quantity,
      unit_price: i.unitPrice,
    })),
    total: r.value.total,
  });
});
