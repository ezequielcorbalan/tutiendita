import type { Sesion, SesionIniciada, TipoSesion } from "../../paquetes/core/index";
import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";
import { armar } from "../../container";
import { COOKIE_DESAFIO, COOKIE_SESION, nombreDeCookie, opcionesDeCookie } from "../../lib/cookies";
import { accesoLimitado, noAutenticado } from "../errores";
import type { EntornoApi } from "../tipos";

const urlDe = (c: Context) => new URL(c.req.url);

export function ponerCookieDeSesion(c: Context, token: string, sesion: Sesion): void {
  const url = urlDe(c);
  const segundos = (sesion.expiraEn.getTime() - Date.now()) / 1000;
  setCookie(c, nombreDeCookie(COOKIE_SESION, url), token, opcionesDeCookie(url, segundos));
}

export const ponerSesionIniciada = (c: Context, s: SesionIniciada) =>
  ponerCookieDeSesion(c, s.token, s.sesion);

export function borrarCookieDeSesion(c: Context): void {
  const url = urlDe(c);
  deleteCookie(c, nombreDeCookie(COOKIE_SESION, url), opcionesDeCookie(url, 0));
}

/** El desafío de WebAuthn viaja en una cookie HttpOnly de 5 minutos. */
export function ponerCookieDeDesafio(c: Context, desafioId: string): void {
  const url = urlDe(c);
  setCookie(c, nombreDeCookie(COOKIE_DESAFIO, url), desafioId, opcionesDeCookie(url, 5 * 60));
}

export function tomarCookieDeDesafio(c: Context): string | undefined {
  const url = urlDe(c);
  const nombre = nombreDeCookie(COOKIE_DESAFIO, url);
  const valor = getCookie(c, nombre);
  deleteCookie(c, nombre, opcionesDeCookie(url, 0));
  return valor;
}

/** Lee la cookie de sesión, la valida contra D1 y la renueva si corresponde. Nunca corta el request. */
export const cargarSesion = createMiddleware<EntornoApi>(async (c, next) => {
  c.set("sesion", null);
  c.set("tokenDeSesion", null);
  const token = getCookie(c, nombreDeCookie(COOKIE_SESION, urlDe(c)));
  if (token) {
    const r = await armar(c.env).acceso.validarSesion(token);
    if (r.ok) {
      c.set("sesion", r.valor.sesion);
      c.set("tokenDeSesion", token);
      if (r.valor.renovada) ponerCookieDeSesion(c, token, r.valor.sesion);
    }
  }
  await next();
});

/** Sin sesión → 401 NO_AUTENTICADO; con una sesión de otro tipo → 403 ACCESO_LIMITADO. */
export const requiereSesion = (...tipos: TipoSesion[]) =>
  createMiddleware<EntornoApi>(async (c, next) => {
    const sesion = c.get("sesion");
    if (sesion === null) return noAutenticado(c);
    if (!tipos.includes(sesion.tipo)) return accesoLimitado(c);
    await next();
  });

/** La sesión ya validada por `requiereSesion`. */
export const sesionDe = (c: Context<EntornoApi>): Sesion => {
  const s = c.get("sesion");
  if (s === null) throw new Error("requiereSesion no corrió antes");
  return s;
};
