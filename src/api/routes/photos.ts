import { Hono } from "hono";
import { build } from "../../container";
import { respondDomainError } from "../errors";
import { requireSession } from "../middlewares/session";
import type { ApiEnv } from "../types";

/** Photo storage (Configuración): basic in D1 or professional in R2. Owner only. */
const ownerOnly = requireSession("completa");

export const photoRoutes = new Hono<ApiEnv>()
  .get("/status", ownerOnly, async (c) => c.json(await build(c.env).photos.status()))
  .post("/enable", ownerOnly, async (c) => {
    const r = await build(c.env).photos.enable();
    return r.ok ? c.json(r.value) : respondDomainError(c, r.error);
  })
  .post("/revert", ownerOnly, async (c) => {
    const r = await build(c.env).photos.revert();
    return r.ok ? c.json({}) : respondDomainError(c, r.error);
  });
