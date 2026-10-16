import type { DomainDns, DomainInspector } from "../../core/index";

/** Cloudflare's public DNS over HTTPS, JSON format (no key, any Worker can use it). */
const DOH = "https://cloudflare-dns.com/dns-query";
const TYPES: Record<number, string> = { 1: "A", 5: "CNAME", 28: "AAAA" };
const TIMEOUT_MS = 5000;

type Answer = { name: string; type: number; data: string };
const bare = (name: string) => name.replace(/\.$/, "").toLowerCase();

export function createDomainInspector(options: { fetch?: typeof fetch } = {}): DomainInspector {
  const f = options.fetch ?? fetch;

  async function query(name: string, type: string): Promise<Answer[]> {
    const r = await f(`${DOH}?name=${encodeURIComponent(name)}&type=${type}`, {
      headers: { accept: "application/dns-json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!r.ok) throw new Error(`DoH ${r.status} for ${type} ${name}`);
    return ((await r.json()) as { Answer?: Answer[] }).Answer ?? [];
  }

  return {
    async dns(hostname) {
      // The zone is the longest suffix with its own NS records (a CNAME answer doesn't count).
      const labels = hostname.split(".");
      let zone: string | null = null;
      let nameservers: string[] = [];
      for (let i = 0; i <= labels.length - 2 && zone === null; i++) {
        const name = labels.slice(i).join(".");
        const ns = (await query(name, "NS")).filter((a) => a.type === 2 && bare(a.name) === name);
        if (ns.length > 0) {
          zone = name;
          nameservers = ns.map((a) => bare(a.data));
        }
      }
      const answers = [...(await query(hostname, "A")), ...(await query(hostname, "AAAA"))];
      const records = [
        ...new Set(
          answers.filter((a) => bare(a.name) === hostname).map((a) => TYPES[a.type] ?? String(a.type)),
        ),
      ];
      return { zone, nameservers, records } satisfies DomainDns;
    },

    async servesStore(hostname) {
      const r = await f(`https://${hostname}/.well-known/webauthn`, {
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!r.ok) return false;
      const body = (await r.json().catch(() => null)) as { origins?: unknown } | null;
      return Array.isArray(body?.origins) && body.origins.includes(`https://${hostname}`);
    },
  };
}
