// Stored in D1: values stay in Spanish (registration, sign-in).
export type ChallengePurpose = "registro" | "ingreso";

export type Challenge = {
  readonly id: string;
  readonly challenge: string;
  readonly purpose: ChallengePurpose;
  /** Session that requested the registration options (null on sign-in). */
  readonly sessionIdHash: string | null;
  /** `user.id` sent in the registration options (the browser does not return it on registration). */
  readonly webauthnUserId: string | null;
  readonly expiresAt: Date;
};

export interface ChallengeRepository {
  save(d: Challenge): Promise<void>;
  /** Reads and deletes: a challenge is used only once, even if expired. */
  consume(id: string): Promise<Challenge | null>;
}
