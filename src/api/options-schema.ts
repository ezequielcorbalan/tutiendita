import { MAX_OPTION_LABEL_LENGTH, MAX_OPTION_VALUES, MAX_OPTIONS } from "../packages/core/index";
import { z } from "zod";

// Shape only (sizes, whole numbers); trimming, duplicates and empty names are rules of core (INVALID_OPTIONS).
const label = z.string().max(MAX_OPTION_LABEL_LENGTH * 2, "Too long");
const priceDelta = z
  .number()
  .int("Must be a whole number in the minor unit")
  .refine(Number.isSafeInteger, "Out of range");

export const templatesSchema = z
  .array(
    z.object({
      name: label,
      values: z.array(z.object({ label, price_delta: priceDelta })).max(MAX_OPTION_VALUES),
    }),
  )
  .max(MAX_OPTIONS);

/** A product photo: one the product already has (by key) or a file sent with the request (by index). */
export const MAX_UPLOADS = 8;
const photoRef = z.union([
  z.strictObject({ key: z.string().min(1).max(128) }),
  z.strictObject({
    upload: z
      .number()
      .int()
      .min(0)
      .max(MAX_UPLOADS - 1),
  }),
]);

/** The `gallery` multipart field: JSON text, the product's photos in order. */
export const galleryField = z
  .string()
  .max(20_000)
  .transform((text, ctx) => {
    try {
      return JSON.parse(text) as unknown;
    } catch {
      ctx.addIssue({ code: "custom", message: "Must be JSON" });
      return z.NEVER;
    }
  })
  .pipe(z.array(photoRef).max(MAX_UPLOADS));

const optionsSchema = z
  .array(
    z.object({
      id: z.string().max(64).optional(),
      name: label,
      values: z
        .array(
          z.object({
            id: z.string().max(64).optional(),
            label,
            price_delta: priceDelta,
            // null removes the value's photo; omitted keeps it.
            image_ref: photoRef.nullable().optional(),
          }),
        )
        .max(MAX_OPTION_VALUES),
    }),
  )
  .max(MAX_OPTIONS);

/** The `options` multipart field: JSON text. New options and values come without id. */
export const optionsField = z
  .string()
  .max(20_000)
  .transform((text, ctx) => {
    try {
      return JSON.parse(text) as unknown;
    } catch {
      ctx.addIssue({ code: "custom", message: "Must be JSON" });
      return z.NEVER;
    }
  })
  .pipe(optionsSchema)
  .transform((options) =>
    options.map((o) => ({
      id: o.id ?? "",
      name: o.name,
      values: o.values.map((v) => ({
        id: v.id ?? "",
        label: v.label,
        priceDelta: v.price_delta,
        ...(v.image_ref !== undefined ? { imageRef: v.image_ref } : {}),
      })),
    })),
  );

export const toTemplates = (t: z.infer<typeof templatesSchema>) =>
  t.map((o) => ({
    name: o.name,
    values: o.values.map((v) => ({ label: v.label, priceDelta: v.price_delta })),
  }));
