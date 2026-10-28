import { Hono } from "hono";
import { z } from "zod";
import { build } from "../../container";
import { STORE_VERSION } from "../../version";
import { notFound, respondDomainError } from "../errors";
import { requireSession } from "../middlewares/session";
import type { ApiEnv } from "../types";
import { validate } from "../validation";

/** Updating the store from the panel: the person prepares the PR and decides whether to apply it. Owner only. */
const ownerOnly = requireSession("completa");

export const updatesRoutes = new Hono<ApiEnv>()
  // Hosted plan: the hosting service redeploys the store, so there is no PR to prepare or apply.
  .post("/hosted", ownerOnly, async (c) => {
    const hosted = build(c.env).updates.hosted;
    if (!hosted) return notFound(c);
    const r = await hosted.request();
    if (!r.ok) return respondDomainError(c, r.error);
    return c.json({ requested: true }, 202);
  })
  .post("/prepare", ownerOnly, async (c) => {
    const r = await build(c.env).updates.prepare(STORE_VERSION);
    if (!r.ok) return respondDomainError(c, r.error);
    return c.json(r.value);
  })
  .post(
    "/apply",
    ownerOnly,
    validate("json", z.object({ number: z.number().int().positive() })),
    async (c) => {
      const r = await build(c.env).updates.apply(c.req.valid("json").number);
      if (!r.ok) return respondDomainError(c, r.error);
      return c.json(r.value);
    },
  );
