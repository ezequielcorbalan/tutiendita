import type { DomainError } from "../../packages/core/index";
import type { Context } from "hono";
import { Hono } from "hono";
import { z } from "zod";
import { build } from "../../container";
import { toCategoryJson } from "../../lib/product-json";
import { errorBody, respondDomainError } from "../errors";
import { requireSession } from "../middlewares/session";
import { templatesSchema, toTemplates } from "../options-schema";
import type { ApiEnv } from "../types";
import { validate } from "../validation";

const categorySchema = z.object({
  name: z.string().max(80, "At most 80 characters"),
  option_templates: templatesSchema.default([]),
});

/** On its own URL a missing category is a 404 (as a product's category_id it stays a 422). */
const respond = (c: Context, e: DomainError) =>
  e.code === "CATEGORY_NOT_FOUND" ? c.json(errorBody(e), 404) : respondDomainError(c, e);

/** Categories with their variant templates. Reading is public (the store's menu); changes, only the owner. */
export const categoryRoutes = new Hono<ApiEnv>()
  .get("/", async (c) => c.json((await build(c.env).listCategories()).map(toCategoryJson)))
  .post("/", requireSession("completa"), validate("json", categorySchema), async (c) => {
    const data = c.req.valid("json");
    const r = await build(c.env).categories.create({
      name: data.name,
      optionTemplates: toTemplates(data.option_templates),
    });
    if (!r.ok) return respond(c, r.error);
    return c.json(toCategoryJson(r.value), 201);
  })
  .put("/:id", requireSession("completa"), validate("json", categorySchema), async (c) => {
    const data = c.req.valid("json");
    const r = await build(c.env).categories.update(c.req.param("id"), {
      name: data.name,
      optionTemplates: toTemplates(data.option_templates),
    });
    if (!r.ok) return respond(c, r.error);
    return c.json(toCategoryJson(r.value));
  })
  .delete("/:id", requireSession("completa"), async (c) => {
    const r = await build(c.env).categories.remove(c.req.param("id"));
    if (!r.ok) return respond(c, r.error);
    return c.json(r.value);
  });
