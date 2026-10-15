import { Hono } from "hono";
import { z } from "zod";
import { armar } from "../../container";
import { VERSION_DE_LA_TIENDA } from "../../version";
import { responderErrorDeDominio } from "../errores";
import { requiereSesion } from "../middlewares/sesion";
import type { EntornoApi } from "../tipos";
import { validar } from "../validacion";

/** Actualizar la tienda desde el panel: la persona prepara el PR y decide si lo aplica. Solo el dueño. */
const soloElDueno = requiereSesion("completa");

export const rutasActualizaciones = new Hono<EntornoApi>()
  .post("/preparar", soloElDueno, async (c) => {
    const r = await armar(c.env).actualizaciones.preparar(VERSION_DE_LA_TIENDA);
    if (!r.ok) return responderErrorDeDominio(c, r.error);
    return c.json(r.valor);
  })
  .post(
    "/aplicar",
    soloElDueno,
    validar("json", z.object({ numero: z.number().int().positive() })),
    async (c) => {
      const r = await armar(c.env).actualizaciones.aplicar(c.req.valid("json").numero);
      if (!r.ok) return responderErrorDeDominio(c, r.error);
      return c.json(r.valor);
    },
  );
