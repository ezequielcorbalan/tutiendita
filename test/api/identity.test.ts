import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { BASE, call, clearD1, clearR2, cookieHeader, PNG_1X1, seedStore, startTestSession } from "../helpers";

type Identity = { name: string; description: string; color: string; logoUrl: string | null };
type Logo = { bytes: Uint8Array<ArrayBuffer>; type: string; name: string };

const errorCode = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code;

const valid = {
  name: "Panadería La Espiga",
  description: " Pan de masa madre en Villa Crespo ",
  color: "azul",
};

/** PUT /api/store/identity as the panel sends it (multipart), with the given session (none: anonymous). */
async function put(
  fields: Record<string, string>,
  options: { logo?: Logo; cookies?: Record<string, string> | null } = {},
): Promise<Response> {
  const body = new FormData();
  for (const [k, v] of Object.entries(fields)) body.set(k, v);
  if (options.logo)
    body.set("logo", new File([options.logo.bytes], options.logo.name, { type: options.logo.type }));
  const headers = new Headers({ origin: BASE });
  const cookies = options.cookies === undefined ? await startTestSession() : options.cookies;
  if (cookies) headers.set("cookie", cookieHeader(cookies));
  return call("/api/store/identity", { method: "PUT", body, headers });
}

const png: Logo = { bytes: PNG_1X1, type: "image/png", name: "logo.png" };

beforeEach(async () => {
  await clearD1();
  await clearR2();
  await seedStore();
});

describe("PUT /api/store/identity", () => {
  it("saves the name, the trimmed tagline and the colour", async () => {
    const res = await put(valid);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      name: "Panadería La Espiga",
      description: "Pan de masa madre en Villa Crespo",
      color: "azul",
      logoUrl: null,
    });
    // Real D1 names.
    expect(
      await env.DB.prepare("SELECT nombre AS name, descripcion AS description FROM tiendas").first(),
    ).toEqual({ name: "Panadería La Espiga", description: "Pan de masa madre en Villa Crespo" });
    expect(
      await env.DB.prepare("SELECT valor FROM configuracion WHERE clave = 'marca.color'").first("valor"),
    ).toBe("azul");
  });

  it("stores the logo, serves it at /img/<key>, and removing it takes the file down", async () => {
    const saved = (await (await put(valid, { logo: png })).json()) as Identity;
    expect(saved.logoUrl).toMatch(/^\/img\/[0-9A-Z]{26}\.png$/);
    const url = saved.logoUrl ?? "";
    const img = await call(url);
    expect(img.status).toBe(200);
    expect(img.headers.get("content-type")).toBe("image/png");

    const removed = await put({ ...valid, remove_logo: "true" });
    expect(((await removed.json()) as Identity).logoUrl).toBeNull();
    expect((await call(url)).status).toBe(404);
  });

  it("a new logo replaces the previous one", async () => {
    const first = ((await (await put(valid, { logo: png })).json()) as Identity).logoUrl ?? "";
    const second = ((await (await put(valid, { logo: png })).json()) as Identity).logoUrl ?? "";
    expect(second).not.toBe(first);
    expect((await call(first)).status).toBe(404);
    expect((await call(second)).status).toBe(200);
  });

  it("without a new logo nor remove_logo the logo stays", async () => {
    const first = ((await (await put(valid, { logo: png })).json()) as Identity).logoUrl;
    expect(((await (await put(valid)).json()) as Identity).logoUrl).toBe(first);
  });

  it("rejects a tagline over 200 characters", async () => {
    const res = await put({ ...valid, description: "x".repeat(201) });
    expect(res.status).toBe(422);
    expect(await errorCode(res)).toBe("DESCRIPTION_TOO_LONG");
  });

  it("rejects a colour outside the palette", async () => {
    const res = await put({ ...valid, color: "#ff0000" });
    expect(res.status).toBe(422);
    expect(await errorCode(res)).toBe("INVALID_BRAND_COLOR");
  });

  it("rejects a logo whose bytes aren't the declared image type", async () => {
    const fake: Logo = { bytes: new Uint8Array(16), type: "image/png", name: "logo.png" };
    const res = await put(valid, { logo: fake });
    expect(res.status).toBe(422);
    expect(await errorCode(res)).toBe("INVALID_IMAGE");
    expect(await env.DB.prepare("SELECT nombre FROM tiendas").first("nombre")).toBe("La tiendita de prueba");
  });

  it("without a session → 401", async () => {
    const res = await put(valid, { cookies: null });
    expect(res.status).toBe(401);
  });
});
