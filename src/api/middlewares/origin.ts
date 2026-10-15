import { createMiddleware } from "hono/factory";
import { build } from "../../container";
import { acceptedOrigin, SAFE_METHODS } from "../../lib/origin";
import { originNotAllowed } from "../errors";
import type { ApiEnv } from "../types";

/** CSRF: on every unsafe method of /api/* the origin must be our own and allowed. */
export const requireAllowedOrigin = createMiddleware<ApiEnv>(async (c, next) => {
  if (SAFE_METHODS.has(c.req.method)) return next();
  if (!acceptedOrigin(c.req.raw, await build(c.env).allowedOrigins())) return originNotAllowed(c);
  await next();
});
