import { Hono } from "hono";
import { noEncontrado } from "../errores";
import type { EntornoApi } from "../tipos";

/** Keys que genera el almacén R2: ULID (Crockford) + extensión permitida. Cualquier otra cosa es 404. */
const KEY_VALIDA = /^[0-9A-HJKMNP-TV-Z]{26}\.(jpg|png|webp)$/;

/** El content-type sale de la extensión (ya validada), nunca de la metadata guardada en R2. */
const TIPO_POR_EXTENSION: Record<string, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

export const rutasImg = new Hono<EntornoApi>().get("/:key", async (c) => {
  const key = c.req.param("key");
  const extension = KEY_VALIDA.exec(key)?.[1];
  const tipo = extension === undefined ? undefined : TIPO_POR_EXTENSION[extension];
  if (tipo === undefined) return noEncontrado(c);
  const objeto = await c.env.IMAGENES.get(key);
  if (objeto === null) return noEncontrado(c);
  const headers = new Headers();
  headers.set("content-type", tipo);
  // Defensa en profundidad: que el navegador no "adivine" otro tipo ni ejecute nada en este origen.
  headers.set("x-content-type-options", "nosniff");
  headers.set("content-security-policy", "default-src 'none'");
  headers.set("etag", objeto.httpEtag);
  // La key es inmutable (un ULID nuevo por imagen subida): se puede cachear para siempre.
  headers.set("cache-control", "public, max-age=31536000, immutable");
  return new Response(objeto.body, { headers });
});
