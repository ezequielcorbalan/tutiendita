import { dinero } from "../../paquetes/core/index";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import { armar } from "../../container";
import { aProductoJson } from "../../lib/producto-json";
import { type CuerpoError, responderErrorDeDominio } from "../errores";
import { requiereSesion } from "../middlewares/sesion";
import type { EntornoApi } from "../tipos";
import { validar } from "../validacion";
import { verificarImagen } from "../verificar-imagen";

/** Tope del cuerpo del alta: la imagen (máx. 5 MB) más el resto de los campos. */
export const TAMANO_MAXIMO_CUERPO = 6 * 1024 * 1024;
export const LARGO_MAXIMO_NOMBRE = 120;
export const LARGO_MAXIMO_DESCRIPCION = 5000;

/** Campos del multipart de POST /api/products. Los números llegan como texto: se validan como texto. */
const esquemaAlta = z.object({
  nombre: z
    .string()
    .trim()
    .min(1, "El nombre es obligatorio")
    .max(LARGO_MAXIMO_NOMBRE, `Máximo ${LARGO_MAXIMO_NOMBRE} caracteres`),
  descripcion: z
    .string()
    .max(LARGO_MAXIMO_DESCRIPCION, `Máximo ${LARGO_MAXIMO_DESCRIPCION} caracteres`)
    .optional(),
  precio_monto: z
    .string()
    .regex(/^\d+$/, "Debe ser un entero mayor o igual a cero en la unidad mínima (centavos)")
    .transform(Number)
    .refine(Number.isSafeInteger, "Monto fuera de rango"),
  precio_moneda: z.string().regex(/^[A-Z]{3}$/, "Debe ser un código ISO 4217 de tres letras (ej. ARS)"),
  publicar: z
    .enum(["true", "false"], { message: 'Debe ser "true" o "false"' })
    .optional()
    .transform((v) => v === "true"),
  imagen: z.instanceof(File, { message: "Debe ser un archivo" }).optional(),
});

export const rutasProductos = new Hono<EntornoApi>()
  .get("/", async (c) => {
    const productos = await armar(c.env).listarProductos();
    return c.json(productos.map(aProductoJson));
  })
  .get("/:slug", async (c) => {
    const r = await armar(c.env).obtenerProducto(c.req.param("slug"));
    if (!r.ok) return responderErrorDeDominio(c, r.error);
    return c.json(aProductoJson(r.valor));
  })
  .post(
    "/",
    // Solo el dueño, con sesión completa. El origen ya lo exigió la app.
    requiereSesion("completa"),
    bodyLimit({
      maxSize: TAMANO_MAXIMO_CUERPO,
      onError: (c) =>
        c.json<CuerpoError>(
          {
            error: {
              codigo: "CUERPO_DEMASIADO_GRANDE",
              mensaje: "El cuerpo de la solicitud supera el máximo",
              detalle: { maximo: TAMANO_MAXIMO_CUERPO },
            },
          },
          413,
        ),
    }),
    validar("form", esquemaAlta, "Datos del producto inválidos"),
    async (c) => {
      const datos = c.req.valid("form");
      const precio = dinero(datos.precio_monto, datos.precio_moneda);
      if (!precio.ok) return responderErrorDeDominio(c, precio.error);
      let imagen: { bytes: Uint8Array; tipoMime: string } | undefined;
      if (datos.imagen !== undefined) {
        imagen = { bytes: new Uint8Array(await datos.imagen.arrayBuffer()), tipoMime: datos.imagen.type };
        const problema = verificarImagen(datos.imagen.name, imagen.tipoMime);
        if (problema !== null) return responderErrorDeDominio(c, problema);
      }
      const r = await armar(c.env).crearProducto({
        nombre: datos.nombre,
        precio: precio.valor,
        publicar: datos.publicar,
        ...(datos.descripcion !== undefined ? { descripcion: datos.descripcion } : {}),
        ...(imagen !== undefined ? { imagen } : {}),
      });
      if (!r.ok) return responderErrorDeDominio(c, r.error);
      return c.json(aProductoJson(r.valor), 201);
    },
  );
