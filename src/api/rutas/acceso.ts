import type { Credencial } from "../../paquetes/core/index";
import { Hono } from "hono";
import { z } from "zod";
import { armar } from "../../container";
import { nombreDeDispositivo } from "../../lib/dispositivo";
import { responderErrorDeDominio } from "../errores";
import {
  borrarCookieDeSesion,
  ponerCookieDeDesafio,
  ponerSesionIniciada,
  requiereSesion,
  sesionDe,
  tomarCookieDeDesafio,
} from "../middlewares/sesion";
import type { EntornoApi } from "../tipos";
import { validar } from "../validacion";

const esquemaCodigo = z.object({ codigo: z.string().max(100) });
/** La respuesta del navegador la verifica SimpleWebAuthn; acá solo se exige que tenga un id. */
const esquemaRespuesta = z.object({ respuesta: z.looseObject({ id: z.string().min(1).max(1024) }) });

const aPasskeyJson = (c: Credencial) => ({
  id: c.id,
  nombre: c.nombre,
  creadaEn: c.creadaEn.toISOString(),
  ultimoUsoEn: c.ultimoUsoEn?.toISOString() ?? null,
  respaldada: c.respaldada,
});

const ipDe = (req: Request) => req.headers.get("cf-connecting-ip") ?? "desconocida";
const origenDe = (url: string) => new URL(url).origin;

/** /api/acceso: reclamo, passkeys, ingreso, salida y código de recuperación. */
export const rutasAcceso = new Hono<EntornoApi>()
  .post("/reclamo", validar("json", esquemaCodigo), async (c) => {
    const r = await armar(c.env).acceso.validarCodigoDeReclamo({
      codigo: c.req.valid("json").codigo,
      ip: ipDe(c.req.raw),
    });
    if (!r.ok) return responderErrorDeDominio(c, r.error);
    ponerSesionIniciada(c, r.valor);
    return c.json({ sesion: r.valor.sesion.tipo });
  })

  .post("/passkeys/opciones", requiereSesion("reclamo", "recuperacion", "completa"), async (c) => {
    const r = await armar(c.env).acceso.iniciarRegistroDePasskey({
      sesion: sesionDe(c),
      origen: origenDe(c.req.url),
    });
    if (!r.ok) return responderErrorDeDominio(c, r.error);
    ponerCookieDeDesafio(c, r.valor.desafioId);
    return c.json(r.valor.opciones as object);
  })

  .post(
    "/passkeys",
    requiereSesion("reclamo", "recuperacion", "completa"),
    validar("json", esquemaRespuesta),
    async (c) => {
      const r = await armar(c.env).acceso.completarRegistroDePasskey({
        sesion: sesionDe(c),
        origen: origenDe(c.req.url),
        desafioId: tomarCookieDeDesafio(c),
        respuesta: c.req.valid("json").respuesta,
        nombreDispositivo: nombreDeDispositivo(c.req.header("user-agent")),
      });
      if (!r.ok) return responderErrorDeDominio(c, r.error);
      if (r.valor.sesionNueva) ponerSesionIniciada(c, r.valor.sesionNueva);
      return c.json(
        { passkey: aPasskeyJson(r.valor.credencial), codigoDeRecuperacion: r.valor.codigoDeRecuperacion },
        201,
      );
    },
  )

  .get("/passkeys", requiereSesion("completa"), async (c) => {
    const passkeys = await armar(c.env).acceso.listarPasskeys();
    return c.json(passkeys.map(aPasskeyJson));
  })

  .delete("/passkeys/:id", requiereSesion("completa"), async (c) => {
    const r = await armar(c.env).acceso.borrarPasskey(c.req.param("id"));
    if (!r.ok) return responderErrorDeDominio(c, r.error);
    return c.body(null, 204);
  })

  .post("/ingreso/opciones", async (c) => {
    const r = await armar(c.env).acceso.iniciarIngreso({ origen: origenDe(c.req.url), ip: ipDe(c.req.raw) });
    if (!r.ok) return responderErrorDeDominio(c, r.error);
    ponerCookieDeDesafio(c, r.valor.desafioId);
    return c.json(r.valor.opciones as object);
  })

  .post("/ingreso", validar("json", esquemaRespuesta), async (c) => {
    const { respuesta } = c.req.valid("json");
    const r = await armar(c.env).acceso.completarIngreso({
      origen: origenDe(c.req.url),
      desafioId: tomarCookieDeDesafio(c),
      credencialId: respuesta.id,
      respuesta,
    });
    if (!r.ok) return responderErrorDeDominio(c, r.error);
    ponerSesionIniciada(c, r.valor);
    return c.json({ sesion: r.valor.sesion.tipo });
  })

  .post("/salir", async (c) => {
    const sesion = c.get("sesion");
    if (sesion !== null) await armar(c.env).acceso.cerrarSesion(sesion.idHash);
    borrarCookieDeSesion(c);
    return c.body(null, 204);
  })

  .post("/recuperacion", validar("json", esquemaCodigo), async (c) => {
    const r = await armar(c.env).acceso.ingresarConCodigoDeRecuperacion({
      codigo: c.req.valid("json").codigo,
      ip: ipDe(c.req.raw),
    });
    if (!r.ok) return responderErrorDeDominio(c, r.error);
    ponerSesionIniciada(c, r.valor);
    return c.json({ sesion: r.valor.sesion.tipo });
  })

  .post("/codigo-de-recuperacion", requiereSesion("completa"), async (c) => {
    const codigoDeRecuperacion = await armar(c.env).acceso.regenerarCodigoDeRecuperacion();
    return c.json({ codigoDeRecuperacion });
  });
