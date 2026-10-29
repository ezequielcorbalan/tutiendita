import { beforeEach, describe, expect, it } from "vitest";
import { type Credential, newSession, type Session } from "../../../src/packages/core/domain/access";
import { normalizeCode } from "../../../src/packages/core/domain/code";
import { domainError } from "../../../src/packages/core/domain/errors";
import { err, ok } from "../../../src/packages/core/domain/result";
import { secondsUntilNextWindow, windowStartOf } from "../../../src/packages/core/ports/attempt-limiter";
import {
  type AccessDeps,
  deletePasskey,
  finishPasskeyRegistration,
  finishSignIn,
  listPasskeys,
  MAX_SIGN_IN_REQUESTS,
  regenerateRecoveryCode,
  signInWithRecoveryCode,
  signOut,
  startPasskeyRegistration,
  startSignIn,
  validateClaimCode,
  validateSession,
} from "../../../src/packages/core/use-cases/access";
import {
  DeterministicCryptography,
  FakeWebAuthnCeremony,
  InMemoryAccessRepository,
  InMemoryChallengeRepository,
  InMemoryCredentialRepository,
  InMemoryLimiter,
  InMemorySessionRepository,
  MovingClock,
  sha256,
  verifiedCredential,
} from "./doubles/access";
import { InMemoryStoreRepository } from "./doubles/in-memory";

const ORIGIN = "https://tiendita.ana.workers.dev";
const RP_ID = "tiendita.ana.workers.dev";
const CLAIM_CODE = "7KQ2M9XD4RTAABCDEFGH0123";
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

let clock: MovingClock;
let credentials: InMemoryCredentialRepository;
let sessions: InMemorySessionRepository;
let access: InMemoryAccessRepository;
let challenges: InMemoryChallengeRepository;
let limiter: InMemoryLimiter;
let ceremony: FakeWebAuthnCeremony;
let deps: AccessDeps;

beforeEach(async () => {
  clock = new MovingClock(new Date("2026-10-15T10:00:00.000Z"));
  credentials = new InMemoryCredentialRepository();
  sessions = new InMemorySessionRepository();
  access = new InMemoryAccessRepository(credentials, sessions);
  challenges = new InMemoryChallengeRepository();
  limiter = new InMemoryLimiter();
  ceremony = new FakeWebAuthnCeremony();
  const hash = await sha256(CLAIM_CODE);
  deps = {
    access,
    credentials,
    sessions,
    challenges,
    limiter,
    ceremony,
    cryptography: new DeterministicCryptography(),
    clock,
    store: new InMemoryStoreRepository(),
    claimCodeHash: () => hash,
  };
});

const value = <T>(r: { ok: true; value: T } | { ok: false; error: unknown }): T => {
  if (!r.ok) throw new Error(`expected ok: ${JSON.stringify(r.error)}`);
  return r.value;
};
const codeOf = (r: { ok: boolean; error?: { code: string } } | { ok: false; error: { code: string } }) =>
  r.ok ? "OK" : (r as { error: { code: string } }).error.code;

async function sessionOf(type: Session["type"]) {
  const token = `token-${type}-${Math.random()}`;
  const s = newSession(await sha256(token), type, clock.now());
  await sessions.create(s);
  return { token, session: s };
}

const credential = (id: string, extra: Partial<Credential> = {}): Credential => ({
  ...verifiedCredential(id),
  rpId: RP_ID,
  origin: ORIGIN,
  name: "iPhone",
  createdAt: clock.now(),
  lastUsedAt: null,
  ...extra,
});

/** Full claim: code → options → registration. Returns the registration result. */
async function claim() {
  const claim = value(await validateClaimCode(deps)({ code: CLAIM_CODE, ip: "1.1.1.1" }));
  const { challengeId } = value(
    await startPasskeyRegistration(deps)({ session: claim.session, origin: ORIGIN }),
  );
  return value(
    await finishPasskeyRegistration(deps)({
      session: claim.session,
      origin: ORIGIN,
      challengeId,
      response: { id: "cred-1" },
      deviceName: "iPhone",
    }),
  );
}

describe("validateClaimCode", () => {
  it("with the build code (as people type it) creates a 15-minute claim session", async () => {
    const r = value(await validateClaimCode(deps)({ code: "7kq2-m9xd-4rta-abcd-efgh-o123", ip: "1.1.1.1" }));
    expect(r.session.type).toBe("reclamo");
    expect(r.session.expiresAt).toEqual(new Date(clock.now().getTime() + 15 * MINUTE));
    expect(r.session.idHash).toBe(await sha256(r.token));
    expect(await sessions.findByHash(r.session.idHash)).toEqual(r.session);
    expect(r.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("wrong code → INVALID_CODE and records an attempt", async () => {
    const r = await validateClaimCode(deps)({ code: "AAAA-BBBB", ip: "1.1.1.1" });
    expect(codeOf(r)).toBe("INVALID_CODE");
    expect([...limiter.failures.values()]).toEqual([1]);
    expect(sessions.byHash.size).toBe(0);
  });

  it("without a hash embedded in the build no code works", async () => {
    deps = { ...deps, claimCodeHash: () => null };
    expect(codeOf(await validateClaimCode(deps)({ code: CLAIM_CODE, ip: "x" }))).toBe("INVALID_CODE");
  });

  it("after 10 failures in the window → TOO_MANY_ATTEMPTS, even with the right code; it works again in the next window", async () => {
    for (let i = 0; i < 10; i += 1) await validateClaimCode(deps)({ code: "wrong", ip: "9.9.9.9" });
    const r = await validateClaimCode(deps)({ code: CLAIM_CODE, ip: "9.9.9.9" });
    expect(codeOf(r)).toBe("TOO_MANY_ATTEMPTS");
    if (!r.ok) expect(r.error.details).toEqual({ retryInSeconds: 15 * 60 });
    expect((await validateClaimCode(deps)({ code: CLAIM_CODE, ip: "8.8.8.8" })).ok).toBe(true);
    clock.advance(15 * MINUTE);
    expect((await validateClaimCode(deps)({ code: CLAIM_CODE, ip: "9.9.9.9" })).ok).toBe(true);
  });

  it("with the store already claimed → STORE_ALREADY_CLAIMED", async () => {
    await claim();
    expect(codeOf(await validateClaimCode(deps)({ code: CLAIM_CODE, ip: "1" }))).toBe(
      "STORE_ALREADY_CLAIMED",
    );
  });
});

describe("first passkey registration (claim)", () => {
  it("requests options with the host as rpId, a random user id and the default name", async () => {
    const claim = value(await validateClaimCode(deps)({ code: CLAIM_CODE, ip: "1" }));
    const r = value(await startPasskeyRegistration(deps)({ session: claim.session, origin: ORIGIN }));
    expect(r.options).toEqual({ type: "registration", rpId: RP_ID });
    const [input] = ceremony.records;
    expect(input).toMatchObject({
      rpId: RP_ID,
      rpName: "tiendita",
      userName: "Dueño de tiendita",
      displayName: "Dueño de tiendita",
      exclude: [],
    });
    expect(input?.webauthnUserId).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const challenge = challenges.byId.get(r.challengeId);
    expect(challenge).toMatchObject({
      challenge: "challenge-1",
      purpose: "registro",
      sessionIdHash: claim.session.idHash,
      webauthnUserId: input?.webauthnUserId,
      expiresAt: new Date(clock.now().getTime() + 5 * MINUTE),
    });
  });

  it("on verification claims the store, saves the credential and origin, issues the code and rotates to a full session", async () => {
    const r = await claim();
    expect(ceremony.registrationVerifications[0]).toMatchObject({
      challenge: "challenge-1",
      origin: ORIGIN,
      rpId: RP_ID,
    });
    expect(access.status).toMatchObject({ onboardingStep: "acceso", onboardingCompletedAt: null });
    expect(access.status?.webauthnUserId).toBe(ceremony.records[0]?.webauthnUserId);
    expect(access.origins).toEqual([{ origin: ORIGIN, rpId: RP_ID, primary: true }]);
    expect(await credentials.findById("cred-1")).toMatchObject({
      rpId: RP_ID,
      origin: ORIGIN,
      name: "iPhone",
      lastUsedAt: null,
    });
    expect(r.recoveryCode).toMatch(/^([0-9A-HJKMNP-TV-Z]{4}-){5}[0-9A-HJKMNP-TV-Z]{4}$/);
    expect(access.recoveryHash).toBe(await sha256(normalizeCode(r.recoveryCode ?? "")));
    expect(r.rotatedSession?.session.type).toBe("completa");
    expect([...sessions.byHash.values()].map((s) => s.type)).toEqual(["completa"]);
  });

  it("the challenge is single use: repeating the registration → CHALLENGE_EXPIRED", async () => {
    const claim = value(await validateClaimCode(deps)({ code: CLAIM_CODE, ip: "1" }));
    const { challengeId } = value(
      await startPasskeyRegistration(deps)({ session: claim.session, origin: ORIGIN }),
    );
    ceremony.registrationResult = err(domainError("PASSKEY_NOT_VERIFIED", "no"));
    const input = {
      session: claim.session,
      origin: ORIGIN,
      challengeId,
      response: {},
      deviceName: "x",
    };
    expect(codeOf(await finishPasskeyRegistration(deps)(input))).toBe("PASSKEY_NOT_VERIFIED");
    expect(codeOf(await finishPasskeyRegistration(deps)(input))).toBe("CHALLENGE_EXPIRED");
    expect(access.status).toBeNull();
  });

  it("expired, missing or requested by another session challenge → CHALLENGE_EXPIRED", async () => {
    const claim = value(await validateClaimCode(deps)({ code: CLAIM_CODE, ip: "1" }));
    const other = value(await validateClaimCode(deps)({ code: CLAIM_CODE, ip: "2" }));
    const base = { origin: ORIGIN, response: {}, deviceName: "x" };

    const a = value(await startPasskeyRegistration(deps)({ session: claim.session, origin: ORIGIN }));
    clock.advance(5 * MINUTE);
    expect(
      codeOf(
        await finishPasskeyRegistration(deps)({
          ...base,
          session: claim.session,
          challengeId: a.challengeId,
        }),
      ),
    ).toBe("CHALLENGE_EXPIRED");

    const b = value(await startPasskeyRegistration(deps)({ session: claim.session, origin: ORIGIN }));
    expect(
      codeOf(
        await finishPasskeyRegistration(deps)({
          ...base,
          session: other.session,
          challengeId: b.challengeId,
        }),
      ),
    ).toBe("CHALLENGE_EXPIRED");
    expect(
      codeOf(await finishPasskeyRegistration(deps)({ ...base, session: claim.session, challengeId: null })),
    ).toBe("CHALLENGE_EXPIRED");
    expect(ceremony.registrationVerifications).toEqual([]);
  });

  it("if another claim won in between, the claim session no longer works → STORE_ALREADY_CLAIMED", async () => {
    const slow = value(await validateClaimCode(deps)({ code: CLAIM_CODE, ip: "2" }));
    const { challengeId } = value(
      await startPasskeyRegistration(deps)({ session: slow.session, origin: ORIGIN }),
    );
    await claim();
    await sessions.create(slow.session); // the other claim deleted it; even if it were still alive, it is not enough
    const r = await finishPasskeyRegistration(deps)({
      session: slow.session,
      origin: ORIGIN,
      challengeId,
      response: {},
      deviceName: "x",
    });
    expect(codeOf(r)).toBe("STORE_ALREADY_CLAIMED");
    expect(codeOf(await startPasskeyRegistration(deps)({ session: slow.session, origin: ORIGIN }))).toBe(
      "STORE_ALREADY_CLAIMED",
    );
    expect(await credentials.count()).toBe(1);
  });

  it("if the repository says another one won the race → STORE_ALREADY_CLAIMED without a full session", async () => {
    const claim = value(await validateClaimCode(deps)({ code: CLAIM_CODE, ip: "1" }));
    const { challengeId } = value(
      await startPasskeyRegistration(deps)({ session: claim.session, origin: ORIGIN }),
    );
    access.claim = async () => false;
    const r = await finishPasskeyRegistration(deps)({
      session: claim.session,
      origin: ORIGIN,
      challengeId,
      response: {},
      deviceName: "x",
    });
    expect(codeOf(r)).toBe("STORE_ALREADY_CLAIMED");
    expect([...sessions.byHash.values()].map((s) => s.type)).toEqual(["reclamo"]);
  });

  it("an origin that is not http(s) → ORIGIN_NOT_ALLOWED", async () => {
    const claim = value(await validateClaimCode(deps)({ code: CLAIM_CODE, ip: "1" }));
    expect(codeOf(await startPasskeyRegistration(deps)({ session: claim.session, origin: "null" }))).toBe(
      "ORIGIN_NOT_ALLOWED",
    );
  });

  it("without an owner, a non-claim session cannot register → ACCESS_LIMITED", async () => {
    const { session } = await sessionOf("completa");
    expect(codeOf(await startPasskeyRegistration(deps)({ session, origin: ORIGIN }))).toBe("ACCESS_LIMITED");
    expect(
      codeOf(
        await finishPasskeyRegistration(deps)({
          session,
          origin: ORIGIN,
          challengeId: "x",
          response: {},
          deviceName: "x",
        }),
      ),
    ).toBe("CHALLENGE_EXPIRED");
  });
});

describe("more passkeys with a full session", () => {
  it("uses the allowed origin's rpId, excludes existing ones and issues no new code", async () => {
    const first = await claim();
    const session = first.rotatedSession?.session as Session;
    ceremony.registrationResult = ok(verifiedCredential("cred-2"));
    const { challengeId } = value(await startPasskeyRegistration(deps)({ session, origin: ORIGIN }));
    expect(ceremony.records[1]?.exclude).toEqual([{ id: "cred-1", transports: ["internal"] }]);
    expect(ceremony.records[1]?.webauthnUserId).toBe(access.status?.webauthnUserId);
    const hashBefore = access.recoveryHash;
    const r = value(
      await finishPasskeyRegistration(deps)({
        session,
        origin: ORIGIN,
        challengeId,
        response: {},
        deviceName: "Windows",
      }),
    );
    expect(r.recoveryCode).toBeNull();
    expect(r.rotatedSession).toBeNull();
    expect(access.recoveryHash).toBe(hashBefore);
    expect((await listPasskeys(deps)()).map((c) => c.id)).toEqual(["cred-1", "cred-2"]);
  });

  it("a credential with an already registered id does not overwrite the existing one → PASSKEY_ALREADY_REGISTERED", async () => {
    const first = await claim();
    const session = first.rotatedSession?.session as Session;
    const previous = await credentials.findById("cred-1");
    const { challengeId } = value(await startPasskeyRegistration(deps)({ session, origin: ORIGIN }));
    const r = await finishPasskeyRegistration(deps)({
      session,
      origin: ORIGIN,
      challengeId,
      response: {},
      deviceName: "Other",
    });
    expect(codeOf(r)).toBe("PASSKEY_ALREADY_REGISTERED");
    expect(await credentials.findById("cred-1")).toEqual(previous);
  });

  it("from an origin not in the table (e.g. a preview) → ORIGIN_NOT_ALLOWED", async () => {
    const first = await claim();
    const session = first.rotatedSession?.session as Session;
    const r = await startPasskeyRegistration(deps)({
      session,
      origin: "https://abc123-tiendita.ana.workers.dev",
    });
    expect(codeOf(r)).toBe("ORIGIN_NOT_ALLOWED");
  });

  it("uses the store name for the passkey manager when it already exists", async () => {
    await claim();
    deps = {
      ...deps,
      store: new InMemoryStoreRepository({
        id: "t",
        name: "Panadería La Espiga",
        description: "",
        logoKey: null,
        currency: "ARS",
        language: "es",
        contact: { whatsapp: null, email: null },
        domain: null,
        heartbeatEnabled: true,
        heartbeatSentAt: null,
      }),
    };
    const { session } = await sessionOf("completa");
    value(await startPasskeyRegistration(deps)({ session, origin: ORIGIN }));
    expect(ceremony.records.at(-1)).toMatchObject({
      rpName: "Panadería La Espiga",
      userName: "Panadería La Espiga",
      displayName: "Panadería La Espiga",
    });
  });
});

describe("sign-in with passkey", () => {
  beforeEach(async () => {
    await claim();
  });

  it("options with the allowed origin's rpId and a sign-in challenge", async () => {
    const r = value(await startSignIn(deps)({ origin: ORIGIN, ip: "1" }));
    expect(ceremony.signIns).toEqual([{ rpId: RP_ID }]);
    expect(challenges.byId.get(r.challengeId)).toMatchObject({ purpose: "ingreso", sessionIdHash: null });
  });

  it("verifies, updates counter and last use, and creates a full session", async () => {
    const { challengeId } = value(await startSignIn(deps)({ origin: ORIGIN, ip: "1" }));
    clock.advance(MINUTE);
    const r = value(
      await finishSignIn(deps)({
        origin: ORIGIN,
        challengeId,
        credentialId: "cred-1",
        response: { id: "cred-1" },
      }),
    );
    expect(r.session.type).toBe("completa");
    expect(ceremony.signInVerifications[0]).toMatchObject({ origin: ORIGIN, rpId: RP_ID });
    expect(await credentials.findById("cred-1")).toMatchObject({
      counter: 7,
      lastUsedAt: clock.now(),
    });
  });

  it("unknown passkey or from another rpId → UNKNOWN_PASSKEY, without verifying", async () => {
    await credentials.save(credential("cred-foreign", { rpId: "other.workers.dev" }));
    for (const credentialId of ["missing", "cred-foreign"]) {
      const { challengeId } = value(await startSignIn(deps)({ origin: ORIGIN, ip: "1" }));
      const r = await finishSignIn(deps)({ origin: ORIGIN, challengeId, credentialId, response: {} });
      expect(codeOf(r)).toBe("UNKNOWN_PASSKEY");
    }
    expect(ceremony.signInVerifications).toEqual([]);
  });

  it("invalid signature → PASSKEY_NOT_VERIFIED and no session is created", async () => {
    ceremony.signInResult = err(domainError("PASSKEY_NOT_VERIFIED", "no"));
    const previous = sessions.byHash.size;
    const { challengeId } = value(await startSignIn(deps)({ origin: ORIGIN, ip: "1" }));
    const r = await finishSignIn(deps)({
      origin: ORIGIN,
      challengeId,
      credentialId: "cred-1",
      response: {},
    });
    expect(codeOf(r)).toBe("PASSKEY_NOT_VERIFIED");
    expect(sessions.byHash.size).toBe(previous);
  });

  it("registration, expired or reused challenge → CHALLENGE_EXPIRED", async () => {
    const { session } = await sessionOf("completa");
    const registration = value(await startPasskeyRegistration(deps)({ session, origin: ORIGIN }));
    const input = { origin: ORIGIN, credentialId: "cred-1", response: {} };
    expect(codeOf(await finishSignIn(deps)({ ...input, challengeId: registration.challengeId }))).toBe(
      "CHALLENGE_EXPIRED",
    );
    const { challengeId } = value(await startSignIn(deps)({ origin: ORIGIN, ip: "1" }));
    clock.advance(6 * MINUTE);
    expect(codeOf(await finishSignIn(deps)({ ...input, challengeId }))).toBe("CHALLENGE_EXPIRED");
    expect(codeOf(await finishSignIn(deps)({ ...input, challengeId }))).toBe("CHALLENGE_EXPIRED");
  });

  it("origin not allowed → ORIGIN_NOT_ALLOWED (options and verification)", async () => {
    expect(codeOf(await startSignIn(deps)({ origin: "https://other.example", ip: "1" }))).toBe(
      "ORIGIN_NOT_ALLOWED",
    );
    const { challengeId } = value(await startSignIn(deps)({ origin: ORIGIN, ip: "1" }));
    const r = await finishSignIn(deps)({
      origin: "https://other.example",
      challengeId,
      credentialId: "cred-1",
      response: {},
    });
    expect(codeOf(r)).toBe("ORIGIN_NOT_ALLOWED");
  });

  it("before the claim there is no sign-in → ORIGIN_NOT_ALLOWED", async () => {
    access.status = null;
    expect(codeOf(await startSignIn(deps)({ origin: ORIGIN, ip: "1" }))).toBe("ORIGIN_NOT_ALLOWED");
    const r = await finishSignIn(deps)({
      origin: ORIGIN,
      challengeId: "x",
      credentialId: "cred-1",
      response: {},
    });
    expect(codeOf(r)).toBe("CHALLENGE_EXPIRED");
  });

  it("signing in deletes expired sessions", async () => {
    const old = newSession("old", "completa", new Date("2026-01-01T00:00:00.000Z"));
    await sessions.create(old);
    const { challengeId } = value(await startSignIn(deps)({ origin: ORIGIN, ip: "1" }));
    value(await finishSignIn(deps)({ origin: ORIGIN, challengeId, credentialId: "cred-1", response: {} }));
    expect(await sessions.findByHash("old")).toBeNull();
  });
});

describe("sign-in request limit", () => {
  it("each options request writes a challenge: 30 per IP every 15 minutes, then TOO_MANY_ATTEMPTS", async () => {
    await claim();
    for (let i = 0; i < MAX_SIGN_IN_REQUESTS; i += 1) {
      value(await startSignIn(deps)({ origin: ORIGIN, ip: "9" }));
    }
    const challengesBefore = challenges.byId.size;
    expect(codeOf(await startSignIn(deps)({ origin: ORIGIN, ip: "9" }))).toBe("TOO_MANY_ATTEMPTS");
    expect(challenges.byId.size).toBe(challengesBefore);
    expect((await startSignIn(deps)({ origin: ORIGIN, ip: "10" })).ok).toBe(true);
    clock.advance(15 * MINUTE);
    expect((await startSignIn(deps)({ origin: ORIGIN, ip: "9" })).ok).toBe(true);
  });
});

describe("recovery code", () => {
  let code: string;
  beforeEach(async () => {
    code = (await claim()).recoveryCode ?? "";
  });

  /** Sign-in with the code → options → registration with the recovery session. */
  async function registerWithRecovery(session: Session, credId = "cred-new") {
    ceremony.registrationResult = ok(verifiedCredential(credId));
    const { challengeId } = value(await startPasskeyRegistration(deps)({ session, origin: ORIGIN }));
    return finishPasskeyRegistration(deps)({
      session,
      origin: ORIGIN,
      challengeId,
      response: {},
      deviceName: "Android",
    });
  }

  it("signing in with the code deletes all sessions and creates a recovery one, without spending the code", async () => {
    await sessionOf("completa");
    const r = value(await signInWithRecoveryCode(deps)({ code: code.toLowerCase(), ip: "1" }));
    expect(r.session.type).toBe("recuperacion");
    expect([...sessions.byHash.values()]).toEqual([r.session]);
    // If the browser could not create the passkey, the person signs in again with the same code.
    const other = value(await signInWithRecoveryCode(deps)({ code, ip: "1" }));
    expect([...sessions.byHash.values()]).toEqual([other.session]);
  });

  it("two racing sign-ins with the same code: a single recovery session stays alive", async () => {
    const [a, b] = await Promise.all([
      signInWithRecoveryCode(deps)({ code, ip: "1" }),
      signInWithRecoveryCode(deps)({ code, ip: "2" }),
    ]);
    expect(a.ok && b.ok).toBe(true);
    expect([...sessions.byHash.values()].filter((s) => s.type === "recuperacion")).toHaveLength(1);
  });

  it("the code is spent when the passkey is registered: afterwards it no longer works", async () => {
    const rec = value(await signInWithRecoveryCode(deps)({ code, ip: "1" }));
    value(await registerWithRecovery(rec.session));
    expect(codeOf(await signInWithRecoveryCode(deps)({ code, ip: "1" }))).toBe("INVALID_CODE");
  });

  it("if the passkey registration fails, the code still works", async () => {
    const rec = value(await signInWithRecoveryCode(deps)({ code, ip: "1" }));
    const { challengeId } = value(
      await startPasskeyRegistration(deps)({ session: rec.session, origin: ORIGIN }),
    );
    ceremony.registrationResult = err(domainError("PASSKEY_NOT_VERIFIED", "no"));
    const r = await finishPasskeyRegistration(deps)({
      session: rec.session,
      origin: ORIGIN,
      challengeId,
      response: {},
      deviceName: "Android",
    });
    expect(codeOf(r)).toBe("PASSKEY_NOT_VERIFIED");
    expect((await signInWithRecoveryCode(deps)({ code, ip: "1" })).ok).toBe(true);
  });

  it("with the recovery session, an already registered passkey → PASSKEY_ALREADY_REGISTERED and the code still works", async () => {
    const rec = value(await signInWithRecoveryCode(deps)({ code, ip: "1" }));
    expect(codeOf(await registerWithRecovery(rec.session, "cred-1"))).toBe("PASSKEY_ALREADY_REGISTERED");
    expect((await signInWithRecoveryCode(deps)({ code, ip: "1" })).ok).toBe(true);
  });

  it("effectively single use: with two live recovery sessions, only one registers a passkey", async () => {
    const a = await sessionOf("recuperacion");
    const b = await sessionOf("recuperacion");
    value(await registerWithRecovery(a.session, "cred-a"));
    expect(codeOf(await registerWithRecovery(b.session, "cred-b"))).toBe("INVALID_CODE");
    expect((await listPasskeys(deps)()).map((c) => c.id)).toEqual(["cred-1", "cred-a"]);
  });

  it("wrong code → INVALID_CODE, records an attempt and blocks at 10", async () => {
    for (let i = 0; i < 10; i += 1) {
      expect(codeOf(await signInWithRecoveryCode(deps)({ code: "x", ip: "5" }))).toBe("INVALID_CODE");
    }
    expect(codeOf(await signInWithRecoveryCode(deps)({ code, ip: "5" }))).toBe("TOO_MANY_ATTEMPTS");
    expect(access.recoveryHash).not.toBeNull();
  });

  it("with the recovery session a new passkey is registered: issues a new code and moves to full", async () => {
    const rec = value(await signInWithRecoveryCode(deps)({ code, ip: "1" }));
    const r = value(await registerWithRecovery(rec.session));
    expect(r.recoveryCode).not.toBeNull();
    expect(r.recoveryCode).not.toBe(code);
    expect(access.recoveryHash).toBe(await sha256(normalizeCode(r.recoveryCode ?? "")));
    expect(r.rotatedSession?.session.type).toBe("completa");
    expect(await sessions.findByHash(rec.session.idHash)).toBeNull();
    expect((await listPasskeys(deps)()).map((c) => c.id)).toEqual(["cred-1", "cred-new"]);
  });

  it("regenerating invalidates the previous one and returns a new formatted one", async () => {
    const fresh = await regenerateRecoveryCode(deps)();
    expect(fresh).not.toBe(code);
    expect(codeOf(await signInWithRecoveryCode(deps)({ code, ip: "1" }))).toBe("INVALID_CODE");
    expect((await signInWithRecoveryCode(deps)({ code: fresh, ip: "1" })).ok).toBe(true);
  });
});

describe("validateSession and signOut", () => {
  beforeEach(async () => {
    await claim();
  });

  it("no token, unknown token or expired session → NOT_AUTHENTICATED (and the expired one is deleted)", async () => {
    expect(codeOf(await validateSession(deps)(null))).toBe("NOT_AUTHENTICATED");
    expect(codeOf(await validateSession(deps)("missing"))).toBe("NOT_AUTHENTICATED");
    const { token, session } = await sessionOf("reclamo");
    clock.advance(15 * MINUTE);
    expect(codeOf(await validateSession(deps)(token))).toBe("NOT_AUTHENTICATED");
    expect(await sessions.findByHash(session.idHash)).toBeNull();
  });

  it("valid → the session, not renewed if a day has not passed", async () => {
    const { token, session } = await sessionOf("completa");
    clock.advance(DAY - 1);
    expect(value(await validateSession(deps)(token))).toEqual({ session, renewed: false });
  });

  it("a full one used after a day is renewed 30 days from now", async () => {
    const { token, session } = await sessionOf("completa");
    clock.advance(DAY);
    const r = value(await validateSession(deps)(token));
    expect(r.renewed).toBe(true);
    expect(r.session.expiresAt).toEqual(new Date(clock.now().getTime() + 30 * DAY));
    expect(await sessions.findByHash(session.idHash)).toEqual(r.session);
  });

  it("if the access row was deleted (emergency plan) full sessions stop being valid", async () => {
    const { token } = await sessionOf("completa");
    access.status = null;
    expect(codeOf(await validateSession(deps)(token))).toBe("NOT_AUTHENTICATED");
  });

  it("signOut deletes the row", async () => {
    const { token, session } = await sessionOf("completa");
    await signOut(deps)(session.idHash);
    expect(codeOf(await validateSession(deps)(token))).toBe("NOT_AUTHENTICATED");
  });
});

describe("deletePasskey", () => {
  beforeEach(async () => {
    await claim();
  });

  it("does not allow deleting the last one → LAST_PASSKEY", async () => {
    expect(codeOf(await deletePasskey(deps)("cred-1"))).toBe("LAST_PASSKEY");
    expect(await credentials.count()).toBe(1);
  });

  it("with two, deletes the requested one; a missing one does nothing", async () => {
    await credentials.save(credential("cred-2"));
    expect((await deletePasskey(deps)("cred-1")).ok).toBe(true);
    expect((await deletePasskey(deps)("missing")).ok).toBe(true);
    expect((await listPasskeys(deps)()).map((c) => c.id)).toEqual(["cred-2"]);
  });

  it("if the repository refuses to delete the last one (racing delete) → LAST_PASSKEY", async () => {
    await credentials.save(credential("cred-2"));
    await Promise.all([deletePasskey(deps)("cred-1"), deletePasskey(deps)("cred-2")]).then((rs) =>
      expect(rs.map(codeOf).sort()).toEqual(["LAST_PASSKEY", "OK"]),
    );
    expect(await credentials.count()).toBe(1);
  });
});

describe("limiter windows", () => {
  it("start at multiples of 15 minutes", () => {
    expect(windowStartOf(new Date("2026-10-15T10:14:59.000Z"))).toEqual(new Date("2026-10-15T10:00:00.000Z"));
    expect(secondsUntilNextWindow(new Date("2026-10-15T10:14:00.500Z"))).toBe(60);
  });
});
