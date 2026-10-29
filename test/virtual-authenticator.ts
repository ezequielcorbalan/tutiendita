import { isoBase64URL, isoCBOR } from "@simplewebauthn/server/helpers";

/**
 * Fake WebAuthn authenticator for the tests (runs inside workerd): a WebCrypto ECDSA P-256 key,
 * "none" attestation in CBOR and ES256 signatures in DER. Returns exactly the JSON the browser passes
 * to the server with @simplewebauthn/browser, so the real library is tested.
 */
type RegistrationOptionsJson = { challenge: string; rp: { id?: string } };
type SignInOptionsJson = { challenge: string; rpId?: string };

export type CeremonySettings = {
  /** Origin the "browser" puts in clientDataJSON. */
  origin: string;
  /** rpId whose hash goes in authenticatorData (by default, the options' one). */
  rpId?: string;
  /** A challenge different from the options' one (to test it's rejected). */
  challenge?: string;
  /** Without the UV flag (user not verified). */
  unverified?: boolean;
};

const UP = 0x01;
const UV = 0x04;
const AT = 0x40;

const b64 = (bytes: Uint8Array): string => isoBase64URL.fromBuffer(Uint8Array.from(bytes));
const text = (s: string): Uint8Array => new TextEncoder().encode(s);

async function sha256(bytes: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", Uint8Array.from(bytes)));
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const total = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let i = 0;
  for (const p of parts) {
    total.set(p, i);
    i += p.length;
  }
  return total;
}

const uint32 = (n: number): Uint8Array =>
  Uint8Array.from([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]);

/** Raw ECDSA signature (r || s) → DER (SEQUENCE of two INTEGERs), which is what an authenticator sends. */
function toDer(raw: Uint8Array): Uint8Array {
  const integer = (b: Uint8Array): Uint8Array => {
    let i = 0;
    while (i < b.length - 1 && b[i] === 0) i += 1;
    const withoutZeros = b.slice(i);
    return (withoutZeros[0] ?? 0) & 0x80 ? concat(Uint8Array.from([0]), withoutZeros) : withoutZeros;
  };
  const r = integer(raw.slice(0, 32));
  const s = integer(raw.slice(32));
  const body = concat(Uint8Array.from([0x02, r.length]), r, Uint8Array.from([0x02, s.length]), s);
  return concat(Uint8Array.from([0x30, body.length]), body);
}

export async function createVirtualAuthenticator() {
  const pair = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
    "sign",
    "verify",
  ])) as CryptoKeyPair;
  const rawId = crypto.getRandomValues(new Uint8Array(16));
  const id = b64(rawId);
  let counter = 0;

  async function cosePublicKey(): Promise<Uint8Array> {
    const raw = new Uint8Array((await crypto.subtle.exportKey("raw", pair.publicKey)) as ArrayBuffer);
    const cose = new Map<number, number | Uint8Array>([
      [1, 2], // kty: EC2
      [3, -7], // alg: ES256
      [-1, 1], // crv: P-256
      [-2, raw.slice(1, 33)],
      [-3, raw.slice(33, 65)],
    ]);
    return isoCBOR.encode(cose);
  }

  async function clientData(type: string, challenge: string, origin: string) {
    const json = text(
      JSON.stringify({ type: type, challenge: challenge, origin: origin, crossOrigin: false }),
    );
    return { json, hash: await sha256(json) };
  }

  return {
    id,
    /** Counter it will send on the next sign-in (can be forced to test regressions). */
    setCounter(n: number) {
      counter = n;
    },

    async register(options: unknown, settings: CeremonySettings) {
      const o = options as RegistrationOptionsJson;
      const rpId = settings.rpId ?? o.rp.id ?? "";
      const client = await clientData("webauthn.create", settings.challenge ?? o.challenge, settings.origin);
      const flags = UP | AT | (settings.unverified ? 0 : UV);
      const authData = concat(
        await sha256(text(rpId)),
        Uint8Array.from([flags]),
        uint32(counter),
        new Uint8Array(16), // zero AAGUID, like authenticators without attestation
        Uint8Array.from([0, rawId.length]),
        rawId,
        await cosePublicKey(),
      );
      const attestationObject = isoCBOR.encode(
        new Map<string, string | Uint8Array | Map<string, never>>([
          ["fmt", "none"],
          ["attStmt", new Map<string, never>()],
          ["authData", authData],
        ]),
      );
      return {
        id,
        rawId: id,
        type: "public-key",
        response: {
          clientDataJSON: b64(client.json),
          attestationObject: b64(attestationObject),
          transports: ["internal", "hybrid"],
        },
        clientExtensionResults: {},
        authenticatorAttachment: "platform",
      };
    },

    async signIn(options: unknown, settings: CeremonySettings & { otherKey?: boolean }) {
      const o = options as SignInOptionsJson;
      const rpId = settings.rpId ?? o.rpId ?? "";
      counter += 1;
      const client = await clientData("webauthn.get", settings.challenge ?? o.challenge, settings.origin);
      const flags = UP | (settings.unverified ? 0 : UV);
      const authData = concat(await sha256(text(rpId)), Uint8Array.from([flags]), uint32(counter));
      let privateKeyPem = pair.privateKey;
      if (settings.otherKey) {
        const other = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
          "sign",
          "verify",
        ])) as CryptoKeyPair;
        privateKeyPem = other.privateKey;
      }
      const rawSignature = new Uint8Array(
        await crypto.subtle.sign(
          { name: "ECDSA", hash: "SHA-256" },
          privateKeyPem,
          Uint8Array.from(concat(authData, client.hash)),
        ),
      );
      return {
        id,
        rawId: id,
        type: "public-key",
        response: {
          clientDataJSON: b64(client.json),
          authenticatorData: b64(authData),
          signature: b64(toDer(rawSignature)),
        },
        clientExtensionResults: {},
        authenticatorAttachment: "platform",
      };
    },
  };
}

export type VirtualAuthenticator = Awaited<ReturnType<typeof createVirtualAuthenticator>>;
