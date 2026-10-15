import { RUBROS_DE_EJEMPLO } from "../../paquetes/core/index";
import { Hono } from "hono";
import { z } from "zod";
import { armar } from "../../container";
import { responderErrorDeDominio } from "../errores";
import { requiereSesion } from "../middlewares/sesion";
import type { EntornoApi } from "../tipos";
import { validar } from "../validacion";

/** Productos de ejemplo por rubro: cargarlos (idempotente) y borrarlos todos. Solo el dueño; el origen ya lo exigió la app. */
const soloElDueno = requiereSesion("completa");

export const rutasEjemplos = new Hono<EntornoApi>()
  .post(
    "/",
    soloElDueno,
    validar("json", z.object({ rubro: z.enum(RUBROS_DE_EJEMPLO, { message: "Rubro desconocido" }) })),
    async (c) => {
      const r = await armar(c.env).ejemplos.cargar(c.req.valid("json").rubro, new URL(c.req.url).origin);
      if (!r.ok) return responderErrorDeDominio(c, r.error);
      return c.json(r.valor);
    },
  )
  .delete("/", soloElDueno, async (c) => c.json(await armar(c.env).ejemplos.borrar()));
