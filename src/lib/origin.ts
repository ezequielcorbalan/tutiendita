/**
 * Origin-based CSRF, for every unsafe method regardless of the content type: the `Origin` (or, if
 * missing, `Sec-Fetch-Site: same-origin`) must be the request's own and, once the store is claimed,
 * also be in `origenes_permitidos` (D1 table).
 */
export const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function acceptedOrigin(request: Request, allowed: readonly string[]): boolean {
  const own = new URL(request.url).origin;
  const declared = request.headers.get("origin");
  const origin =
    declared !== null && declared !== "null"
      ? declared
      : request.headers.get("sec-fetch-site") === "same-origin"
        ? own
        : null;
  if (origin !== own) return false;
  return allowed.length === 0 || allowed.includes(origin);
}
