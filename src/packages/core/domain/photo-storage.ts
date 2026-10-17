import { WRANGLER_FILE } from "./custom-domain";
import { type DomainError, domainError } from "./errors";
import { err, ok, type Result } from "./result";

// The block the panel writes and recognizes (same technique as the custom domain block).
const MARKER = "// tutiendita: professional photos, managed from the panel";
const MANAGED = new RegExp(`^[ \\t]*${MARKER.replace(/[/]/g, "\\/")}.*\\r?\\n.*\\r?\\n`, "m");

/** The R2 bucket a store's worker uses for professional photos. */
export const bucketNameFor = (worker: string) => `${worker}-imagenes`;

const managedBlock = (worker: string) =>
  `  ${MARKER} (Configuración).\n` +
  `  "r2_buckets": [{ "binding": "IMAGENES", "bucket_name": ${JSON.stringify(bucketNameFor(worker))} }],\n`;

/**
 * The store's `wrangler.jsonc` with professional photos on (R2 bucket bound) or off. Only touches the block it
 * writes itself, right after the opening `{`; if the file already has its own `r2_buckets`, it refuses.
 */
export function withProfessionalPhotos(wrangler: string, enabled: boolean): Result<string, DomainError> {
  const clean = wrangler.replace(MANAGED, "");
  // Without comments, so a mention of "r2_buckets" in one doesn't count.
  const code = clean.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
  if (/"r2_buckets"\s*:/.test(code)) {
    return err(
      domainError("R2_ALREADY_SET", `${WRANGLER_FILE} already has its own r2_buckets: change them by hand`),
    );
  }
  if (!enabled) return ok(clean);
  const worker = code.match(/"name"\s*:\s*"([^"]+)"/)?.[1];
  if (!worker) return err(domainError("R2_ALREADY_SET", `${WRANGLER_FILE} has no "name"`));
  const start = clean.indexOf("{");
  if (start === -1) return err(domainError("R2_ALREADY_SET", `${WRANGLER_FILE} is not a JSON object`));
  const lineEnd = clean.indexOf("\n", start);
  const at = lineEnd === -1 ? start + 1 : lineEnd + 1;
  return ok(`${clean.slice(0, at)}${lineEnd === -1 ? "\n" : ""}${managedBlock(worker)}${clean.slice(at)}`);
}
