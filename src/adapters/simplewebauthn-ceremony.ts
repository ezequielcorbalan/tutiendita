import {
  type AuthenticationResponseJSON,
  type AuthenticatorTransport,
  generateAuthenticationOptions,
  generateRegistrationOptions,
  type RegistrationResponseJSON,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import { isoBase64URL } from "@simplewebauthn/server/helpers";
import { domainError, err, ok, type WebAuthnCeremony } from "../packages/core/index";

/**
 * Adapter of the `WebAuthnCeremony` port with @simplewebauthn/server. Lives in the app (not in
 * infra-cloudflare) so infra's dependency rule stays "only drizzle and Workers".
 * Pinned algorithms: Ed25519, ES256 and RS256, regardless of what the runtime brings (v14 prefers
 * ML-DSA where it exists).
 */
export const ALGORITHMS = [-8, -7, -257];

const unverified = (cause: unknown) =>
  err(
    domainError("PASSKEY_NOT_VERIFIED", "Could not verify the passkey", {
      reason: cause instanceof Error ? cause.message : String(cause),
    }),
  );

const transports = (list: readonly string[]) => list as AuthenticatorTransport[];

export function createSimpleWebAuthnCeremony(): WebAuthnCeremony {
  return {
    async registrationOptions(e) {
      const options = await generateRegistrationOptions({
        rpName: e.rpName,
        rpID: e.rpId,
        userName: e.userName,
        userDisplayName: e.displayName,
        userID: isoBase64URL.toBuffer(e.webauthnUserId),
        attestationType: "none",
        excludeCredentials: e.exclude.map((c) => ({ id: c.id, transports: transports(c.transports) })),
        authenticatorSelection: { residentKey: "required", userVerification: "required" },
        supportedAlgorithmIDs: ALGORITHMS,
      });
      return { options, challenge: options.challenge };
    },

    async verifyRegistration(e) {
      try {
        const r = await verifyRegistrationResponse({
          response: e.response as RegistrationResponseJSON,
          expectedChallenge: e.challenge,
          expectedOrigin: e.origin,
          expectedRPID: e.rpId,
          requireUserVerification: true,
          supportedAlgorithmIDs: ALGORITHMS,
        });
        if (!r.verified) return unverified("the library did not verify the registration");
        const info = r.registrationInfo;
        return ok({
          id: info.credential.id,
          publicKeyBytes: new Uint8Array(info.credential.publicKey),
          counter: info.credential.counter,
          transports: info.credential.transports ?? [],
          deviceType: info.credentialDeviceType,
          backedUp: info.credentialBackedUp,
        });
      } catch (cause) {
        return unverified(cause);
      }
    },

    async signInOptions(e) {
      const options = await generateAuthenticationOptions({
        rpID: e.rpId,
        allowCredentials: [],
        userVerification: "required",
      });
      return { options, challenge: options.challenge };
    },

    async verifySignIn(e) {
      try {
        const r = await verifyAuthenticationResponse({
          response: e.response as AuthenticationResponseJSON,
          expectedChallenge: e.challenge,
          expectedOrigin: e.origin,
          expectedRPID: e.rpId,
          requireUserVerification: true,
          credential: {
            id: e.credential.id,
            publicKey: Uint8Array.from(e.credential.publicKeyBytes),
            counter: e.credential.counter,
            transports: transports(e.credential.transports),
          },
        });
        if (!r.verified) return unverified("the library did not verify the sign-in");
        return ok({ newCounter: r.authenticationInfo.newCounter });
      } catch (cause) {
        return unverified(cause);
      }
    },
  };
}
