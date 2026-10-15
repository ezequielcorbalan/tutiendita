import { SAMPLE_INDUSTRIES } from "../../packages/core/index";
import { Hono } from "hono";
import { z } from "zod";
import { build } from "../../container";
import { respondDomainError } from "../errors";
import { requireSession } from "../middlewares/session";
import type { ApiEnv } from "../types";
import { validate } from "../validation";

/** Sample products per industry: load them (idempotent) and delete them all. Owner only; the app already required the origin. */
const ownerOnly = requireSession("completa");

export const sampleRoutes = new Hono<ApiEnv>()
  .post(
    "/",
    ownerOnly,
    validate("json", z.object({ industry: z.enum(SAMPLE_INDUSTRIES, { message: "Unknown industry" }) })),
    async (c) => {
      const r = await build(c.env).samples.load(c.req.valid("json").industry, new URL(c.req.url).origin);
      if (!r.ok) return respondDomainError(c, r.error);
      return c.json(r.value);
    },
  )
  .delete("/", ownerOnly, async (c) => c.json(await build(c.env).samples.remove()));
