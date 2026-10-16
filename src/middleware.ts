import { defineMiddleware } from "astro:middleware";
import { env } from "cloudflare:workers";
import { DEFAULT_LANGUAGE } from "./packages/core/index";
import { API_ROUTES, api } from "./api/app";
import { build } from "./container";
import { cookieName, cookieOptions, isLocalDev, SESSION_COOKIE } from "./lib/cookies";
import { acceptedOrigin, SAFE_METHODS } from "./lib/origin";
import { decidePanelRoute } from "./lib/panel";

const PANEL_PATH = /^\/panel(\/|$)/;

/** Headers of every panel response. */
function withPanelHeaders(response: Response): Response {
  const r = new Response(response.body, response);
  r.headers.set("cache-control", "no-store");
  r.headers.set("referrer-policy", "same-origin");
  r.headers.set("x-frame-options", "DENY");
  return r;
}

/**
 * Astro is in charge: Hono handles the machine routes. Since Astro 6 the Worker's `env` is imported
 * from `cloudflare:workers` and the ExecutionContext is in `locals.cfContext`. It also protects
 * /panel/*: allowed origin on unsafe methods and redirects by status and session (§6.1).
 */
export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;
  if (API_ROUTES.test(pathname)) {
    return api.fetch(context.request, env, context.locals.cfContext);
  }
  // Local development skips the claim and onboarding; the dynamic import keeps it out of the build. The host
  // comes from the Host header: only the dev server's socket check (integrations/loopback.mjs) is trusted.
  const localDev =
    import.meta.env.DEV &&
    isLocalDev(context.url) &&
    context.request.headers.get("x-tiendita-loopback") === "1"
      ? await import("./dev/local-owner")
      : null;
  await localDev?.ensureLocalOwner(env, context.url);
  const container = build(env);
  context.locals.language = (await container.getStore())?.language ?? DEFAULT_LANGUAGE;
  if (!PANEL_PATH.test(pathname)) return next();

  if (
    !SAFE_METHODS.has(context.request.method) &&
    !acceptedOrigin(context.request, await container.allowedOrigins())
  ) {
    return withPanelHeaders(Response.json({ error: { code: "ORIGIN_NOT_ALLOWED" } }, { status: 403 }));
  }

  const status = await container.storeStatus();
  const name = cookieName(SESSION_COOKIE, context.url);
  const token = context.cookies.get(name)?.value;
  const validated = token ? await container.access.validateSession(token) : null;
  let session = validated?.ok ? validated.value.session : null;
  if (token && validated?.ok && validated.value.renewed) {
    const o = cookieOptions(context.url, (validated.value.session.expiresAt.getTime() - Date.now()) / 1000);
    context.cookies.set(name, token, { ...o, sameSite: "lax" });
  }
  if (localDev && session === null) {
    const local = await localDev.startLocalSession(env);
    session = local.session;
    const o = cookieOptions(context.url, (session.expiresAt.getTime() - Date.now()) / 1000);
    context.cookies.set(name, local.token, { ...o, sameSite: "lax" });
  }

  const decision = decidePanelRoute({ status, session: session?.type ?? null, path: pathname });
  if (decision.type === "redirect") {
    return withPanelHeaders(new Response(null, { status: 303, headers: { location: decision.to } }));
  }
  context.locals.panel = { status, session: session?.type ?? null };
  return withPanelHeaders(await next());
});
