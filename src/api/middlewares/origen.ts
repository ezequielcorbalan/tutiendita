import { createMiddleware } from "hono/factory";
import { armar } from "../../container";
import { METODOS_SEGUROS, origenAceptado } from "../../lib/origen";
import { origenNoPermitido } from "../errores";
import type { EntornoApi } from "../tipos";

/** CSRF: en todo método inseguro de /api/* el origen tiene que ser el propio y estar permitido. */
export const exigirOrigenPermitido = createMiddleware<EntornoApi>(async (c, next) => {
  if (METODOS_SEGUROS.has(c.req.method)) return next();
  if (!origenAceptado(c.req.raw, await armar(c.env).origenesPermitidos())) return origenNoPermitido(c);
  await next();
});
