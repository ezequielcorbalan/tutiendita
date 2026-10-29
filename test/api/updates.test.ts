import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { clearD1, send, startTestSession } from "../helpers";

type ErrorBody = { error: { code: string } };
const errorCode = async (res: Response) => ((await res.json()) as ErrorBody).error.code;

beforeEach(clearD1);

describe("updating from the panel through the API", () => {
  it("without a session it answers 401 and from another origin 403", async () => {
    expect((await send("POST", "/api/updates/prepare")).status).toBe(401);
    const cookies = await startTestSession("completa");
    const foreign = await send("POST", "/api/updates/prepare", undefined, {
      cookies,
      origin: "https://other.example",
    });
    expect(foreign.status).toBe(403);
  });

  it("without the GitHub app connected it neither prepares nor applies anything (409)", async () => {
    const cookies = await startTestSession("completa");
    const prepare = await send("POST", "/api/updates/prepare", undefined, { cookies });
    expect(prepare.status).toBe(409);
    expect(await errorCode(prepare)).toBe("GITHUB_NOT_CONNECTED");
    const apply = await send("POST", "/api/updates/apply", { number: 3 }, { cookies });
    expect(apply.status).toBe(409);
  });

  it("apply validates the pull request number", async () => {
    const cookies = await startTestSession("completa");
    const bad = await send("POST", "/api/updates/apply", { number: -1 }, { cookies });
    expect(bad.status).toBe(422);
  });

  it("with the app created but not installed it doesn't prepare either", async () => {
    const cookies = await startTestSession("completa");
    await env.DB.prepare(
      "INSERT INTO conexion_github (id, app_id, slug, clave_privada, actualizado_en) VALUES (1, 7, 'tiendita-ana', 'PEM', '2026-10-15T12:00:00.000Z')",
    ).run();
    const r = await send("POST", "/api/updates/prepare", undefined, { cookies });
    expect(await errorCode(r)).toBe("GITHUB_NOT_CONNECTED");
  });
});
