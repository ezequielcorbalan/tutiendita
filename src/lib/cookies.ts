/**
 * Panel cookies (session and WebAuthn challenge): `HttpOnly`, `SameSite=Lax`, `Path=/` and, on HTTPS or
 * any non-local host, the `__Host-` prefix with `Secure`. On `http://localhost` (and 127.0.0.1) they go
 * without prefix or `Secure`: Chrome and Firefox would accept `__Host-` there, but Safari doesn't keep
 * `Secure` cookies over http. Outside localhost, http never gets the cookie (the browser drops it).
 * The cookie names stay in Spanish: deployed stores' browsers already have them.
 */
export const SESSION_COOKIE = "tiendita_sesion";
export const CHALLENGE_COOKIE = "tiendita_desafio";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export const isLocalDev = (url: URL): boolean => url.protocol === "http:" && LOCAL_HOSTS.has(url.hostname);

export const cookieName = (base: string, url: URL): string => (isLocalDev(url) ? base : `__Host-${base}`);

export type CookieOptions = {
  path: "/";
  httpOnly: true;
  sameSite: "Lax";
  secure: boolean;
  maxAge: number;
};

export const cookieOptions = (url: URL, maxAgeSeconds: number): CookieOptions => ({
  path: "/",
  httpOnly: true,
  sameSite: "Lax",
  secure: !isLocalDev(url),
  maxAge: Math.max(0, Math.round(maxAgeSeconds)),
});
