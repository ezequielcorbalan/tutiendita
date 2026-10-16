import { type DomainError, domainError } from "./errors";
import { err, ok, type Result } from "./result";

/** The store's config file in its repo: connecting a domain writes its `routes` there. */
export const WRANGLER_FILE = "wrangler.jsonc";

const HOSTNAME =
  /^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/;
// Shared suffixes nobody can add as their own zone in Cloudflare.
const NOT_OWNABLE = [".workers.dev", ".pages.dev"];

/**
 * "https://Tienda.Ejemplo.com.ar/algo" → "tienda.ejemplo.com.ar". Accepts what people paste (scheme, path,
 * trailing dot); rejects anything that isn't a plain hostname or that can't be a zone of theirs.
 */
export function normalizeHostname(input: string): Result<string, DomainError> {
  const host = input
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, "")
    .replace(/[/?#].*$/, "")
    .replace(/\.$/, "");
  if (!HOSTNAME.test(host) || NOT_OWNABLE.some((s) => host.endsWith(s))) {
    return err(domainError("INVALID_DOMAIN", "Write a domain like tienda.example.com", { domain: host }));
  }
  return ok(host);
}

/** Nameservers that mean the zone is managed in Cloudflare. */
export const isCloudflareNameserver = (ns: string) => /\.ns\.cloudflare\.com\.?$/i.test(ns);

// The block the panel writes and recognizes. Keeping workers.dev on matters: the panel and the passkeys
// (whose rpId is the workers.dev host) keep working there, and wrangler turns it off when routes appear.
const MARKER = "// tutiendita: custom domain, managed from the panel";
const MANAGED = new RegExp(`^[ \\t]*${MARKER.replace(/[/]/g, "\\/")}.*\\r?\\n.*\\r?\\n.*\\r?\\n`, "m");
const managedBlock = (hostname: string) =>
  `  ${MARKER} (Configuración). workers.dev stays on: the panel and the passkeys still use it.\n` +
  `  "routes": [{ "pattern": ${JSON.stringify(hostname)}, "custom_domain": true }],\n` +
  `  "workers_dev": true,\n`;

/**
 * The store's `wrangler.jsonc` with the custom domain set (or removed, with `null`). Only touches the block it
 * writes itself, right after the opening `{`; if the file already has routes of its own, it refuses.
 */
export function withCustomDomain(wrangler: string, hostname: string | null): Result<string, DomainError> {
  const clean = wrangler.replace(MANAGED, "");
  // Without comments, so a mention of "routes" in one doesn't count.
  const code = clean.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
  if (/"(routes|route|workers_dev)"\s*:/.test(code)) {
    return err(
      domainError("ROUTES_ALREADY_SET", `${WRANGLER_FILE} already has its own routes: change them by hand`),
    );
  }
  if (hostname === null) return ok(clean);
  const start = clean.indexOf("{");
  if (start === -1) return err(domainError("ROUTES_ALREADY_SET", `${WRANGLER_FILE} is not a JSON object`));
  const lineEnd = clean.indexOf("\n", start);
  const at = lineEnd === -1 ? start + 1 : lineEnd + 1;
  return ok(`${clean.slice(0, at)}${lineEnd === -1 ? "\n" : ""}${managedBlock(hostname)}${clean.slice(at)}`);
}

/** The domain set in the managed block, if any. */
export function customDomainIn(wrangler: string): string | null {
  const block = wrangler.match(MANAGED)?.[0] ?? "";
  return block.match(/"pattern":\s*"([^"]+)"/)?.[1] ?? null;
}
