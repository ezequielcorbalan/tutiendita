/** What public DNS says about a hostname. */
export type DomainDns = {
  /** Zone the hostname belongs to ("ejemplo.com.ar" for "tienda.ejemplo.com.ar"), or null if DNS doesn't know it. */
  readonly zone: string | null;
  /** The zone's nameservers. */
  readonly nameservers: readonly string[];
  /** Record types (A, AAAA, CNAME) the hostname already has: a custom domain needs it free. */
  readonly records: readonly string[];
};

/** Looks at a domain from the outside (public DNS and HTTPS). Network errors are thrown. */
export interface DomainInspector {
  dns(hostname: string): Promise<DomainDns>;
  /** The hostname already answers as this store: its `/.well-known/webauthn` lists `https://<hostname>`. */
  servesStore(hostname: string): Promise<boolean>;
}
