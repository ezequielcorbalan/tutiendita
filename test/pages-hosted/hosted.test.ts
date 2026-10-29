import { exports } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { BASE, clearD1, cookieHeader, startTestSession } from "../helpers";
import { TEST_CLAIM_CODE } from "../test-code.mjs";

/** The built Worker running as a hosted store (vitest.config.ts, project pages-hosted). Spanish UI texts. */
const request = (path: string, cookies?: Record<string, string>, init: RequestInit = {}) =>
  exports.default.fetch(`${BASE}${path}`, {
    redirect: "manual",
    ...init,
    headers: {
      ...(cookies ? { cookie: cookieHeader(cookies) } : {}),
      ...(init.headers as Record<string, string>),
    },
  });

const claim = (code: string) =>
  request("/api/access/claim", undefined, {
    method: "POST",
    headers: { origin: BASE, "content-type": "application/json" },
    body: JSON.stringify({ code }),
  });

beforeEach(clearD1);

describe("a store of the hosted plan", () => {
  it("is claimed only with the code the hosting service emailed, never with the build's", async () => {
    expect((await claim(TEST_CLAIM_CODE)).status).toBe(422);
    expect((await claim("7KQ2-M9XD-4RTA-ABCD-EFGH-0112")).status).toBe(200);
  });

  it("before the claim, home and claim point to the email, never to a Cloudflare account", async () => {
    for (const path of ["/", "/panel/reclamar"]) {
      const res = await request(path);
      expect(res.status, path).toBe(200);
      expect(await res.text(), path).not.toMatch(/Cloudflare|README/);
    }
    expect(await (await request("/")).text()).toContain("La alojamos nosotros");
    expect(await (await request("/panel/reclamar")).text()).toContain("Tu tienda está lista");
  });

  it("recovery's last resort is writing to us, not the Cloudflare account", async () => {
    await startTestSession("completa");
    const html = await (await request("/panel/recuperar")).text();
    expect(html).toContain("hola@tutiendita.ar");
    expect(html).not.toContain("Cloudflare");
  });

  it("Updates shows the one-button page with the security alert, at the same address", async () => {
    const res = await request("/panel/actualizaciones", await startTestSession("completa"));
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("tutiendita aloja y cuida tu tienda");
    expect(html).toContain("Hay una versión nueva: 99.0.0");
    expect(html).toContain("Actualización de seguridad");
    expect(html).toContain("data-hosted-update");
    expect(html).not.toContain("Conectar con GitHub");
  });

  it("the panel home alert asks the hosting service, not GitHub", async () => {
    const res = await request("/panel/actualizaciones/aviso", await startTestSession("completa"));
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("Actualización de seguridad");
  });

  it("Settings explains the hosted address instead of sending the owner to the GitHub flow", async () => {
    const res = await request("/panel/configuracion", await startTestSession("completa"));
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("la dirección que te dio tutiendita");
    expect(html).not.toContain("primero conectá tu tienda con GitHub");
  });

  it("/panel/hosted-updates needs a session like any panel page", async () => {
    const res = await request("/panel/hosted-updates");
    expect(res.status).toBe(303);
  });
});
