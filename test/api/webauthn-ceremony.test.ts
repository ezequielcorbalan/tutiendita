import type { Credential } from "../../src/packages/core/index";
import { describe, expect, it } from "vitest";
import { createSimpleWebAuthnCeremony } from "../../src/adapters/simplewebauthn-ceremony";
import { createVirtualAuthenticator } from "../virtual-authenticator";

/**
 * The SimpleWebAuthn adapter runs here inside workerd (Workers pool): if the pinned version doesn't
 * load in the runtime, this file fails first.
 */
const ORIGIN = "https://tiendita.ana.workers.dev";
const RP_ID = "tiendita.ana.workers.dev";
const ceremony = createSimpleWebAuthnCeremony();

const registrationInput = {
  rpId: RP_ID,
  rpName: "Panadería La Espiga",
  webauthnUserId: "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8",
  userName: "Panadería La Espiga",
  displayName: "Panadería La Espiga",
  exclude: [],
};

async function registered() {
  const authenticator = await createVirtualAuthenticator();
  const { options, challenge } = await ceremony.registrationOptions(registrationInput);
  const response = await authenticator.register(options, { origin: ORIGIN });
  const r = await ceremony.verifyRegistration({ response, challenge, origin: ORIGIN, rpId: RP_ID });
  if (!r.ok) throw new Error(`registration rejected: ${r.error.message}`);
  const credential: Credential = {
    ...r.value,
    rpId: RP_ID,
    origin: ORIGIN,
    name: "Test",
    createdAt: new Date(),
    lastUsedAt: null,
  };
  return { authenticator, credential };
}

describe("registration options", () => {
  it("pins algorithms, a discoverable passkey with verification and the store user", async () => {
    const { options, challenge } = await ceremony.registrationOptions({
      ...registrationInput,
      exclude: [{ id: "Y3JlZC0x", transports: ["internal"] }],
    });
    const o = options as Record<string, unknown> & {
      pubKeyCredParams: { alg: number }[];
      user: { id: string; name: string; displayName: string };
    };
    expect(o.challenge).toBe(challenge);
    expect(o.rp).toEqual({ id: RP_ID, name: "Panadería La Espiga" });
    expect(o.pubKeyCredParams.map((p) => p.alg)).toEqual([-8, -7, -257]);
    expect(o.authenticatorSelection).toMatchObject({ residentKey: "required", userVerification: "required" });
    expect(o.attestation).toBe("none");
    expect(o.user).toEqual({
      id: registrationInput.webauthnUserId,
      name: "Panadería La Espiga",
      displayName: "Panadería La Espiga",
    });
    expect(o.excludeCredentials).toEqual([{ id: "Y3JlZC0x", type: "public-key", transports: ["internal"] }]);
  });
});

describe("verifyRegistration", () => {
  it("accepts a P-256 authenticator response and returns the credential", async () => {
    const authenticator = await createVirtualAuthenticator();
    const { options, challenge } = await ceremony.registrationOptions(registrationInput);
    const response = await authenticator.register(options, { origin: ORIGIN });
    const r = await ceremony.verifyRegistration({ response, challenge, origin: ORIGIN, rpId: RP_ID });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.id).toBe(authenticator.id);
    expect(r.value.publicKeyBytes).toBeInstanceOf(Uint8Array);
    expect(r.value.publicKeyBytes.length).toBeGreaterThan(60);
    expect(r.value.counter).toBe(0);
    expect(r.value.transports).toEqual(["internal", "hybrid"]);
    expect(r.value.deviceType).toBe("singleDevice");
    expect(r.value.backedUp).toBe(false);
  });

  it.each([
    ["another challenge", { challenge: "b3Rybw" }, {}],
    ["another origin", {}, { origin: "https://attacker.example" }],
    ["another rpId", { rpId: "attacker.example" }, {}],
    ["no user verification", { unverified: true }, {}],
  ])("rejects with %s → PASSKEY_NOT_VERIFIED", async (_case, settings, verification) => {
    const authenticator = await createVirtualAuthenticator();
    const { options, challenge } = await ceremony.registrationOptions(registrationInput);
    const response = await authenticator.register(options, { origin: ORIGIN, ...settings });
    const r = await ceremony.verifyRegistration({
      response,
      challenge,
      origin: ORIGIN,
      rpId: RP_ID,
      ...verification,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("PASSKEY_NOT_VERIFIED");
  });

  it("a garbage response doesn't throw: PASSKEY_NOT_VERIFIED", async () => {
    const r = await ceremony.verifyRegistration({
      response: { id: 1 },
      challenge: "x",
      origin: ORIGIN,
      rpId: RP_ID,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("PASSKEY_NOT_VERIFIED");
  });
});

describe("sign-in", () => {
  it("options without allowCredentials, with required verification and the origin's rpId", async () => {
    const { options, challenge } = await ceremony.signInOptions({ rpId: RP_ID });
    const o = options as Record<string, unknown>;
    expect(o.challenge).toBe(challenge);
    expect(o.rpId).toBe(RP_ID);
    expect(o.userVerification).toBe("required");
    expect(o.allowCredentials ?? []).toEqual([]);
  });

  it("verifies the signature and returns the new counter", async () => {
    const { authenticator, credential } = await registered();
    const { options, challenge } = await ceremony.signInOptions({ rpId: RP_ID });
    const response = await authenticator.signIn(options, { origin: ORIGIN });
    const r = await ceremony.verifySignIn({
      response,
      challenge,
      origin: ORIGIN,
      rpId: RP_ID,
      credential,
    });
    expect(r).toEqual({ ok: true, value: { newCounter: 1 } });
  });

  it.each([
    ["signature from another key", { otherKey: true }, {}],
    ["another challenge", { challenge: "b3Rybw" }, {}],
    ["another origin", {}, { origin: "https://attacker.example" }],
    // The passkey signs for RP_ID; the server expects another origin's rpId (e.g. a preview).
    ["credential of another rpId", {}, { rpId: "other.workers.dev" }],
    ["no user verification", { unverified: true }, {}],
  ])("rejects with %s", async (_case, settings, verification) => {
    const { authenticator, credential } = await registered();
    const { options, challenge } = await ceremony.signInOptions({ rpId: RP_ID });
    const response = await authenticator.signIn(options, { origin: ORIGIN, ...settings });
    const r = await ceremony.verifySignIn({
      response,
      challenge,
      origin: ORIGIN,
      rpId: RP_ID,
      credential,
      ...verification,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("PASSKEY_NOT_VERIFIED");
  });

  it("a counter that goes back is rejected (credential clone)", async () => {
    const { authenticator, credential } = await registered();
    authenticator.setCounter(4); // the next sign-in sends 5
    const { options, challenge } = await ceremony.signInOptions({ rpId: RP_ID });
    const response = await authenticator.signIn(options, { origin: ORIGIN });
    const r = await ceremony.verifySignIn({
      response,
      challenge,
      origin: ORIGIN,
      rpId: RP_ID,
      credential: { ...credential, counter: 9 },
    });
    expect(r.ok).toBe(false);
  });
});
