import type { Session, SessionType, StartedSession } from "../../packages/core/index";
import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";
import { build } from "../../container";
import { CHALLENGE_COOKIE, cookieName, cookieOptions, SESSION_COOKIE } from "../../lib/cookies";
import { accessLimited, notAuthenticated } from "../errors";
import type { ApiEnv } from "../types";

const urlOf = (c: Context) => new URL(c.req.url);

export function setSessionCookie(c: Context, token: string, session: Session): void {
  const url = urlOf(c);
  const seconds = (session.expiresAt.getTime() - Date.now()) / 1000;
  setCookie(c, cookieName(SESSION_COOKIE, url), token, cookieOptions(url, seconds));
}

export const setStartedSession = (c: Context, s: StartedSession) => setSessionCookie(c, s.token, s.session);

export function clearSessionCookie(c: Context): void {
  const url = urlOf(c);
  deleteCookie(c, cookieName(SESSION_COOKIE, url), cookieOptions(url, 0));
}

/** The WebAuthn challenge travels in a 5-minute HttpOnly cookie. */
export function setChallengeCookie(c: Context, challengeId: string): void {
  const url = urlOf(c);
  setCookie(c, cookieName(CHALLENGE_COOKIE, url), challengeId, cookieOptions(url, 5 * 60));
}

export function takeChallengeCookie(c: Context): string | undefined {
  const url = urlOf(c);
  const name = cookieName(CHALLENGE_COOKIE, url);
  const value = getCookie(c, name);
  deleteCookie(c, name, cookieOptions(url, 0));
  return value;
}

/** Reads the session cookie, validates it against D1 and renews it when due. Never cuts the request. */
export const loadSession = createMiddleware<ApiEnv>(async (c, next) => {
  c.set("session", null);
  c.set("sessionToken", null);
  const token = getCookie(c, cookieName(SESSION_COOKIE, urlOf(c)));
  if (token) {
    const r = await build(c.env).access.validateSession(token);
    if (r.ok) {
      c.set("session", r.value.session);
      c.set("sessionToken", token);
      if (r.value.renewed) setSessionCookie(c, token, r.value.session);
    }
  }
  await next();
});

/** No session → 401 NOT_AUTHENTICATED; a session of another type → 403 ACCESS_LIMITED. */
export const requireSession = (...types: SessionType[]) =>
  createMiddleware<ApiEnv>(async (c, next) => {
    const session = c.get("session");
    if (session === null) return notAuthenticated(c);
    if (!types.includes(session.type)) return accessLimited(c);
    await next();
  });

/** The session already validated by `requireSession`. */
export const sessionOf = (c: Context<ApiEnv>): Session => {
  const s = c.get("session");
  if (s === null) throw new Error("requireSession did not run before");
  return s;
};
