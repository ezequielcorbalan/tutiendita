import type { Credential } from "../../packages/core/index";
import { Hono } from "hono";
import { z } from "zod";
import { build } from "../../container";
import { deviceName } from "../../lib/device";
import { respondDomainError } from "../errors";
import {
  clearSessionCookie,
  requireSession,
  sessionOf,
  setChallengeCookie,
  setStartedSession,
  takeChallengeCookie,
} from "../middlewares/session";
import type { ApiEnv } from "../types";
import { validate } from "../validation";

const codeSchema = z.object({ code: z.string().max(100) });
/** SimpleWebAuthn verifies the browser's response; here it only has to have an id. */
const responseSchema = z.object({ response: z.looseObject({ id: z.string().min(1).max(1024) }) });

const toPasskeyJson = (c: Credential) => ({
  id: c.id,
  name: c.name,
  createdAt: c.createdAt.toISOString(),
  lastUsedAt: c.lastUsedAt?.toISOString() ?? null,
  backedUp: c.backedUp,
});

// "desconocida" ends up in D1 rate-limit keys (`ingreso:<ip>`): stored value, kept as is.
const ipOf = (req: Request) => req.headers.get("cf-connecting-ip") ?? "desconocida";
const originOf = (url: string) => new URL(url).origin;

/** /api/access: claim, passkeys, sign-in, sign-out and recovery code. Session types are stored literals. */
export const accessRoutes = new Hono<ApiEnv>()
  .post("/claim", validate("json", codeSchema), async (c) => {
    const r = await build(c.env).access.validateClaimCode({
      code: c.req.valid("json").code,
      ip: ipOf(c.req.raw),
    });
    if (!r.ok) return respondDomainError(c, r.error);
    setStartedSession(c, r.value);
    return c.json({ session: r.value.session.type });
  })

  .post("/passkeys/options", requireSession("reclamo", "recuperacion", "completa"), async (c) => {
    const r = await build(c.env).access.startPasskeyRegistration({
      session: sessionOf(c),
      origin: originOf(c.req.url),
    });
    if (!r.ok) return respondDomainError(c, r.error);
    setChallengeCookie(c, r.value.challengeId);
    return c.json(r.value.options as object);
  })

  .post(
    "/passkeys",
    requireSession("reclamo", "recuperacion", "completa"),
    validate("json", responseSchema),
    async (c) => {
      const r = await build(c.env).access.finishPasskeyRegistration({
        session: sessionOf(c),
        origin: originOf(c.req.url),
        challengeId: takeChallengeCookie(c),
        response: c.req.valid("json").response,
        deviceName: deviceName(c.req.header("user-agent")),
      });
      if (!r.ok) return respondDomainError(c, r.error);
      if (r.value.rotatedSession) setStartedSession(c, r.value.rotatedSession);
      return c.json({ passkey: toPasskeyJson(r.value.credential), recoveryCode: r.value.recoveryCode }, 201);
    },
  )

  .get("/passkeys", requireSession("completa"), async (c) => {
    const passkeys = await build(c.env).access.listPasskeys();
    return c.json(passkeys.map(toPasskeyJson));
  })

  .delete("/passkeys/:id", requireSession("completa"), async (c) => {
    const r = await build(c.env).access.deletePasskey(c.req.param("id"));
    if (!r.ok) return respondDomainError(c, r.error);
    return c.body(null, 204);
  })

  .post("/sign-in/options", async (c) => {
    const r = await build(c.env).access.startSignIn({ origin: originOf(c.req.url), ip: ipOf(c.req.raw) });
    if (!r.ok) return respondDomainError(c, r.error);
    setChallengeCookie(c, r.value.challengeId);
    return c.json(r.value.options as object);
  })

  .post("/sign-in", validate("json", responseSchema), async (c) => {
    const { response } = c.req.valid("json");
    const r = await build(c.env).access.finishSignIn({
      origin: originOf(c.req.url),
      challengeId: takeChallengeCookie(c),
      credentialId: response.id,
      response,
    });
    if (!r.ok) return respondDomainError(c, r.error);
    setStartedSession(c, r.value);
    return c.json({ session: r.value.session.type });
  })

  .post("/sign-out", async (c) => {
    const session = c.get("session");
    if (session !== null) await build(c.env).access.signOut(session.idHash);
    clearSessionCookie(c);
    return c.body(null, 204);
  })

  .post("/recovery", validate("json", codeSchema), async (c) => {
    const r = await build(c.env).access.signInWithRecoveryCode({
      code: c.req.valid("json").code,
      ip: ipOf(c.req.raw),
    });
    if (!r.ok) return respondDomainError(c, r.error);
    setStartedSession(c, r.value);
    return c.json({ session: r.value.session.type });
  })

  .post("/recovery-code", requireSession("completa"), async (c) => {
    const recoveryCode = await build(c.env).access.regenerateRecoveryCode();
    return c.json({ recoveryCode });
  });
