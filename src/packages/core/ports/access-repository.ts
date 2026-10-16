import type { AccessState, AllowedOrigin, Credential, OnboardingStep, Session } from "../domain/access";

export type ClaimData = {
  readonly webauthnUserId: string;
  readonly now: Date;
  readonly origin: AllowedOrigin;
  readonly credential: Credential;
  readonly recoveryCodeHash: string;
};

export type RecoveryData = {
  readonly sessionIdHash: string;
  readonly credential: Credential;
  /** Hash of the new code, which replaces the used one. */
  readonly recoveryCodeHash: string;
  readonly now: Date;
};

/** The singleton `acceso` row and the allowed origins. */
export interface AccessRepository {
  get(): Promise<AccessState | null>;
  /**
   * Atomic: inserts the `acceso` row only if it does not exist and, in the same transaction, replaces
   * any leftover credentials, origins and sessions (emergency plan) with the claim's.
   * `false` if another claim won.
   */
  claim(d: ClaimData): Promise<boolean>;
  /**
   * Atomic: if `hash` is the current recovery code's, deletes all sessions and creates `session`.
   * Does not spend the code (it is spent in `finishRecovery`). `false` if it does not match.
   */
  startRecovery(hash: string, session: Session): Promise<boolean>;
  /**
   * Atomic: only if `sessionIdHash` is still a valid recovery session, saves the credential,
   * replaces the code with the new one and deletes all recovery sessions. `false` if another session already
   * used the code (effectively single use: one code, one passkey).
   */
  finishRecovery(d: RecoveryData): Promise<boolean>;
  replaceRecoveryCode(hash: string, now: Date): Promise<void>;
  saveOnboarding(step: OnboardingStep, completedAt: Date | null): Promise<void>;
  /** Empty if there is no `acceso` row (no owner, even if emergency-plan rows were left over). */
  allowedOrigins(): Promise<AllowedOrigin[]>;
  /** Replaces every non-primary origin (the custom domain's) with `origins`; the primary one is never touched. */
  replaceSecondaryOrigins(origins: readonly AllowedOrigin[], now: Date): Promise<void>;
}
