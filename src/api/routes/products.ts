import { money } from "../../packages/core/index";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import { build } from "../../container";
import { toProductJson } from "../../lib/product-json";
import { type ErrorBody, respondDomainError } from "../errors";
import { requireSession } from "../middlewares/session";
import type { ApiEnv } from "../types";
import { validate } from "../validation";
import { verifyImage } from "../verify-image";

/** Body cap for creation: the image (max 5 MB) plus the other fields. */
export const MAX_BODY_SIZE = 6 * 1024 * 1024;
export const MAX_NAME_LENGTH = 120;
export const MAX_DESCRIPTION_LENGTH = 5000;

/** Multipart fields of POST /api/products. Numbers arrive as text: they're validated as text. */
const creationSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Name is required")
    .max(MAX_NAME_LENGTH, `At most ${MAX_NAME_LENGTH} characters`),
  description: z
    .string()
    .max(MAX_DESCRIPTION_LENGTH, `At most ${MAX_DESCRIPTION_LENGTH} characters`)
    .optional(),
  price_amount: z
    .string()
    .regex(/^\d+$/, "Must be an integer greater than or equal to zero in the minor unit (cents)")
    .transform(Number)
    .refine(Number.isSafeInteger, "Amount out of range"),
  price_currency: z.string().regex(/^[A-Z]{3}$/, "Must be a three-letter ISO 4217 code (e.g. ARS)"),
  publish: z
    .enum(["true", "false"], { message: 'Must be "true" or "false"' })
    .optional()
    .transform((v) => v === "true"),
  image: z.instanceof(File, { message: "Must be a file" }).optional(),
});

export const productRoutes = new Hono<ApiEnv>()
  .get("/", async (c) => {
    const products = await build(c.env).listProducts();
    return c.json(products.map(toProductJson));
  })
  .get("/:slug", async (c) => {
    const r = await build(c.env).getProduct(c.req.param("slug"));
    if (!r.ok) return respondDomainError(c, r.error);
    return c.json(toProductJson(r.value));
  })
  .post(
    "/",
    // Only the owner, with a full session. The app already required the origin.
    requireSession("completa"),
    bodyLimit({
      maxSize: MAX_BODY_SIZE,
      onError: (c) =>
        c.json<ErrorBody>(
          {
            error: {
              code: "BODY_TOO_LARGE",
              // The panel has no text for this code and shows this message as is: it stays in Spanish.
              message: "El cuerpo de la solicitud supera el máximo",
              details: { max: MAX_BODY_SIZE },
            },
          },
          413,
        ),
    }),
    validate("form", creationSchema, "Invalid product data"),
    async (c) => {
      const data = c.req.valid("form");
      const price = money(data.price_amount, data.price_currency);
      if (!price.ok) return respondDomainError(c, price.error);
      let image: { bytes: Uint8Array; mimeType: string } | undefined;
      if (data.image !== undefined) {
        image = { bytes: new Uint8Array(await data.image.arrayBuffer()), mimeType: data.image.type };
        const problem = verifyImage(data.image.name, image.mimeType);
        if (problem !== null) return respondDomainError(c, problem);
      }
      const r = await build(c.env).createProduct({
        name: data.name,
        price: price.value,
        publish: data.publish,
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(image !== undefined ? { image } : {}),
      });
      if (!r.ok) return respondDomainError(c, r.error);
      return c.json(toProductJson(r.value), 201);
    },
  );
