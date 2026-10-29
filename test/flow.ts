import { BASE, cookiesOf, send } from "./helpers";
import { TEST_CLAIM_CODE } from "./test-code.mjs";
import { createVirtualAuthenticator } from "./virtual-authenticator";

/**
 * The real start of onboarding, through the API and with the virtual authenticator: claim with the build's
 * code, options and registration of the first passkey. Returns the resulting full session.
 */
export async function claimWithPasskey(call: typeof send = send) {
  const authenticator = await createVirtualAuthenticator();
  const claim = await call("POST", "/api/access/claim", { code: TEST_CLAIM_CODE });
  if (claim.status !== 200) throw new Error(`claim: ${claim.status} ${await claim.text()}`);
  const claimSession = cookiesOf(claim);
  const optionsRes = await call("POST", "/api/access/passkeys/options", {}, { cookies: claimSession });
  const response = await authenticator.register(await optionsRes.json(), { origin: BASE });
  const registration = await call(
    "POST",
    "/api/access/passkeys",
    { response },
    { cookies: { ...claimSession, ...cookiesOf(optionsRes) } },
  );
  if (registration.status !== 201)
    throw new Error(`registration: ${registration.status} ${await registration.text()}`);
  const { recoveryCode } = (await registration.json()) as { recoveryCode: string };
  return { authenticator, cookies: cookiesOf(registration), recoveryCode };
}
