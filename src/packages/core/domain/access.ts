/** Access for the store's single owner: passkeys, sessions and allowed origins. */

/** What the verified registration ceremony returns (independent of the WebAuthn library). */
export type VerifiedCredential = {
  readonly id: string;
  readonly publicKeyBytes: Uint8Array;
  readonly counter: number;
  readonly transports: readonly string[];
  readonly deviceType: string;
  readonly backedUp: boolean;
};

export type Credential = VerifiedCredential & {
  /** `rpId` it was registered with: the origin's host. */
  readonly rpId: string;
  readonly origin: string;
  readonly name: string;
  readonly createdAt: Date;
  readonly lastUsedAt: Date | null;
};

// Stored in D1: values stay in Spanish (full, claim, recovery).
export type SessionType = "completa" | "reclamo" | "recuperacion";

/** The session id travels only in the cookie; its SHA-256 is stored here. */
export type Session = {
  readonly idHash: string;
  readonly type: SessionType;
  readonly createdAt: Date;
  readonly expiresAt: Date;
  readonly lastUsedAt: Date;
};

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

export const SESSION_DURATION: Readonly<Record<SessionType, number>> = {
  completa: 30 * DAY,
  reclamo: 15 * MINUTE,
  recuperacion: 15 * MINUTE,
};

/** A full session is renewed (and rewritten in D1) at most once per day of use. */
export const RENEWAL_INTERVAL = DAY;

export const CHALLENGE_DURATION = 5 * MINUTE;

export const newSession = (idHash: string, type: SessionType, now: Date): Session => ({
  idHash,
  type,
  createdAt: now,
  expiresAt: new Date(now.getTime() + SESSION_DURATION[type]),
  lastUsedAt: now,
});

export const isSessionValid = (s: Session, now: Date): boolean => now.getTime() < s.expiresAt.getTime();

export const shouldRenew = (s: Session, now: Date): boolean =>
  s.type === "completa" && now.getTime() - s.lastUsedAt.getTime() >= RENEWAL_INTERVAL;

/** Origin ceremonies are accepted from, with its matching `rpId`. */
export type AllowedOrigin = {
  readonly origin: string;
  readonly rpId: string;
  readonly primary: boolean;
};

// Stored in D1: values stay in Spanish (access, name, whatsapp, transfer, product).
export type OnboardingStep = "acceso" | "nombre" | "whatsapp" | "transferencia" | "producto";

/** The singleton `acceso` row: it exists if and only if the store has an owner. */
export type AccessState = {
  readonly webauthnUserId: string;
  readonly claimedAt: Date;
  readonly onboardingStep: OnboardingStep;
  readonly onboardingCompletedAt: Date | null;
};

const ORIGIN = /^https?:\/\/(\[[0-9a-f:.]+\]|[a-z0-9.-]+)(:\d+)?$/i;

/** `https://tiendita.ana.workers.dev` → `tiendita.ana.workers.dev`; null if it is not an http(s) origin. */
export function hostOfOrigin(origin: string): string | null {
  const m = ORIGIN.exec(origin);
  return m?.[1] ? m[1].toLowerCase() : null;
}
