import { env } from "cloudflare:workers";
import { MAX_SIGN_IN_REQUESTS } from "../../src/packages/core/index";
import { beforeEach, describe, expect, it } from "vitest";
import { BASE, call, clearD1, cookiesOf, RP_ID, SESSION_COOKIE, send, startTestSession } from "../helpers";
import { TEST_CLAIM_CODE } from "../test-code.mjs";
import { createVirtualAuthenticator, type VirtualAuthenticator } from "../virtual-authenticator";

type ErrorBody = { error: { code: string; message?: string; details?: Record<string, unknown> } };
const errorCode = async (res: Response) => ((await res.json()) as ErrorBody).error.code;
const CHALLENGE_COOKIE = "__Host-tiendita_desafio";

beforeEach(clearD1);

async function claim() {
  const res = await send("POST", "/api/access/claim", { code: TEST_CLAIM_CODE });
  expect(res.status).toBe(200);
  return cookiesOf(res);
}

/** Claim → options → registration with the virtual authenticator. */
async function claimAndRegister(authenticator?: VirtualAuthenticator) {
  const a = authenticator ?? (await createVirtualAuthenticator());
  const claimSession = await claim();
  const optionsRes = await send("POST", "/api/access/passkeys/options", {}, { cookies: claimSession });
  expect(optionsRes.status).toBe(200);
  const options = await optionsRes.json();
  const challenge = cookiesOf(optionsRes);
  const response = await a.register(options, { origin: BASE });
  const registration = await send(
    "POST",
    "/api/access/passkeys",
    { response },
    { cookies: { ...claimSession, ...challenge } },
  );
  return { authenticator: a, registration, claimSession };
}

async function signIn(a: VirtualAuthenticator) {
  const optionsRes = await send("POST", "/api/access/sign-in/options", {});
  expect(optionsRes.status).toBe(200);
  const response = await a.signIn(await optionsRes.json(), { origin: BASE });
  return send("POST", "/api/access/sign-in", { response }, { cookies: cookiesOf(optionsRes) });
}

describe("claim", () => {
  it("with the build's code (lowercase and spaces) → 200 and an HttpOnly, Secure, SameSite=Lax session cookie", async () => {
    const res = await send("POST", "/api/access/claim", {
      code: ` ${TEST_CLAIM_CODE.toLowerCase()} `,
    });
    expect(res.status).toBe(200);
    const [cookie] = res.headers.getSetCookie();
    expect(cookie).toMatch(/^__Host-tiendita_sesion=[A-Za-z0-9_-]{43};/);
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/Secure/);
    expect(cookie).toMatch(/SameSite=Lax/);
    expect(cookie).toMatch(/Path=\//);
    expect(cookie).toMatch(/Max-Age=900/);
  });

  it("wrong code → 422 INVALID_CODE; after 10 failures → 429 with Retry-After", async () => {
    for (let i = 0; i < 10; i += 1) {
      const res = await send("POST", "/api/access/claim", { code: "AAAA-BBBB-CCCC-DDDD-EEEE-FFFF" });
      expect(res.status).toBe(422);
      expect(await errorCode(res)).toBe("INVALID_CODE");
    }
    const res = await send("POST", "/api/access/claim", { code: TEST_CLAIM_CODE });
    expect(res.status).toBe(429);
    expect(await errorCode(res)).toBe("TOO_MANY_ATTEMPTS");
    expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(0);
  });

  it("attempts are counted per IP (CF-Connecting-IP)", async () => {
    for (let i = 0; i < 10; i += 1) {
      await call("/api/access/claim", {
        method: "POST",
        headers: { origin: BASE, "content-type": "application/json", "cf-connecting-ip": "9.9.9.9" },
        body: JSON.stringify({ code: "bad" }),
      });
    }
    expect((await send("POST", "/api/access/claim", { code: TEST_CLAIM_CODE })).status).toBe(200);
  });

  it("invalid body → 422 INVALID_INPUT; foreign Origin → 403", async () => {
    expect(await errorCode(await send("POST", "/api/access/claim", { other: 1 }))).toBe("INVALID_INPUT");
    const foreign = await send(
      "POST",
      "/api/access/claim",
      { code: TEST_CLAIM_CODE },
      { origin: "https://x.example" },
    );
    expect(foreign.status).toBe(403);
    expect(await errorCode(foreign)).toBe("ORIGIN_NOT_ALLOWED");
  });
});

describe("first passkey", () => {
  it("registers, claims the store, rotates the session to full and returns the recovery code once", async () => {
    const { registration, claimSession, authenticator } = await claimAndRegister();
    expect(registration.status).toBe(201);
    const body = (await registration.json()) as {
      recoveryCode: string;
      passkey: { id: string; name: string };
    };
    expect(body.recoveryCode).toMatch(/^([0-9A-Z]{4}-){5}[0-9A-Z]{4}$/);
    expect(body.passkey).toMatchObject({ id: authenticator.id });
    const newOnes = cookiesOf(registration);
    expect(newOnes[SESSION_COOKIE]).toBeTruthy();
    expect(newOnes[SESSION_COOKIE]).not.toBe(claimSession[SESSION_COOKIE]);
    expect(newOnes[CHALLENGE_COOKIE]).toBe("");

    const row = await env.DB.prepare(
      "SELECT codigo_recuperacion_hash, primer_ingreso_paso FROM acceso",
    ).first<{
      codigo_recuperacion_hash: string;
      primer_ingreso_paso: string;
    }>();
    expect(row?.primer_ingreso_paso).toBe("acceso");
    expect(row?.codigo_recuperacion_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(row?.codigo_recuperacion_hash).not.toContain(body.recoveryCode);
    expect(await env.DB.prepare("SELECT origen, rp_id FROM origenes_permitidos").all()).toMatchObject({
      results: [{ origen: BASE, rp_id: RP_ID }], // raw D1 row: real column names
    });

    // The claim session no longer works; the new one does.
    const withClaim = await send("POST", "/api/access/recovery-code", {}, { cookies: claimSession });
    expect(withClaim.status).toBe(401);
    const list = await call("/api/access/passkeys", {
      headers: { cookie: `${SESSION_COOKIE}=${newOnes[SESSION_COOKIE]}` },
    });
    expect(list.status).toBe(200);
    expect(((await list.json()) as { id: string }[]).map((p) => p.id)).toEqual([authenticator.id]);
  });

  it("without the challenge cookie → 422 CHALLENGE_EXPIRED", async () => {
    const a = await createVirtualAuthenticator();
    const session = await claim();
    const options = await (
      await send("POST", "/api/access/passkeys/options", {}, { cookies: session })
    ).json();
    const response = await a.register(options, { origin: BASE });
    const res = await send("POST", "/api/access/passkeys", { response }, { cookies: session });
    expect(res.status).toBe(422);
    expect(await errorCode(res)).toBe("CHALLENGE_EXPIRED");
  });

  it("a response signed for another origin → 422 PASSKEY_NOT_VERIFIED and the store stays unclaimed", async () => {
    const a = await createVirtualAuthenticator();
    const session = await claim();
    const optionsRes = await send("POST", "/api/access/passkeys/options", {}, { cookies: session });
    const response = await a.register(await optionsRes.json(), { origin: "https://attacker.example" });
    const res = await send(
      "POST",
      "/api/access/passkeys",
      { response },
      { cookies: { ...session, ...cookiesOf(optionsRes) } },
    );
    expect(res.status).toBe(422);
    expect(await errorCode(res)).toBe("PASSKEY_NOT_VERIFIED");
    expect(await env.DB.prepare("SELECT count(*) AS n FROM acceso").first("n")).toBe(0);
  });

  it("no session → 401; with the store already claimed the claim code gives 409", async () => {
    expect((await send("POST", "/api/access/passkeys/options", {})).status).toBe(401);
    await claimAndRegister();
    const res = await send("POST", "/api/access/claim", { code: TEST_CLAIM_CODE });
    expect(res.status).toBe(409);
    expect(await errorCode(res)).toBe("STORE_ALREADY_CLAIMED");
  });
});

describe("sign-in and sign-out", () => {
  it("signs in with the passkey, uses the session, signs out and the cookie stops working", async () => {
    const { authenticator } = await claimAndRegister();
    const res = await signIn(authenticator);
    expect(res.status).toBe(200);
    const session = cookiesOf(res);
    expect(session[SESSION_COOKIE]).toBeTruthy();
    expect(
      (
        await call("/api/access/passkeys", {
          headers: { cookie: `${SESSION_COOKIE}=${session[SESSION_COOKIE]}` },
        })
      ).status,
    ).toBe(200);

    const exit = await send("POST", "/api/access/sign-out", undefined, { cookies: session });
    expect(exit.status).toBe(204);
    expect(cookiesOf(exit)[SESSION_COOKIE]).toBe("");
    expect(
      (
        await call("/api/access/passkeys", {
          headers: { cookie: `${SESSION_COOKIE}=${session[SESSION_COOKIE]}` },
        })
      ).status,
    ).toBe(401);
  });

  it("a passkey the store doesn't know → 401 UNKNOWN_PASSKEY", async () => {
    await claimAndRegister();
    const unknown = await createVirtualAuthenticator();
    const res = await signIn(unknown);
    expect(res.status).toBe(401);
    expect(await errorCode(res)).toBe("UNKNOWN_PASSKEY");
  });

  it("sign-in options requests are limited per IP → 429", async () => {
    await claimAndRegister();
    const requestOptions = () => send("POST", "/api/access/sign-in/options", {});
    for (let i = 0; i < MAX_SIGN_IN_REQUESTS; i += 1) expect((await requestOptions()).status).toBe(200);
    const res = await requestOptions();
    expect(res.status).toBe(429);
    expect(await errorCode(res)).toBe("TOO_MANY_ATTEMPTS");
  });

  it("before the claim there is no sign-in (403), nor from another origin", async () => {
    expect((await send("POST", "/api/access/sign-in/options", {})).status).toBe(403);
    await claimAndRegister();
    const res = await call("/api/access/sign-in/options", {
      method: "POST",
      headers: { origin: "https://other.example", "content-type": "application/json" },
      body: "{}",
    });
    expect(res.status).toBe(403);
  });
});

describe("recovery code", () => {
  it("deletes the other sessions, allows registering a new passkey, only then is spent and issues another code", async () => {
    const { registration } = await claimAndRegister();
    const { recoveryCode } = (await registration.json()) as { recoveryCode: string };
    const oldSession = cookiesOf(registration);

    const rec = await send("POST", "/api/access/recovery", { code: recoveryCode });
    expect(rec.status).toBe(200);
    const firstRecovery = cookiesOf(rec);
    expect((await send("POST", "/api/access/recovery-code", {}, { cookies: oldSession })).status).toBe(401);
    // With a recovery session nothing but a passkey can be written.
    expect((await send("POST", "/api/access/recovery-code", {}, { cookies: firstRecovery })).status).toBe(
      403,
    );
    // Signing in again with the same code (e.g. the browser couldn't create the passkey) works and leaves
    // only one recovery session alive: the previous one is deleted.
    const retry = await send("POST", "/api/access/recovery", { code: recoveryCode });
    expect(retry.status).toBe(200);
    expect((await send("POST", "/api/access/passkeys/options", {}, { cookies: firstRecovery })).status).toBe(
      401,
    );
    const recoverySession = cookiesOf(retry);

    const fresh = await createVirtualAuthenticator();
    const optionsRes = await send("POST", "/api/access/passkeys/options", {}, { cookies: recoverySession });
    const response = await fresh.register(await optionsRes.json(), { origin: BASE });
    const creation = await send(
      "POST",
      "/api/access/passkeys",
      { response },
      { cookies: { ...recoverySession, ...cookiesOf(optionsRes) } },
    );
    expect(creation.status).toBe(201);
    const body = (await creation.json()) as { recoveryCode: string };
    expect(body.recoveryCode).not.toBe(recoveryCode);
    expect((await send("POST", "/api/access/recovery", { code: recoveryCode })).status).toBe(422);
    expect((await signIn(fresh)).status).toBe(200);
  });

  it("regenerating with a full session returns a new one and invalidates the previous one", async () => {
    const { registration } = await claimAndRegister();
    const { recoveryCode } = (await registration.json()) as { recoveryCode: string };
    const res = await send("POST", "/api/access/recovery-code", {}, { cookies: cookiesOf(registration) });
    expect(res.status).toBe(200);
    const { recoveryCode: fresh } = (await res.json()) as { recoveryCode: string };
    expect(fresh).not.toBe(recoveryCode);
    expect((await send("POST", "/api/access/recovery", { code: recoveryCode })).status).toBe(422);
    expect((await send("POST", "/api/access/recovery", { code: fresh })).status).toBe(200);
  });
});

describe("passkeys from the panel", () => {
  it("doesn't allow deleting the last one (422 LAST_PASSKEY); with two, deletes the chosen one (204)", async () => {
    const { registration, authenticator } = await claimAndRegister();
    const session = cookiesOf(registration);
    const last = await send("DELETE", `/api/access/passkeys/${authenticator.id}`, undefined, {
      cookies: session,
    });
    expect(last.status).toBe(422);
    expect(await errorCode(last)).toBe("LAST_PASSKEY");

    const other = await createVirtualAuthenticator();
    const optionsRes = await send("POST", "/api/access/passkeys/options", {}, { cookies: session });
    const options = (await optionsRes.json()) as { excludeCredentials: { id: string }[] };
    expect(options.excludeCredentials.map((c) => c.id)).toEqual([authenticator.id]);
    const response = await other.register(options, { origin: BASE });
    const creation = await send(
      "POST",
      "/api/access/passkeys",
      { response },
      { cookies: { ...session, ...cookiesOf(optionsRes) } },
    );
    expect(creation.status).toBe(201);
    expect(((await creation.json()) as { recoveryCode: string | null }).recoveryCode).toBeNull();

    const remove = await send("DELETE", `/api/access/passkeys/${authenticator.id}`, undefined, {
      cookies: session,
    });
    expect(remove.status).toBe(204);
    expect((await signIn(authenticator)).status).toBe(401);
  });

  it("the passkey name comes from the browser", async () => {
    const session = await startTestSession();
    const a = await createVirtualAuthenticator();
    const optionsRes = await send("POST", "/api/access/passkeys/options", {}, { cookies: session });
    const response = await a.register(await optionsRes.json(), { origin: BASE });
    const creation = await call("/api/access/passkeys", {
      method: "POST",
      headers: {
        origin: BASE,
        "content-type": "application/json",
        cookie: Object.entries({ ...session, ...cookiesOf(optionsRes) })
          .map(([k, v]) => `${k}=${v}`)
          .join("; "),
        "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15",
      },
      body: JSON.stringify({ response }),
    });
    expect(((await creation.json()) as { passkey: { name: string } }).passkey.name).toBe("iPhone");
  });
});

describe("cookies in local development", () => {
  it("on http://localhost the cookie goes without __Host- or Secure (otherwise Safari doesn't keep it)", async () => {
    const { api } = await import("../../src/api/app");
    const res = await api.fetch(
      new Request("http://localhost:4321/api/access/claim", {
        method: "POST",
        headers: { origin: "http://localhost:4321", "content-type": "application/json" },
        body: JSON.stringify({ code: TEST_CLAIM_CODE }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    const [cookie] = res.headers.getSetCookie();
    expect(cookie).toMatch(/^tiendita_sesion=/);
    expect(cookie).not.toMatch(/Secure/);
    expect(cookie).toMatch(/HttpOnly/);
  });
});

describe("password (for devices without passkeys)", () => {
  const PASSWORD = "Tigre-Manzana-2026!";
  const NEW_PASSWORD = "Caballo-Violeta-7531?";

  /** Claim with a password only (no passkey). */
  const claimWithPassword = async (password = PASSWORD) =>
    send("POST", "/api/access/claim-key", { password }, { cookies: await claim() });

  it("claims the store with a password, which then signs in (case-sensitive)", async () => {
    const res = await claimWithPassword();
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ session: "completa" });

    expect((await send("POST", "/api/access/sign-in-key", { password: PASSWORD })).status).toBe(200);
    const wrongCase = await send("POST", "/api/access/sign-in-key", { password: PASSWORD.toLowerCase() });
    expect(wrongCase.status).toBe(422);
    expect(await errorCode(wrongCase)).toBe("INVALID_CODE");
  });

  it("a weak password is refused and nothing is claimed", async () => {
    const weak = await claimWithPassword("password1234");
    expect(weak.status).toBe(422);
    expect(await errorCode(weak)).toBe("WEAK_PASSWORD");
    const short = await claimWithPassword("Ab1!");
    expect(await errorCode(short)).toBe("WEAK_PASSWORD");
    expect((await send("POST", "/api/access/sign-in-key", { password: "Ab1!" })).status).toBe(422);
  });

  it("the owner changes the password (full session only); the old one stops working", async () => {
    const claimed = await claimWithPassword();
    const session = cookiesOf(claimed);

    expect((await send("POST", "/api/access/key", { password: NEW_PASSWORD })).status).toBe(401);
    const weak = await send("POST", "/api/access/key", { password: "password1234" }, { cookies: session });
    expect(await errorCode(weak)).toBe("WEAK_PASSWORD");

    const changed = await send("POST", "/api/access/key", { password: NEW_PASSWORD }, { cookies: session });
    expect(changed.status).toBe(204);
    expect((await send("POST", "/api/access/sign-in-key", { password: PASSWORD })).status).toBe(422);
    expect((await send("POST", "/api/access/sign-in-key", { password: NEW_PASSWORD })).status).toBe(200);
  });
});
