import { Hono } from "hono";
import { z } from "zod";
import { build } from "../../container";
import { respondDomainError } from "../errors";
import { requireSession } from "../middlewares/session";
import type { ApiEnv } from "../types";
import { validate } from "../validation";

/** The store's own domain (Configuración). Owner only. */
const ownerOnly = requireSession("completa");
const hostnameBody = validate("json", z.object({ hostname: z.string().min(1).max(300) }));

export const domainRoutes = new Hono<ApiEnv>()
  .post("/check", ownerOnly, hostnameBody, async (c) => {
    const r = await build(c.env).domain.check(c.req.valid("json").hostname);
    return r.ok ? c.json(r.value) : respondDomainError(c, r.error);
  })
  .post("/connect", ownerOnly, hostnameBody, async (c) => {
    const r = await build(c.env).domain.connect(c.req.valid("json").hostname);
    return r.ok ? c.json(r.value) : respondDomainError(c, r.error);
  })
  .post("/disconnect", ownerOnly, async (c) => {
    const r = await build(c.env).domain.disconnect();
    return r.ok ? c.json(r.value) : respondDomainError(c, r.error);
  });

/**
 * WebAuthn Related Origin Requests: the store's own domain may use the passkeys of the primary origin (their
 * rpId is the workers.dev host). Browsers read this file from the rpId's host; it's also how the panel checks
 * that the domain already answers as this store.
 */
export const wellKnownRoutes = new Hono<ApiEnv>().get("/webauthn", async (c) => {
  const origins = (await build(c.env).allowedOriginsDetail()).filter((o) => !o.primary).map((o) => o.origin);
  return c.json({ origins }, 200, { "cache-control": "no-store" });
});
