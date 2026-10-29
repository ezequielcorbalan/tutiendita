import type {
  AccessState,
  AllowedOrigin,
  Credential,
  OnboardingStep,
  Session,
  VerifiedCredential,
} from "../../../../src/packages/core/domain/access";
import type { DomainError } from "../../../../src/packages/core/domain/errors";
import { ok, type Result } from "../../../../src/packages/core/domain/result";
import type { AccessRepository, ClaimData, RecoveryData } from "../../../../src/packages/core/ports/access-repository";
import { type AttemptLimiter, MAX_ATTEMPTS, windowStartOf } from "../../../../src/packages/core/ports/attempt-limiter";
import type { Challenge, ChallengeRepository } from "../../../../src/packages/core/ports/challenge-repository";
import type { Clock } from "../../../../src/packages/core/ports/clock";
import type { CredentialRepository } from "../../../../src/packages/core/ports/credential-repository";
import type { Cryptography } from "../../../../src/packages/core/ports/cryptography";
import type { SessionRepository } from "../../../../src/packages/core/ports/session-repository";
import type {
  RegistrationOptionsInput,
  VerifyRegistrationInput,
  VerifySignInInput,
  WebAuthnCeremony,
} from "../../../../src/packages/core/ports/webauthn-ceremony";

/** Sequential bytes (each call continues where the previous one stopped) and real WebCrypto SHA-256. */
export class DeterministicCryptography implements Cryptography {
  private next = 0;
  randomBytes(n: number): Uint8Array {
    return Uint8Array.from({ length: n }, () => {
      this.next = (this.next + 1) % 256;
      return this.next;
    });
  }
  async sha256Hex(text: string): Promise<string> {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  constantTimeEquals(a: string, b: string): boolean {
    return a === b;
  }
  /** Not slow on purpose: tests only need a stable, non-plain value. */
  async hashPassword(password: string): Promise<string> {
    return `fake${await this.sha256Hex(password)}`;
  }
  async verifyPassword(password: string, stored: string): Promise<boolean> {
    return stored === (await this.hashPassword(password));
  }
}

export const sha256 = (text: string) => new DeterministicCryptography().sha256Hex(text);

export class MovingClock implements Clock {
  constructor(private date: Date) {}
  now(): Date {
    return this.date;
  }
  advance(ms: number): void {
    this.date = new Date(this.date.getTime() + ms);
  }
}

export const verifiedCredential = (id = "cred-1"): VerifiedCredential => ({
  id,
  publicKeyBytes: Uint8Array.from([1, 2, 3]),
  counter: 0,
  transports: ["internal"],
  deviceType: "multiDevice",
  backedUp: true,
});

/** Returns what the test scripts and records what it received. */
export class FakeWebAuthnCeremony implements WebAuthnCeremony {
  readonly records: RegistrationOptionsInput[] = [];
  readonly registrationVerifications: VerifyRegistrationInput[] = [];
  readonly signIns: { rpId: string }[] = [];
  readonly signInVerifications: VerifySignInInput[] = [];
  registrationResult: Result<VerifiedCredential, DomainError> = ok(verifiedCredential());
  signInResult: Result<{ newCounter: number }, DomainError> = ok({ newCounter: 7 });
  private n = 0;

  async registrationOptions(e: RegistrationOptionsInput) {
    this.records.push(e);
    this.n += 1;
    return { options: { type: "registration", rpId: e.rpId }, challenge: `challenge-${this.n}` };
  }
  async verifyRegistration(e: VerifyRegistrationInput) {
    this.registrationVerifications.push(e);
    return this.registrationResult;
  }
  async signInOptions(e: { rpId: string }) {
    this.signIns.push(e);
    this.n += 1;
    return { options: { type: "sign-in", rpId: e.rpId }, challenge: `challenge-${this.n}` };
  }
  async verifySignIn(e: VerifySignInInput) {
    this.signInVerifications.push(e);
    return this.signInResult;
  }
}

export class InMemoryCredentialRepository implements CredentialRepository {
  readonly byId = new Map<string, Credential>();
  async list() {
    return [...this.byId.values()];
  }
  async findById(id: string) {
    return this.byId.get(id) ?? null;
  }
  async save(c: Credential) {
    if (this.byId.has(c.id)) return false;
    this.byId.set(c.id, c);
    return true;
  }
  async updateUsage(id: string, counter: number, now: Date) {
    const c = this.byId.get(id);
    if (c) this.byId.set(id, { ...c, counter, lastUsedAt: now });
  }
  async deleteUnlessLast(id: string) {
    return this.byId.size > 1 && this.byId.delete(id);
  }
  async count() {
    return this.byId.size;
  }
}

export class InMemorySessionRepository implements SessionRepository {
  readonly byHash = new Map<string, Session>();
  async create(s: Session) {
    this.byHash.set(s.idHash, s);
  }
  async findByHash(idHash: string) {
    return this.byHash.get(idHash) ?? null;
  }
  async renew(idHash: string, expiresAt: Date, lastUsedAt: Date) {
    const s = this.byHash.get(idHash);
    if (s) this.byHash.set(idHash, { ...s, expiresAt, lastUsedAt });
  }
  async remove(idHash: string) {
    this.byHash.delete(idHash);
  }
  async deleteAllExcept(idHash: string | null) {
    for (const h of [...this.byHash.keys()]) if (h !== idHash) this.byHash.delete(h);
  }
  async deleteExpired(now: Date) {
    for (const [h, s] of [...this.byHash]) if (s.expiresAt.getTime() <= now.getTime()) this.byHash.delete(h);
  }
}

export class InMemoryChallengeRepository implements ChallengeRepository {
  readonly byId = new Map<string, Challenge>();
  async save(d: Challenge) {
    this.byId.set(d.id, d);
  }
  async consume(id: string) {
    const d = this.byId.get(id) ?? null;
    this.byId.delete(id);
    return d;
  }
}

/** Emulates the D1 transaction: either the whole claim is applied or nothing. */
export class InMemoryAccessRepository implements AccessRepository {
  status: AccessState | null = null;
  recoveryHash: string | null = null;
  passwordHash: string | null = null;
  origins: AllowedOrigin[] = [];

  constructor(
    private readonly credentials: InMemoryCredentialRepository,
    private readonly sessions: InMemorySessionRepository,
  ) {}

  async get() {
    return this.status;
  }
  async claim(d: ClaimData) {
    if (this.status !== null) return false;
    this.status = {
      webauthnUserId: d.webauthnUserId,
      claimedAt: d.now,
      onboardingStep: "acceso",
      onboardingCompletedAt: null,
    };
    this.recoveryHash = d.recoveryCodeHash;
    this.passwordHash = d.keyHash;
    this.origins = [d.origin];
    this.credentials.byId.clear();
    this.sessions.byHash.clear();
    if (d.credential) await this.credentials.save(d.credential);
    return true;
  }
  async keyHash() {
    return this.status === null ? null : this.passwordHash;
  }
  async replaceKeyHash(hash: string) {
    this.passwordHash = hash;
  }
  async startRecovery(hash: string, session: Session) {
    if (this.recoveryHash === null || this.recoveryHash !== hash) return false;
    this.sessions.byHash.clear();
    await this.sessions.create(session);
    return true;
  }
  async finishRecovery(d: RecoveryData) {
    const s = this.sessions.byHash.get(d.sessionIdHash);
    if (s?.type !== "recuperacion" || s.expiresAt.getTime() <= d.now.getTime()) return false;
    await this.credentials.save(d.credential);
    this.recoveryHash = d.recoveryCodeHash;
    for (const [h, other] of [...this.sessions.byHash])
      if (other.type === "recuperacion") this.sessions.byHash.delete(h);
    return true;
  }
  async replaceRecoveryCode(hash: string) {
    this.recoveryHash = hash;
  }
  async saveOnboarding(step: OnboardingStep, completedAt: Date | null) {
    if (this.status)
      this.status = { ...this.status, onboardingStep: step, onboardingCompletedAt: completedAt };
  }
  async allowedOrigins() {
    return this.status === null ? [] : this.origins;
  }
  async replaceSecondaryOrigins(origins: readonly AllowedOrigin[]) {
    this.origins = [...this.origins.filter((o) => o.primary), ...origins];
  }
  /** For tests: a store already claimed by someone else, with its primary origin. */
  seedOwner(origin: AllowedOrigin, webauthnUserId = "previous-owner") {
    this.status = {
      webauthnUserId,
      claimedAt: new Date(0),
      onboardingStep: "acceso",
      onboardingCompletedAt: null,
    };
    this.origins = [origin];
  }
}

export class InMemoryLimiter implements AttemptLimiter {
  readonly failures = new Map<string, number>();
  private key = (key: string, now: Date) => `${key}@${windowStartOf(now).toISOString()}`;
  async recordFailure(key: string, now: Date) {
    const k = this.key(key, now);
    this.failures.set(k, (this.failures.get(k) ?? 0) + 1);
  }
  async isBlocked(key: string, now: Date, max = MAX_ATTEMPTS) {
    return (this.failures.get(this.key(key, now)) ?? 0) >= max;
  }
}
