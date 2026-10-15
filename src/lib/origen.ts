/**
 * CSRF por origen, para todo método inseguro sin importar el tipo de contenido: el
 * `Origin` (o, si falta, `Sec-Fetch-Site: same-origin`) tiene que ser el del propio request y, una vez
 * reclamada la tienda, además estar en `origenes_permitidos`.
 */
export const METODOS_SEGUROS = new Set(["GET", "HEAD", "OPTIONS"]);

export function origenAceptado(request: Request, permitidos: readonly string[]): boolean {
  const propio = new URL(request.url).origin;
  const declarado = request.headers.get("origin");
  const origen =
    declarado !== null && declarado !== "null"
      ? declarado
      : request.headers.get("sec-fetch-site") === "same-origin"
        ? propio
        : null;
  if (origen !== propio) return false;
  return permitidos.length === 0 || permitidos.includes(origen);
}
