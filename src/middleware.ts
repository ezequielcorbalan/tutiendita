import { defineMiddleware } from "astro:middleware";
import { env } from "cloudflare:workers";
import { IDIOMA_POR_DEFECTO } from "./paquetes/core/index";
import { api, RUTAS_API } from "./api/app";
import { armar } from "./container";
import { COOKIE_SESION, nombreDeCookie, opcionesDeCookie } from "./lib/cookies";
import { METODOS_SEGUROS, origenAceptado } from "./lib/origen";
import { decidirRutaDelPanel } from "./lib/panel";

const RUTA_PANEL = /^\/panel(\/|$)/;

/** Cabeceras de todas las respuestas del panel. */
function conCabecerasDelPanel(respuesta: Response): Response {
  const r = new Response(respuesta.body, respuesta);
  r.headers.set("cache-control", "no-store");
  r.headers.set("referrer-policy", "same-origin");
  r.headers.set("x-frame-options", "DENY");
  return r;
}

/**
 * Astro manda: las rutas de máquina las atiende Hono. Desde Astro 6 el `env` del Worker se
 * importa de `cloudflare:workers` y el ExecutionContext está en `locals.cfContext`. Además protege
 * /panel/*: origen permitido en métodos inseguros y redirecciones según estado y sesión (§6.1).
 */
export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;
  if (RUTAS_API.test(pathname)) {
    return api.fetch(context.request, env, context.locals.cfContext);
  }
  const contenedor = armar(env);
  context.locals.idioma = (await contenedor.obtenerTienda())?.idioma ?? IDIOMA_POR_DEFECTO;
  if (!RUTA_PANEL.test(pathname)) return next();

  if (
    !METODOS_SEGUROS.has(context.request.method) &&
    !origenAceptado(context.request, await contenedor.origenesPermitidos())
  ) {
    return conCabecerasDelPanel(Response.json({ error: { codigo: "ORIGEN_NO_PERMITIDO" } }, { status: 403 }));
  }

  const estado = await contenedor.estadoDeLaTienda();
  const nombre = nombreDeCookie(COOKIE_SESION, context.url);
  const token = context.cookies.get(nombre)?.value;
  const validada = token ? await contenedor.acceso.validarSesion(token) : null;
  const sesion = validada?.ok ? validada.valor.sesion : null;
  if (token && validada?.ok && validada.valor.renovada) {
    const o = opcionesDeCookie(context.url, (validada.valor.sesion.expiraEn.getTime() - Date.now()) / 1000);
    context.cookies.set(nombre, token, { ...o, sameSite: "lax" });
  }

  const decision = decidirRutaDelPanel({ estado, sesion: sesion?.tipo ?? null, ruta: pathname });
  if (decision.tipo === "redirigir") {
    return conCabecerasDelPanel(new Response(null, { status: 303, headers: { location: decision.a } }));
  }
  context.locals.panel = { estado, sesion: sesion?.tipo ?? null };
  return conCabecerasDelPanel(await next());
});
