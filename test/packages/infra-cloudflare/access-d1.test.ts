import { env } from "cloudflare:test";
import type { ClaimData, Credential, Session } from "../../../src/packages/core/index";
import { beforeEach, describe, expect, it } from "vitest";
import { createD1AccessRepository } from "../../../src/packages/infra-cloudflare/d1/access-repository-d1";
import { createD1CredentialRepository } from "../../../src/packages/infra-cloudflare/d1/credential-repository-d1";
import { createD1SessionRepository } from "../../../src/packages/infra-cloudflare/d1/session-repository-d1";

const T0 = new Date("2026-10-15T10:00:00.000Z");
const ORIGIN = {
  origin: "https://tiendita.ana.workers.dev",
  rpId: "tiendita.ana.workers.dev",
  primary: true,
};

const credential = (id: string, extra: Partial<Credential> = {}): Credential => ({
  id,
  publicKeyBytes: Uint8Array.from([0xa5, 1, 2, 3, 0, 255]),
  counter: 0,
  transports: ["internal", "hybrid"],
  deviceType: "multiDevice",
  backedUp: true,
  rpId: ORIGIN.rpId,
  origin: ORIGIN.origin,
  name: "iPhone",
  createdAt: T0,
  lastUsedAt: null,
  ...extra,
});

const claim = (webauthnUserId: string, credId = "cred-1"): ClaimData => ({
  webauthnUserId,
  now: T0,
  origin: ORIGIN,
  credential: credential(credId),
  recoveryCodeHash: `hash-${webauthnUserId}`,
  keyHash: null,
});

async function clearAccess() {
  await env.DB.batch(
    [
      "acceso",
      "origenes_permitidos",
      "credenciales_passkey",
      "sesiones",
      "desafios_webauthn",
      "intentos_fallidos",
    ].map((t) => env.DB.prepare(`DELETE FROM ${t}`)),
  );
}

const access = createD1AccessRepository(env.DB);
const credentials = createD1CredentialRepository(env.DB);
const sessions = createD1SessionRepository(env.DB);

beforeEach(clearAccess);

describe("D1AccessRepository", () => {
  it("unclaimed: get → null and no origins", async () => {
    expect(await access.get()).toBeNull();
    expect(await access.allowedOrigins()).toEqual([]);
  });

  it("replaceSecondaryOrigins swaps the custom domain's origin and never touches the primary one", async () => {
    await access.claim(claim("uid-a"));
    const domain = (host: string) => ({ origin: `https://${host}`, rpId: ORIGIN.rpId, primary: false });
    await access.replaceSecondaryOrigins([domain("a.ejemplo.com")], T0);
    await access.replaceSecondaryOrigins([domain("b.ejemplo.com")], T0);
    expect(await access.allowedOrigins()).toEqual([ORIGIN, domain("b.ejemplo.com")]);
    await access.replaceSecondaryOrigins([], T0);
    expect(await access.allowedOrigins()).toEqual([ORIGIN]);
  });

  it("claim inserts access, primary origin and credential in one transaction", async () => {
    expect(await access.claim(claim("uid-a"))).toBe(true);
    expect(await access.get()).toEqual({
      webauthnUserId: "uid-a",
      claimedAt: T0,
      onboardingStep: "acceso",
      onboardingCompletedAt: null,
    });
    expect(await access.allowedOrigins()).toEqual([ORIGIN]);
    expect(await credentials.findById("cred-1")).toEqual(credential("cred-1"));
    const row = await env.DB.prepare(
      "SELECT codigo_recuperacion_hash, codigo_recuperacion_creado_en FROM acceso",
    ).first();
    expect(row).toEqual({
      codigo_recuperacion_hash: "hash-uid-a",
      codigo_recuperacion_creado_en: T0.toISOString(),
    });
  });

  it("two claims: the second loses, leaves no credential and overwrites nothing", async () => {
    const [a, b] = await Promise.all([
      access.claim(claim("uid-a", "cred-a")),
      access.claim(claim("uid-b", "cred-b")),
    ]);
    expect([a, b].filter(Boolean)).toHaveLength(1);
    const winner = a ? "a" : "b";
    expect((await access.get())?.webauthnUserId).toBe(`uid-${winner}`);
    expect((await credentials.list()).map((c) => c.id)).toEqual([`cred-${winner}`]);
    expect(await access.claim(claim("uid-c", "cred-c"))).toBe(false);
    expect(await credentials.count()).toBe(1);
  });

  it("emergency plan: after deleting the access row, claiming replaces old credentials, origins and sessions", async () => {
    await access.claim(claim("uid-old", "cred-old"));
    await sessions.create({
      idHash: "old",
      type: "completa",
      createdAt: T0,
      expiresAt: new Date("2027-01-01"),
      lastUsedAt: T0,
    });
    await env.DB.prepare("DELETE FROM acceso").run();
    expect(await access.claim(claim("uid-new", "cred-new"))).toBe(true);
    expect((await credentials.list()).map((c) => c.id)).toEqual(["cred-new"]);
    expect(await sessions.findByHash("old")).toBeNull();
    expect(await access.allowedOrigins()).toEqual([ORIGIN]);
  });

  it("emergency plan: without an access row old origins do not count (can claim from another address)", async () => {
    await access.claim(claim("uid-old"));
    await env.DB.prepare("DELETE FROM acceso").run();
    expect(await access.allowedOrigins()).toEqual([]);
  });

  const session = (idHash: string, type: Session["type"] = "recuperacion"): Session => ({
    idHash,
    type,
    createdAt: T0,
    expiresAt: new Date("2026-10-15T10:15:00.000Z"),
    lastUsedAt: T0,
  });
  const recovery = (sessionIdHash: string, credId: string, newHash: string) => ({
    sessionIdHash,
    credential: credential(credId),
    recoveryCodeHash: newHash,
    now: new Date("2026-10-15T10:05:00.000Z"),
  });
  const currentHash = async () =>
    (await env.DB.prepare("SELECT codigo_recuperacion_hash AS h FROM acceso").first<string>("h")) ?? null;

  it("startRecovery: with the current code deletes all sessions and creates the recovery one, without using it up", async () => {
    await access.claim(claim("uid-a"));
    await sessions.create(session("old", "completa"));
    expect(await access.startRecovery("other", session("rec-x"))).toBe(false);
    expect(await sessions.findByHash("old")).not.toBeNull();
    expect(await sessions.findByHash("rec-x")).toBeNull();

    expect(await access.startRecovery("hash-uid-a", session("rec-1"))).toBe(true);
    expect(await sessions.findByHash("old")).toBeNull();
    expect(await sessions.findByHash("rec-1")).toEqual(session("rec-1"));
    expect(await currentHash()).toBe("hash-uid-a");
  });

  it("finishRecovery: saves the credential, replaces the code and deletes recovery sessions", async () => {
    await access.claim(claim("uid-a"));
    await access.startRecovery("hash-uid-a", session("rec-1"));
    expect(await access.finishRecovery(recovery("rec-1", "cred-2", "new"))).toBe(true);
    expect(await currentHash()).toBe("new");
    expect((await credentials.list()).map((c) => c.id)).toEqual(["cred-1", "cred-2"]);
    expect(await sessions.findByHash("rec-1")).toBeNull();
    const row = await env.DB.prepare("SELECT codigo_recuperacion_creado_en AS d FROM acceso").first("d");
    expect(row).toBe("2026-10-15T10:05:00.000Z");
  });

  it("finishRecovery: a single effective use even with two racing recovery sessions", async () => {
    await access.claim(claim("uid-a"));
    await sessions.create(session("rec-a"));
    await sessions.create(session("rec-b"));
    const usages = await Promise.all([
      access.finishRecovery(recovery("rec-a", "cred-a", "new-a")),
      access.finishRecovery(recovery("rec-b", "cred-b", "new-b")),
    ]);
    expect(usages.sort()).toEqual([false, true]);
    expect(await credentials.count()).toBe(2);
    expect(["new-a", "new-b"]).toContain(await currentHash());
  });

  it("finishRecovery: without a recovery session (other, expired or of another type) nothing changes", async () => {
    await access.claim(claim("uid-a"));
    await sessions.create(session("completa", "completa"));
    await sessions.create({ ...session("expired"), expiresAt: new Date("2026-10-15T10:01:00.000Z") });
    for (const id of ["missing", "completa", "expired"]) {
      expect(await access.finishRecovery(recovery(id, "cred-2", "new"))).toBe(false);
    }
    expect(await currentHash()).toBe("hash-uid-a");
    expect(await credentials.count()).toBe(1);
  });

  it("replaceRecoveryCode invalidates the previous one", async () => {
    await access.claim(claim("uid-a"));
    await access.replaceRecoveryCode("new", new Date("2026-10-16T00:00:00.000Z"));
    expect(await access.startRecovery("hash-uid-a", session("rec-1"))).toBe(false);
    expect(await access.startRecovery("new", session("rec-2"))).toBe(true);
  });

  it("saves onboarding progress", async () => {
    await access.claim(claim("uid-a"));
    await access.saveOnboarding("whatsapp", null);
    expect(await access.get()).toMatchObject({
      onboardingStep: "whatsapp",
      onboardingCompletedAt: null,
    });
    const end = new Date("2026-10-15T10:05:00.000Z");
    await access.saveOnboarding("producto", end);
    expect(await access.get()).toMatchObject({
      onboardingStep: "producto",
      onboardingCompletedAt: end,
    });
  });
});

describe("D1CredentialRepository", () => {
  beforeEach(async () => {
    await access.claim(claim("uid-a"));
  });

  it("stores the public key as bytes and returns it unchanged", async () => {
    await credentials.save(
      credential("cred-2", { name: "Windows", backedUp: false, deviceType: "singleDevice" }),
    );
    const c = await credentials.findById("cred-2");
    expect(c?.publicKeyBytes).toBeInstanceOf(Uint8Array);
    expect(c).toEqual(credential("cred-2", { name: "Windows", backedUp: false, deviceType: "singleDevice" }));
    expect(await credentials.findById("no")).toBeNull();
  });

  it("saving with an existing id does not overwrite the credential → false", async () => {
    expect(await credentials.save(credential("cred-1", { name: "Intruder", counter: 99 }))).toBe(false);
    expect(await credentials.findById("cred-1")).toEqual(credential("cred-1"));
    expect(await credentials.save(credential("cred-2"))).toBe(true);
  });

  it("updates counter and last use, deletes and counts", async () => {
    await credentials.save(credential("cred-2"));
    const usage = new Date("2026-10-15T11:00:00.000Z");
    await credentials.updateUsage("cred-1", 5, usage);
    expect(await credentials.findById("cred-1")).toMatchObject({ counter: 5, lastUsedAt: usage });
    expect(await credentials.count()).toBe(2);
    expect(await credentials.deleteUnlessLast("cred-1")).toBe(true);
    expect((await credentials.list()).map((c) => c.id)).toEqual(["cred-2"]);
  });

  it("never deletes the last passkey, even when the last two are deleted in a race", async () => {
    expect(await credentials.deleteUnlessLast("cred-1")).toBe(false);
    await credentials.save(credential("cred-2"));
    const deleted = await Promise.all([
      credentials.deleteUnlessLast("cred-1"),
      credentials.deleteUnlessLast("cred-2"),
    ]);
    expect(deleted.sort()).toEqual([false, true]);
    expect(await credentials.count()).toBe(1);
  });
});
