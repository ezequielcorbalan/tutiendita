import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { clearD1, send, startTestSession } from "../helpers";

type ErrorBody = { error: { code: string } };
const errorCode = async (res: Response) => ((await res.json()) as ErrorBody).error.code;

beforeEach(clearD1);

describe("custom domain through the API", () => {
  it("without a session it answers 401 and from another origin 403", async () => {
    expect((await send("POST", "/api/domain/check", { hostname: "tienda.ejemplo.com" })).status).toBe(401);
    const cookies = await startTestSession("completa");
    const foreign = await send("POST", "/api/domain/disconnect", undefined, {
      cookies,
      origin: "https://other.example",
    });
    expect(foreign.status).toBe(403);
  });

  it("validates the hostname before asking DNS anything", async () => {
    const cookies = await startTestSession("completa");
    const bad = await send("POST", "/api/domain/check", { hostname: "mi tienda" }, { cookies });
    expect(bad.status).toBe(422);
    expect(await errorCode(bad)).toBe("INVALID_DOMAIN");
    const empty = await send("POST", "/api/domain/check", {}, { cookies });
    expect(await errorCode(empty)).toBe("INVALID_INPUT");
  });

  it("without GitHub connected it neither connects nor disconnects (409)", async () => {
    const cookies = await startTestSession("completa");
    const connect = await send(
      "POST",
      "/api/domain/connect",
      { hostname: "tienda.ejemplo.com" },
      { cookies },
    );
    expect(connect.status).toBe(409);
    expect(await errorCode(connect)).toBe("GITHUB_NOT_CONNECTED");
    const disconnect = await send("POST", "/api/domain/disconnect", undefined, { cookies });
    expect(await errorCode(disconnect)).toBe("GITHUB_NOT_CONNECTED");
  });

  it("/.well-known/webauthn lists only the custom domain's origin (related origins for the passkeys)", async () => {
    const read = async () => {
      const res = await send("GET", "/.well-known/webauthn");
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("application/json");
      return res.json();
    };
    expect(await read()).toEqual({ origins: [] });
    await startTestSession("completa");
    await env.DB.prepare(
      "INSERT INTO origenes_permitidos (origen, rp_id, principal, agregado_en) VALUES ('https://tienda.ejemplo.com', 'tiendita.test', 0, '2026-10-16T12:00:00.000Z')",
    ).run();
    expect(await read()).toEqual({ origins: ["https://tienda.ejemplo.com"] });
  });
});
