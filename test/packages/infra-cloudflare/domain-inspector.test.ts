import { describe, expect, it } from "vitest";
import { createDomainInspector } from "../../../src/packages/infra-cloudflare/dns/domain-inspector";

type Answer = { name: string; type: number; data: string };

/** Fake DoH: `zones` answers NS queries, `records` A/AAAA queries (by name). */
function fakeDoh(zones: Record<string, string[]>, records: Record<string, Answer[]> = {}) {
  const queries: string[] = [];
  const f: typeof fetch = async (input) => {
    const url = new URL(String(input));
    const name = url.searchParams.get("name") ?? "";
    const type = url.searchParams.get("type");
    queries.push(`${type} ${name}`);
    const Answer =
      type === "NS"
        ? (zones[name] ?? []).map((data) => ({ name: `${name}.`, type: 2, data: `${data}.` }))
        : (records[name] ?? []).filter((a) => (type === "A" ? a.type !== 28 : a.type !== 1));
    return Response.json({ Status: 0, Answer });
  };
  return { f, queries };
}

describe("domain inspector (DNS over HTTPS)", () => {
  it("finds the zone walking up from the hostname, with its nameservers, and a free name", async () => {
    const { f, queries } = fakeDoh({ "ejemplo.com.ar": ["ana.ns.cloudflare.com", "bob.ns.cloudflare.com"] });
    expect(await createDomainInspector({ fetch: f }).dns("tienda.ejemplo.com.ar")).toEqual({
      zone: "ejemplo.com.ar",
      nameservers: ["ana.ns.cloudflare.com", "bob.ns.cloudflare.com"],
      records: [],
    });
    expect(queries).toEqual([
      "NS tienda.ejemplo.com.ar",
      "NS ejemplo.com.ar",
      "A tienda.ejemplo.com.ar",
      "AAAA tienda.ejemplo.com.ar",
    ]);
  });

  it("reports the records the hostname already has (a CNAME answer is not a zone)", async () => {
    const cname = { name: "www.ejemplo.com.", type: 5, data: "otro.host." };
    const { f } = fakeDoh(
      { "ejemplo.com": ["ns1.nic.ar"] },
      {
        "www.ejemplo.com": [cname, { name: "otro.host.", type: 1, data: "1.2.3.4" }],
        "ejemplo.com": [{ name: "ejemplo.com.", type: 28, data: "::1" }],
      },
    );
    const inspector = createDomainInspector({ fetch: f });
    expect(await inspector.dns("www.ejemplo.com")).toMatchObject({ zone: "ejemplo.com", records: ["CNAME"] });
    expect(await inspector.dns("ejemplo.com")).toMatchObject({
      nameservers: ["ns1.nic.ar"],
      records: ["AAAA"],
    });
  });

  it("servesStore: the hostname's /.well-known/webauthn lists its own origin", async () => {
    const answer =
      (body: unknown, status = 200): typeof fetch =>
      async () =>
        Response.json(body, { status });
    const serves = (f: typeof fetch) => createDomainInspector({ fetch: f }).servesStore("tienda.ejemplo.com");
    expect(await serves(answer({ origins: ["https://tienda.ejemplo.com"] }))).toBe(true);
    expect(await serves(answer({ origins: ["https://otra.com"] }))).toBe(false);
    expect(await serves(answer({}, 404))).toBe(false);
  });
});
