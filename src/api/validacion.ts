import { zValidator } from "@hono/zod-validator";
import type { ZodType } from "zod";
import type { CuerpoError } from "./errores";

type Destino = "json" | "form";

/** Validación de cuerpo con zod: errores → 422 ENTRADA_INVALIDA con el primer mensaje de cada campo. */
export const validar = <T extends ZodType>(destino: Destino, esquema: T, mensaje = "Datos inválidos") =>
  zValidator(destino, esquema, (resultado, c) => {
    if (resultado.success) return;
    const campos: Record<string, string> = {};
    for (const issue of resultado.error.issues) {
      const campo = issue.path.join(".") || "(cuerpo)";
      campos[campo] ??= issue.message;
    }
    return c.json<CuerpoError>({ error: { codigo: "ENTRADA_INVALIDA", mensaje, detalle: { campos } } }, 422);
  });
