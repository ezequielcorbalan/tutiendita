import {
  type AccessState,
  type AllowedOrigin,
  CHALLENGE_DURATION,
  type Credential,
  hostOfOrigin,
  isSessionValid,
  newSession,
  SESSION_DURATION,
  type Session,
  type SessionType,
  shouldRenew,
} from "../domain/access";
import { CODE_BYTES, codeFromBytes, formatCode, normalizeCode, toBase64Url } from "../domain/code";
import { type DomainError, domainError } from "../domain/errors";
import { passwordProblem } from "../domain/password";
import { err, ok, type Result } from "../domain/result";
import type { AccessRepository } from "../ports/access-repository";
import { type AttemptLimiter, secondsUntilNextWindow } from "../ports/attempt-limiter";
import type { Challenge, ChallengePurpose, ChallengeRepository } from "../ports/challenge-repository";
import type { Clock } from "../ports/clock";
import type { CredentialRepository } from "../ports/credential-repository";
import type { ClaimCodeHash, Cryptography } from "../ports/cryptography";
import type { SessionRepository } from "../ports/session-repository";
import type { StoreRepository } from "../ports/store-repository";
import type { WebAuthnCeremony } from "../ports/webauthn-ceremony";

export type AccessDeps = {
  access: AccessRepository;
  credentials: CredentialRepository;
  sessions: SessionRepository;
  challenges: ChallengeRepository;
  limiter: AttemptLimiter;
  ceremony: WebAuthnCeremony;
  cryptography: Cryptography;
  clock: Clock;
  store: StoreRepository;
  claimCodeHash: ClaimCodeHash;
};

/** The plain token goes only to the cookie; D1 keeps `session.idHash`. */
export type StartedSession = { token: string; session: Session };
export type BrowserOptions = { options: unknown; challengeId: string };

/** Shown to people in their passkey manager: Spanish on purpose. */
const DEFAULT_NAME = "Dueño de tiendita";
/** Sign-in option requests per IP and window (each one writes a challenge to D1; no session). */
export const MAX_SIGN_IN_REQUESTS = 30;
const TOKEN_BYTES = 32;

const fail = <T>(code: DomainError["code"], message: string, details?: Record<string, unknown>) =>
  err(domainError(code, message, details)) as Result<T, DomainError>;

const random = (deps: AccessDeps, n = TOKEN_BYTES) => toBase64Url(deps.cryptography.randomBytes(n));

async function createSession(deps: AccessDeps, type: SessionType): Promise<StartedSession> {
  const token = random(deps);
  const now = deps.clock.now();
  await deps.sessions.deleteExpired(now);
  const session = newSession(await deps.cryptography.sha256Hex(token), type, now);
  await deps.sessions.create(session);
  return { token, session };
}

/** Moves from `reclamo`/`recuperacion` to `completa` with a new id (the old one no longer works). */
async function rotateToFull(deps: AccessDeps, old: Session): Promise<StartedSession> {
  await deps.sessions.remove(old.idHash);
  return createSession(deps, "completa");
}

async function newCode(deps: AccessDeps): Promise<{ code: string; hash: string }> {
  const code = codeFromBytes(deps.cryptography.randomBytes(CODE_BYTES));
  return { code: formatCode(code), hash: await deps.cryptography.sha256Hex(code) };
}

/**
 * Before the claim, the `rpId` is the host of the request's origin (the middleware already required the
 * `Origin` to match it). Afterwards, only the origins in the table are valid.
 */
async function originFor(
  deps: AccessDeps,
  origin: string,
  status: AccessState | null,
): Promise<Result<AllowedOrigin, DomainError>> {
  if (status === null) {
    const rpId = hostOfOrigin(origin);
    return rpId === null
      ? fail("ORIGIN_NOT_ALLOWED", "This origin cannot use passkeys", { origin })
      : ok({ origin, rpId, primary: true });
  }
  const allowed = (await deps.access.allowedOrigins()).find((o) => o.origin === origin);
  return allowed === undefined
    ? fail("ORIGIN_NOT_ALLOWED", "The store cannot be accessed from this address", { origin })
    : ok(allowed);
}

async function saveChallenge(
  deps: AccessDeps,
  challenge: string,
  purpose: ChallengePurpose,
  extra: { sessionIdHash: string | null; webauthnUserId: string | null },
): Promise<string> {
  const id = random(deps);
  const expiresAt = new Date(deps.clock.now().getTime() + CHALLENGE_DURATION);
  await deps.challenges.save({ id, challenge, purpose, expiresAt, ...extra });
  return id;
}

async function consumeChallenge(
  deps: AccessDeps,
  id: string | null | undefined,
  purpose: ChallengePurpose,
  sessionIdHash: string | null,
): Promise<Result<Challenge, DomainError>> {
  const d = id ? await deps.challenges.consume(id) : null;
  const valid =
    d !== null &&
    d.purpose === purpose &&
    d.sessionIdHash === sessionIdHash &&
    deps.clock.now().getTime() < d.expiresAt.getTime();
  return valid
    ? ok(d)
    : fail("CHALLENGE_EXPIRED", "Too much time passed or the request was already used. Try again.");
}

async function blocked(
  deps: AccessDeps,
  key: string,
  max?: number,
): Promise<Result<never, DomainError> | null> {
  const now = deps.clock.now();
  if (!(await deps.limiter.isBlocked(key, now, max))) return null;
  return fail("TOO_MANY_ATTEMPTS", "Too many attempts. Wait a few minutes and try again.", {
    retryInSeconds: secondsUntilNextWindow(now),
  });
}

const invalidCode = <T>() => fail<T>("INVALID_CODE", "The code is not correct.");
const weakPassword = <T>(problem: "TOO_SHORT" | "TOO_WEAK") =>
  fail<T>("WEAK_PASSWORD", "The password does not meet the rules", { problem });
const alreadyRegistered = <T>() =>
  fail<T>("PASSKEY_ALREADY_REGISTERED", "That passkey is already registered in the store");

/** Without an owner, only a claim session registers; with an owner, a claim session came too late. */
function checkSessionCanRegister(status: AccessState | null, session: Session): Result<true, DomainError> {
  if (status === null && session.type !== "reclamo") {
    return fail("ACCESS_LIMITED", "The store must be claimed first");
  }
  if (status !== null && session.type === "reclamo") {
    return fail("STORE_ALREADY_CLAIMED", "This store already has an owner");
  }
  return ok(true);
}

export const validateClaimCode =
  (deps: AccessDeps) =>
  async (e: { code: string; ip: string }): Promise<Result<StartedSession, DomainError>> => {
    if ((await deps.access.get()) !== null) {
      return fail("STORE_ALREADY_CLAIMED", "This store already has an owner");
    }
    // Rate-limit key prefixes (`reclamo:`, `ingreso:`, `recuperacion:`) are stored in D1: kept in Spanish.
    const key = `reclamo:${e.ip}`;
    const limit = await blocked(deps, key);
    if (limit) return limit;
    const expected = deps.claimCodeHash();
    const hash = await deps.cryptography.sha256Hex(normalizeCode(e.code));
    if (expected === null || !deps.cryptography.constantTimeEquals(hash, expected)) {
      await deps.limiter.recordFailure(key, deps.clock.now());
      return invalidCode();
    }
    return ok(await createSession(deps, "reclamo"));
  };

export const startPasskeyRegistration =
  (deps: AccessDeps) =>
  async (e: { session: Session; origin: string }): Promise<Result<BrowserOptions, DomainError>> => {
    const status = await deps.access.get();
    const canRegister = checkSessionCanRegister(status, e.session);
    if (!canRegister.ok) return canRegister;
    const origin = await originFor(deps, e.origin, status);
    if (!origin.ok) return origin;
    const webauthnUserId = status?.webauthnUserId ?? random(deps);
    const store = await deps.store.get();
    const name = store?.name ?? DEFAULT_NAME;
    // Without an owner, leftover credentials (emergency plan) are deleted on claim.
    const exclude = status === null ? [] : await deps.credentials.list();
    const { options, challenge } = await deps.ceremony.registrationOptions({
      rpId: origin.value.rpId,
      rpName: store?.name ?? "tiendita",
      webauthnUserId,
      userName: name,
      displayName: name,
      exclude: exclude.map((c) => ({ id: c.id, transports: c.transports })),
    });
    const challengeId = await saveChallenge(deps, challenge, "registro", {
      sessionIdHash: e.session.idHash,
      webauthnUserId,
    });
    return ok({ options, challengeId });
  };

export type CompletedRegistration = {
  credential: Credential;
  /** Formatted; only on claim and recovery. Shown only once. */
  recoveryCode: string | null;
  /** If the session changed type, the new (full) one with its token. */
  rotatedSession: StartedSession | null;
};

export const finishPasskeyRegistration =
  (deps: AccessDeps) =>
  async (e: {
    session: Session;
    origin: string;
    challengeId: string | null | undefined;
    response: unknown;
    deviceName: string;
  }): Promise<Result<CompletedRegistration, DomainError>> => {
    const challenge = await consumeChallenge(deps, e.challengeId, "registro", e.session.idHash);
    if (!challenge.ok) return challenge;
    const status = await deps.access.get();
    const canRegister = checkSessionCanRegister(status, e.session);
    if (!canRegister.ok) return canRegister;
    const origin = await originFor(deps, e.origin, status);
    if (!origin.ok) return origin;
    const verified = await deps.ceremony.verifyRegistration({
      response: e.response,
      challenge: challenge.value.challenge,
      origin: origin.value.origin,
      rpId: origin.value.rpId,
    });
    if (!verified.ok) return verified;
    const now = deps.clock.now();
    const credential: Credential = {
      ...verified.value,
      rpId: origin.value.rpId,
      origin: origin.value.origin,
      name: e.deviceName,
      createdAt: now,
      lastUsedAt: null,
    };

    if (status === null) {
      const code = await newCode(deps);
      const won = await deps.access.claim({
        webauthnUserId: challenge.value.webauthnUserId ?? random(deps),
        now,
        origin: origin.value,
        credential,
        recoveryCodeHash: code.hash,
        keyHash: null,
      });
      if (!won) return fail("STORE_ALREADY_CLAIMED", "Someone else claimed the store first");
      const rotatedSession = await rotateToFull(deps, e.session);
      return ok({ credential, recoveryCode: code.code, rotatedSession });
    }

    if (e.session.type === "recuperacion") {
      // Before the batch, so the code is not spent on a duplicate credential (in a race, the whole batch fails).
      if ((await deps.credentials.findById(credential.id)) !== null) return alreadyRegistered();
      // Only here is the code spent: credential, new code and end of recovery sessions, together.
      const code = await newCode(deps);
      const used = await deps.access.finishRecovery({
        sessionIdHash: e.session.idHash,
        credential,
        recoveryCodeHash: code.hash,
        now,
      });
      if (!used) return fail("INVALID_CODE", "That recovery code was already used.");
      const rotatedSession = await rotateToFull(deps, e.session);
      return ok({ credential, recoveryCode: code.code, rotatedSession });
    }
    if (!(await deps.credentials.save(credential))) return alreadyRegistered();
    return ok({ credential, recoveryCode: null, rotatedSession: null });
  };

export const startSignIn =
  (deps: AccessDeps) =>
  async (e: { origin: string; ip: string }): Promise<Result<BrowserOptions, DomainError>> => {
    const status = await deps.access.get();
    if (status === null) return fail("ORIGIN_NOT_ALLOWED", "The store has no owner yet");
    const origin = await originFor(deps, e.origin, status);
    if (!origin.ok) return origin;
    // Every request counts (not just failed ones): that is what bounds sessionless writes to D1.
    const key = `ingreso:${e.ip}`;
    const limit = await blocked(deps, key, MAX_SIGN_IN_REQUESTS);
    if (limit) return limit;
    await deps.limiter.recordFailure(key, deps.clock.now());
    const { options, challenge } = await deps.ceremony.signInOptions({ rpId: origin.value.rpId });
    const challengeId = await saveChallenge(deps, challenge, "ingreso", {
      sessionIdHash: null,
      webauthnUserId: null,
    });
    return ok({ options, challengeId });
  };

export const finishSignIn =
  (deps: AccessDeps) =>
  async (e: {
    origin: string;
    challengeId: string | null | undefined;
    credentialId: string;
    response: unknown;
  }): Promise<Result<StartedSession, DomainError>> => {
    const challenge = await consumeChallenge(deps, e.challengeId, "ingreso", null);
    if (!challenge.ok) return challenge;
    const status = await deps.access.get();
    if (status === null) return fail("ORIGIN_NOT_ALLOWED", "The store has no owner yet");
    const origin = await originFor(deps, e.origin, status);
    if (!origin.ok) return origin;
    const credential = await deps.credentials.findById(e.credentialId);
    if (credential === null || credential.rpId !== origin.value.rpId) {
      return fail("UNKNOWN_PASSKEY", "That passkey is not recognized in this store");
    }
    const verified = await deps.ceremony.verifySignIn({
      response: e.response,
      challenge: challenge.value.challenge,
      origin: origin.value.origin,
      rpId: origin.value.rpId,
      credential,
    });
    if (!verified.ok) return verified;
    await deps.credentials.updateUsage(credential.id, verified.value.newCounter, deps.clock.now());
    return ok(await createSession(deps, "completa"));
  };

export const signInWithRecoveryCode =
  (deps: AccessDeps) =>
  async (e: { code: string; ip: string }): Promise<Result<StartedSession, DomainError>> => {
    const key = `recuperacion:${e.ip}`;
    const limit = await blocked(deps, key);
    if (limit) return limit;
    // Validating, deleting the other sessions and creating the recovery one is atomic in the repository (the
    // database compares the hash). The code is not spent until the new passkey is registered.
    const hash = await deps.cryptography.sha256Hex(normalizeCode(e.code));
    const token = random(deps);
    const session = newSession(await deps.cryptography.sha256Hex(token), "recuperacion", deps.clock.now());
    if (!(await deps.access.startRecovery(hash, session))) {
      await deps.limiter.recordFailure(key, deps.clock.now());
      return invalidCode();
    }
    return ok({ token, session });
  };

export const regenerateRecoveryCode = (deps: AccessDeps) => async (): Promise<string> => {
  const code = await newCode(deps);
  await deps.access.replaceRecoveryCode(code.hash, deps.clock.now());
  return code.code;
};

/**
 * Claim without a passkey, for devices that cannot make one: the owner picks a password (checked here, and
 * stored as a slow hash). Forgetting it means no way back in (as with the recovery code: redeploy the store).
 */
export const claimWithKey =
  (deps: AccessDeps) =>
  async (e: {
    session: Session;
    origin: string;
    password: string;
  }): Promise<Result<StartedSession, DomainError>> => {
    const problem = passwordProblem(e.password);
    if (problem) return weakPassword(problem);
    const status = await deps.access.get();
    const canRegister = checkSessionCanRegister(status, e.session);
    if (!canRegister.ok) return canRegister;
    const origin = await originFor(deps, e.origin, status);
    if (!origin.ok) return origin;
    const won = await deps.access.claim({
      webauthnUserId: random(deps),
      now: deps.clock.now(),
      origin: origin.value,
      credential: null,
      recoveryCodeHash: null,
      keyHash: await deps.cryptography.hashPassword(e.password),
    });
    if (!won) return fail("STORE_ALREADY_CLAIMED", "Someone else claimed the store first");
    return ok(await rotateToFull(deps, e.session));
  };

/** Sets the sign-in password of a full session (the previous one stops working). */
export const setKeyPassword =
  (deps: AccessDeps) =>
  async (e: { password: string }): Promise<Result<true, DomainError>> => {
    const problem = passwordProblem(e.password);
    if (problem) return weakPassword(problem);
    await deps.access.replaceKeyHash(await deps.cryptography.hashPassword(e.password));
    return ok(true);
  };

export const signInWithKey =
  (deps: AccessDeps) =>
  async (e: { password: string; ip: string }): Promise<Result<StartedSession, DomainError>> => {
    const key = `key-sign-in:${e.ip}`;
    const limit = await blocked(deps, key);
    if (limit) return limit;
    const stored = await deps.access.keyHash();
    if (stored === null || !(await deps.cryptography.verifyPassword(e.password, stored))) {
      await deps.limiter.recordFailure(key, deps.clock.now());
      return invalidCode();
    }
    return ok(await createSession(deps, "completa"));
  };

export type ValidSession = { session: Session; renewed: boolean };

export const validateSession =
  (deps: AccessDeps) =>
  async (token: string | null | undefined): Promise<Result<ValidSession, DomainError>> => {
    const notAuthenticated = fail<ValidSession>("NOT_AUTHENTICATED", "You must sign in to the store");
    if (!token) return notAuthenticated;
    const session = await deps.sessions.findByHash(await deps.cryptography.sha256Hex(token));
    if (session === null) return notAuthenticated;
    const now = deps.clock.now();
    // Without an access row (emergency plan) only the session of an ongoing claim survives.
    if (!isSessionValid(session, now) || (session.type !== "reclamo" && (await deps.access.get()) === null)) {
      await deps.sessions.remove(session.idHash);
      return notAuthenticated;
    }
    if (!shouldRenew(session, now)) return ok({ session, renewed: false });
    const expiresAt = new Date(now.getTime() + SESSION_DURATION[session.type]);
    await deps.sessions.renew(session.idHash, expiresAt, now);
    return ok({ session: { ...session, expiresAt, lastUsedAt: now }, renewed: true });
  };

export const signOut =
  (deps: AccessDeps) =>
  (idHash: string): Promise<void> =>
    deps.sessions.remove(idHash);

export const listPasskeys = (deps: AccessDeps) => (): Promise<Credential[]> => deps.credentials.list();

export const deletePasskey =
  (deps: AccessDeps) =>
  async (id: string): Promise<Result<true, DomainError>> => {
    if ((await deps.credentials.findById(id)) === null) return ok(true);
    if (!(await deps.credentials.deleteUnlessLast(id))) {
      return fail("LAST_PASSKEY", "You cannot delete your only passkey: add another one first");
    }
    return ok(true);
  };
