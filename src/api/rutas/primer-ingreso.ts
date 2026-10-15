import { PASOS_DEL_PRIMER_INGRESO } from "../../paquetes/core/index";
import { Hono } from "hono";
import { z } from "zod";
import { armar } from "../../container";
import { responderErrorDeDominio } from "../errores";
import { requiereSesion } from "../middlewares/sesion";
import type { EntornoApi } from "../tipos";
import { validar } from "../validacion";

/** Pantallas 2 a 5 del primer ingreso y el avance entre pasos. Todo con sesión completa. */
const soloElDueno = requiereSesion("completa");

const esquemaPaso = z.object({
  paso: z.enum(PASOS_DEL_PRIMER_INGRESO as [string, ...string[]], { message: "Paso desconocido" }),
  salteado: z.boolean().optional(),
});

// El idioma lo valida el core (IDIOMA_INVALIDO); acá solo se acota el largo.
const idioma = z.string().max(10);

export const rutasTienda = new Hono<EntornoApi>()
  .put(
    "/",
    soloElDueno,
    validar("json", z.object({ nombre: z.string().max(200), idioma: idioma.optional() })),
    async (c) => {
      const { nombre, idioma } = c.req.valid("json");
      const r = await armar(c.env).primerIngreso.guardarNombreDeLaTienda({
        nombre,
        ...(idioma !== undefined ? { idioma } : {}),
      });
      if (!r.ok) return responderErrorDeDominio(c, r.error);
      return c.json({ nombre: r.valor.nombre, moneda: r.valor.moneda, idioma: r.valor.idioma });
    },
  )
  .put("/idioma", soloElDueno, validar("json", z.object({ idioma })), async (c) => {
    const r = await armar(c.env).primerIngreso.cambiarIdioma(c.req.valid("json"));
    if (!r.ok) return responderErrorDeDominio(c, r.error);
    return c.json({ idioma: r.valor.idioma });
  });

export const rutasMediosDePago = new Hono<EntornoApi>()
  .put("/whatsapp", soloElDueno, validar("json", z.object({ numero: z.string().max(40) })), async (c) => {
    const r = await armar(c.env).primerIngreso.guardarWhatsapp(c.req.valid("json"));
    if (!r.ok) return responderErrorDeDominio(c, r.error);
    return c.json(r.valor);
  })
  .put(
    "/transferencia",
    soloElDueno,
    validar("json", z.object({ cuenta: z.string().max(60), titular: z.string().max(200) })),
    async (c) => {
      const r = await armar(c.env).primerIngreso.guardarTransferencia(c.req.valid("json"));
      if (!r.ok) return responderErrorDeDominio(c, r.error);
      return c.json(r.valor);
    },
  );

export const rutasPrimerIngreso = new Hono<EntornoApi>().post(
  "/avanzar",
  soloElDueno,
  validar("json", esquemaPaso),
  async (c) => {
    const { paso, salteado } = c.req.valid("json");
    const r = await armar(c.env).primerIngreso.avanzar({
      paso: paso as (typeof PASOS_DEL_PRIMER_INGRESO)[number],
      ...(salteado !== undefined ? { salteado } : {}),
    });
    if (!r.ok) return responderErrorDeDominio(c, r.error);
    return c.json(r.valor);
  },
);
