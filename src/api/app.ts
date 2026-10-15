import { Hono } from "hono";
import { errorInterno, noEncontrado } from "./errores";
import { exigirOrigenPermitido } from "./middlewares/origen";
import { cargarSesion } from "./middlewares/sesion";
import { rutasAcceso } from "./rutas/acceso";
import { rutasActualizaciones } from "./rutas/actualizaciones";
import { rutasEjemplos } from "./rutas/ejemplos";
import { rutasImg } from "./rutas/img";
import { rutasMediosDePago, rutasPrimerIngreso, rutasTienda } from "./rutas/primer-ingreso";
import { rutasProductos } from "./rutas/productos";
import type { EntornoApi } from "./tipos";

/** App Hono montada por el middleware de Astro bajo /api, /img, /feed, /.well-known y /mcp. */
export const api = new Hono<EntornoApi>()
  // CSRF por origen en todo método inseguro, antes de tocar la sesión.
  .use("/api/*", exigirOrigenPermitido)
  .use("/api/*", cargarSesion)
  .route("/api/acceso", rutasAcceso)
  .route("/api/products", rutasProductos)
  .route("/api/tienda", rutasTienda)
  .route("/api/medios-de-pago", rutasMediosDePago)
  .route("/api/primer-ingreso", rutasPrimerIngreso)
  .route("/api/ejemplos", rutasEjemplos)
  .route("/api/actualizaciones", rutasActualizaciones)
  .route("/img", rutasImg)
  .notFound(noEncontrado)
  .onError((causa, c) => errorInterno(c, causa));

/** Prefijos que atiende Hono; el resto lo renderiza Astro. */
export const RUTAS_API = /^\/(api|img|feed|\.well-known|mcp)(\/|$)/;
