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
  // Empty means "no category".
  category_id: z
    .string()
    .max(64)
    .optional()
    .transform((v) => (v ? v : null)),
});

/** Multipart fields of PUT /api/products/:id: the whole product (the panel sends the full form). */
const updateSchema = creationSchema.omit({ publish: true }).extend({
  description: z.string().max(MAX_DESCRIPTION_LENGTH, `At most ${MAX_DESCRIPTION_LENGTH} characters`),
  // Stored in D1 in Spanish: published, paused, draft.
  status: z.enum(["publicado", "pausado", "borrador"], { message: "Unknown status" }),
});

const bodyCap = bodyLimit({
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
});

/** Reads and checks the uploaded photo, if any. */
async function readImage(file: File | undefined) {
  if (file === undefined) return { ok: true as const, image: undefined };
  const image = { bytes: new Uint8Array(await file.arrayBuffer()), mimeType: file.type };
  const problem = verifyImage(file.name, image.mimeType);
  return problem === null ? { ok: true as const, image } : { ok: false as const, problem };
}

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
    bodyCap,
    validate("form", creationSchema, "Invalid product data"),
    async (c) => {
      const data = c.req.valid("form");
      const price = money(data.price_amount, data.price_currency);
      if (!price.ok) return respondDomainError(c, price.error);
      const read = await readImage(data.image);
      if (!read.ok) return respondDomainError(c, read.problem);
      const r = await build(c.env).createProduct({
        name: data.name,
        price: price.value,
        publish: data.publish,
        categoryId: data.category_id,
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(read.image !== undefined ? { image: read.image } : {}),
      });
      if (!r.ok) return respondDomainError(c, r.error);
      return c.json(toProductJson(r.value), 201);
    },
  )
  .put(
    "/:id",
    requireSession("completa"),
    bodyCap,
    validate("form", updateSchema, "Invalid product data"),
    async (c) => {
      const data = c.req.valid("form");
      const price = money(data.price_amount, data.price_currency);
      if (!price.ok) return respondDomainError(c, price.error);
      const read = await readImage(data.image);
      if (!read.ok) return respondDomainError(c, read.problem);
      const r = await build(c.env).updateProduct(c.req.param("id"), {
        name: data.name,
        description: data.description,
        price: price.value,
        categoryId: data.category_id,
        status: data.status,
        ...(read.image !== undefined ? { image: read.image } : {}),
      });
      if (!r.ok) return respondDomainError(c, r.error);
      return c.json(toProductJson(r.value));
    },
  )
  .delete("/:id", requireSession("completa"), async (c) => {
    const r = await build(c.env).deleteProduct(c.req.param("id"));
    if (!r.ok) return respondDomainError(c, r.error);
    return c.json(r.value);
  });
