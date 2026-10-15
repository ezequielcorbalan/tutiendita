import type { Credential, VerifiedCredential } from "../domain/access";
import type { DomainError } from "../domain/errors";
import type { Result } from "../domain/result";

/**
 * WebAuthn ceremonies, without tying core to a library. Options and browser responses travel as
 * opaque JSON: core only stores the challenge and decides which `rpId` and origin to verify against.
 */
export type RegistrationOptionsInput = {
  readonly rpId: string;
  readonly rpName: string;
  /** base64url of the owner's random id (`acceso.webauthn_user_id`). */
  readonly webauthnUserId: string;
  readonly userName: string;
  /** Never empty: Chrome fails after scanning a QR code if `user.displayName` is empty. */
  readonly displayName: string;
  readonly exclude: readonly { readonly id: string; readonly transports: readonly string[] }[];
};

export type VerifyRegistrationInput = {
  readonly response: unknown;
  readonly challenge: string;
  readonly origin: string;
  readonly rpId: string;
};

export type VerifySignInInput = VerifyRegistrationInput & { readonly credential: Credential };

export type CeremonyOptions = { readonly options: unknown; readonly challenge: string };

export interface WebAuthnCeremony {
  registrationOptions(e: RegistrationOptionsInput): Promise<CeremonyOptions>;
  verifyRegistration(e: VerifyRegistrationInput): Promise<Result<VerifiedCredential, DomainError>>;
  signInOptions(e: { readonly rpId: string }): Promise<CeremonyOptions>;
  verifySignIn(e: VerifySignInInput): Promise<Result<{ newCounter: number }, DomainError>>;
}
