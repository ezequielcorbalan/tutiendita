import { type ErrorDeDominio, errorDeDominio, MIME_PERMITIDOS, type MimePermitido } from "../paquetes/core/index";

/**
 * Chequeo de borde HTTP, previo al caso de uso: el nombre del archivo lo declara el cliente, así que se
 * exige que su extensión (si hay) coincida con el MIME. El MIME no permitido, el tamaño y la firma de
 * bytes los decide el dominio (crearProducto), para que valgan en cualquier punto de entrada.
 */
const EXTENSIONES: Record<MimePermitido, readonly string[]> = {
  "image/jpeg": ["jpg", "jpeg"],
  "image/png": ["png"],
  "image/webp": ["webp"],
};

const esMimePermitido = (mime: string): mime is MimePermitido =>
  (MIME_PERMITIDOS as readonly string[]).includes(mime);

export function verificarImagen(nombre: string, tipoMime: string): ErrorDeDominio | null {
  if (!esMimePermitido(tipoMime)) return null;
  const punto = nombre.lastIndexOf(".");
  const extension = punto > 0 ? nombre.slice(punto + 1).toLowerCase() : null;
  if (extension !== null && !EXTENSIONES[tipoMime].includes(extension)) {
    return errorDeDominio("IMAGEN_INVALIDA", "La extensión del archivo no coincide con su tipo", {
      nombre,
      tipoMime,
    });
  }
  return null;
}
