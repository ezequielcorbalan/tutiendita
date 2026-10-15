/**
 * Cookies del panel (sesión y desafío de WebAuthn): `HttpOnly`, `SameSite=Lax`, `Path=/` y, en HTTPS o
 * cualquier host que no sea local, prefijo `__Host-` con `Secure`. En `http://localhost` (y 127.0.0.1)
 * van sin prefijo ni `Secure`: Chrome y Firefox aceptarían `__Host-` ahí, pero Safari no guarda cookies
 * `Secure` en http. Fuera de localhost un http nunca recibe la cookie (el navegador la descarta).
 */
export const COOKIE_SESION = "tiendita_sesion";
export const COOKIE_DESAFIO = "tiendita_desafio";

const HOSTS_LOCALES = new Set(["localhost", "127.0.0.1", "[::1]"]);

export const esDesarrolloLocal = (url: URL): boolean =>
  url.protocol === "http:" && HOSTS_LOCALES.has(url.hostname);

export const nombreDeCookie = (base: string, url: URL): string =>
  esDesarrolloLocal(url) ? base : `__Host-${base}`;

export type OpcionesDeCookie = {
  path: "/";
  httpOnly: true;
  sameSite: "Lax";
  secure: boolean;
  maxAge: number;
};

export const opcionesDeCookie = (url: URL, maxAgeSegundos: number): OpcionesDeCookie => ({
  path: "/",
  httpOnly: true,
  sameSite: "Lax",
  secure: !esDesarrolloLocal(url),
  maxAge: Math.max(0, Math.round(maxAgeSegundos)),
});
