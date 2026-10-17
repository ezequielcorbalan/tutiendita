import type { AllowedOrigin } from "../domain/access";
import {
  isCloudflareNameserver,
  normalizeHostname,
  WRANGLER_FILE,
  withCustomDomain,
} from "../domain/custom-domain";
import { type DomainError, domainError } from "../domain/errors";
import { err, ok, type Result } from "../domain/result";
import type { ReadyConnection } from "../domain/update";
import type { AccessRepository } from "../ports/access-repository";
import type { Clock } from "../ports/clock";
import type { DomainDns, DomainInspector } from "../ports/domain-inspector";
import type { GithubClient, GithubConnectionRepository } from "../ports/github";
import type { StoreRepository } from "../ports/store-repository";
import { attempt, readyConnection } from "./github-connection";

export type CustomDomainDeps = {
  readonly access: AccessRepository;
  readonly store: StoreRepository;
  readonly connection: GithubConnectionRepository;
  readonly github: GithubClient;
  readonly inspector: DomainInspector;
  readonly clock: Clock;
};

export type DomainStatus =
  /** No domain, and the store can't write its repo yet: connect GitHub first (Actualizaciones). */
  | { readonly status: "github-needed" }
  | { readonly status: "none" }
  /** Written to the repo; Cloudflare is redeploying and creating the DNS record and the certificate. */
  | { readonly status: "connecting"; readonly hostname: string }
  | { readonly status: "active"; readonly hostname: string };

export type DomainCheck = {
  readonly hostname: string;
  readonly zone: string | null;
  /** The zone uses Cloudflare's nameservers: the domain can be connected (if it's in this account). */
  readonly delegated: boolean;
  readonly nameservers: readonly string[];
  /** Records the hostname already has: it must be free (or the person picks another subdomain). */
  readonly records: readonly string[];
};

const origin = (hostname: string) => `https://${hostname}`;
const hostOf = (o: AllowedOrigin) => new URL(o.origin).hostname;

const toCheck = (hostname: string, dns: DomainDns): DomainCheck => ({
  hostname,
  zone: dns.zone,
  delegated: dns.nameservers.length > 0 && dns.nameservers.every(isCloudflareNameserver),
  nameservers: dns.nameservers,
  records: dns.records,
});

/**
 * Where the domain stands. The store's own domain lives as its non-primary allowed origin; it counts as
 * active once it answers as this store (then `tiendas.dominio` is saved and public pages move there).
 */
export const domainStatus = (deps: CustomDomainDeps) => async (): Promise<DomainStatus> => {
  const secondary = (await deps.access.allowedOrigins()).find((o) => !o.primary);
  if (!secondary) return (await readyConnection(deps)) ? { status: "none" } : { status: "github-needed" };
  const hostname = hostOf(secondary);
  const store = await deps.store.get();
  if (store?.domain === hostname) return { status: "active", hostname };
  // shortcut: checked when the person opens Configuración; a cron could do it if nobody comes back.
  const serves = await deps.inspector.servesStore(hostname).catch(() => false);
  if (!serves || store === null) return { status: "connecting", hostname };
  await deps.store.save({ ...store, domain: hostname }, deps.clock.now());
  return { status: "active", hostname };
};

/** Step 1: is the domain in Cloudflare and is that name free? Nothing is changed. */
export const checkDomain =
  (deps: CustomDomainDeps) =>
  async (input: string): Promise<Result<DomainCheck, DomainError>> => {
    const hostname = normalizeHostname(input);
    if (!hostname.ok) return hostname;
    const dns = await attempt("DNS_NOT_RESPONDING", () => deps.inspector.dns(hostname.value));
    return dns.ok ? ok(toCheck(hostname.value, dns.value)) : dns;
  };

/** The managed block of the repo's wrangler.jsonc, set to `hostname` (or removed); commits only if it changed. */
async function writeDomain(
  deps: CustomDomainDeps,
  c: ReadyConnection,
  hostname: string | null,
): Promise<Result<void, DomainError>> {
  const file = await attempt("GITHUB_NOT_RESPONDING", () => deps.github.readFile(c, WRANGLER_FILE));
  if (!file.ok) return file;
  if (file.value === null) {
    return err(domainError("ROUTES_ALREADY_SET", `The repository has no ${WRANGLER_FILE}`));
  }
  const text = withCustomDomain(file.value.text, hostname);
  if (!text.ok) return text;
  if (text.value === file.value.text) return ok(undefined);
  // The commit message is for the merchant: it stays in Spanish.
  const message = hostname ? `Conectar la tienda al dominio ${hostname}` : "Desconectar el dominio propio";
  const sha = file.value.sha;
  return attempt("GITHUB_NOT_RESPONDING", () =>
    deps.github.writeFile(c, { path: WRANGLER_FILE, text: text.value, sha, message }),
  );
}

/**
 * Step 2: writes the domain to the repo's wrangler.jsonc (Cloudflare redeploys and creates the DNS record and
 * the certificate) and lets the panel and the passkeys work on it, with the primary origin's rpId.
 */
export const connectDomain =
  (deps: CustomDomainDeps) =>
  async (input: string): Promise<Result<{ hostname: string }, DomainError>> => {
    const c = await readyConnection(deps);
    if (c === null) {
      return err(domainError("GITHUB_NOT_CONNECTED", "Connect the store to its GitHub repository first"));
    }
    const check = await checkDomain(deps)(input);
    if (!check.ok) return check;
    const { hostname, delegated, records, nameservers } = check.value;
    const origins = await deps.access.allowedOrigins();
    const primary = origins.find((o) => o.primary);
    if (!primary || hostOf(primary) === hostname) {
      return err(domainError("INVALID_DOMAIN", "That is already the store's address", { domain: hostname }));
    }
    if (!delegated) {
      return err(
        domainError("DOMAIN_NOT_DELEGATED", "The domain is not managed by Cloudflare", { nameservers }),
      );
    }
    // Reconnecting the same domain is fine: its records are the ones Cloudflare created for this store.
    const current = origins.find((o) => !o.primary);
    if (records.length > 0 && (!current || hostOf(current) !== hostname)) {
      return err(domainError("DOMAIN_IN_USE", "That name already points somewhere else", { records }));
    }
    const written = await writeDomain(deps, c, hostname);
    if (!written.ok) return written;
    const now = deps.clock.now();
    await deps.access.replaceSecondaryOrigins(
      [{ origin: origin(hostname), rpId: primary.rpId, primary: false }],
      now,
    );
    const store = await deps.store.get();
    if (store && store.domain !== null) await deps.store.save({ ...store, domain: null }, now);
    return ok({ hostname });
  };

/** Takes the domain out of the repo and the allowed origins; the store stays on workers.dev. */
export const disconnectDomain =
  (deps: CustomDomainDeps) => async (): Promise<Result<{ hostname: null }, DomainError>> => {
    const c = await readyConnection(deps);
    if (c === null) {
      return err(domainError("GITHUB_NOT_CONNECTED", "Connect the store to its GitHub repository first"));
    }
    const written = await writeDomain(deps, c, null);
    if (!written.ok) return written;
    const now = deps.clock.now();
    await deps.access.replaceSecondaryOrigins([], now);
    const store = await deps.store.get();
    if (store && store.domain !== null) await deps.store.save({ ...store, domain: null }, now);
    return ok({ hostname: null });
  };
