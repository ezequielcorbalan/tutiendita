import { type CodigoError, type ErrorDeDominio, errorDeDominio } from "../paquetes/core/index";
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

export type CuerpoError = {
  error: { codigo: string; mensaje?: string; detalle?: Record<string, unknown> };
};

/** Código HTTP de cada error de dominio; el resto es entrada inválida → 422. */
const ESTADOS: Partial<Record<CodigoError, ContentfulStatusCode>> = {
  PRODUCTO_NO_ENCONTRADO: 404,
  NO_AUTENTICADO: 401,
  PASSKEY_DESCONOCIDA: 401,
  ORIGEN_NO_PERMITIDO: 403,
  ACCESO_LIMITADO: 403,
  TIENDA_YA_RECLAMADA: 409,
  PASSKEY_YA_REGISTRADA: 409,
  GITHUB_SIN_CONECTAR: 409,
  YA_ACTUALIZADA: 409,
  GITHUB_VARIOS_REPOSITORIOS: 409,
  GITHUB_NO_RESPONDE: 502,
  DEMASIADOS_INTENTOS: 429,
};

export const estadoPara = (e: ErrorDeDominio): ContentfulStatusCode => ESTADOS[e.codigo] ?? 422;

export function cuerpoError(e: ErrorDeDominio): CuerpoError {
  return {
    error: {
      codigo: e.codigo,
      mensaje: e.mensaje,
      ...(e.detalle !== undefined ? { detalle: e.detalle } : {}),
    },
  };
}

export function responderErrorDeDominio(c: Context, e: ErrorDeDominio) {
  const reintentar = e.detalle?.reintentarEnSegundos;
  if (e.codigo === "DEMASIADOS_INTENTOS" && typeof reintentar === "number") {
    c.header("Retry-After", String(reintentar));
  }
  return c.json(cuerpoError(e), estadoPara(e));
}

export const noAutenticado = (c: Context) =>
  responderErrorDeDominio(c, errorDeDominio("NO_AUTENTICADO", "Tenés que entrar a tu tienda"));

export const accesoLimitado = (c: Context) =>
  responderErrorDeDominio(c, errorDeDominio("ACCESO_LIMITADO", "Con este acceso no podés hacer eso"));

export const origenNoPermitido = (c: Context) =>
  responderErrorDeDominio(
    c,
    errorDeDominio("ORIGEN_NO_PERMITIDO", "El pedido no viene de la dirección de tu tienda"),
  );

export const noEncontrado = (c: Context) =>
  c.json<CuerpoError>({ error: { codigo: "NO_ENCONTRADO", mensaje: "Ruta inexistente" } }, 404);

export const errorInterno = (c: Context, causa: unknown) => {
  console.error("Error interno en la API", causa);
  return c.json<CuerpoError>({ error: { codigo: "INTERNO" } }, 500);
};
