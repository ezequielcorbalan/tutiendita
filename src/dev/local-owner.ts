/**
 * `astro dev` only (the middleware imports this behind `import.meta.env.DEV`, so it never reaches the
 * build): the local store comes up claimed, with onboarding done and the sample catalog, and the panel
 * opens without a passkey.
 */
import { newSession, SAMPLE_INDUSTRIES, toBase64Url } from "../packages/core/index";
import {
  createD1AccessRepository,
  createD1SessionRepository,
  systemClock,
  webCryptography,
} from "../packages/infra-cloudflare/index";
import { build } from "../container";

const random = () => toBase64Url(webCryptography.randomBytes(32));

/** Claims and sets up an unclaimed local store. Does nothing if it already has an owner. */
export async function ensureLocalOwner(env: Env, url: URL): Promise<void> {
  const access = createD1AccessRepository(env.DB);
  if ((await access.get()) !== null) return;
  const now = systemClock.now();
  const won = await access.claim({
    webauthnUserId: random(),
    now,
    // shortcut: allows only this dev origin, if `astro dev` moves to another port, delete .wrangler/state.
    origin: { origin: url.origin, rpId: url.hostname, primary: true },
    // Placeholder: local sessions don't go through WebAuthn.
    credential: {
      id: "local-dev",
      publicKeyBytes: new Uint8Array(),
      counter: 0,
      transports: [],
      deviceType: "singleDevice",
      backedUp: false,
      rpId: url.hostname,
      origin: url.origin,
      // Shown in the panel's Access page: store text, in Spanish.
      name: "Desarrollo local (sin passkey)",
      createdAt: now,
      lastUsedAt: null,
    },
    // Nobody knows this code: local recovery isn't needed.
    recoveryCodeHash: await webCryptography.sha256Hex(random()),
    keyHash: null,
  });
  if (!won) return;
  const container = build(env);
  // Store text: Spanish on purpose.
  const steps = [
    await container.onboarding.saveStoreName({ name: "Tiendita local" }),
    await container.onboarding.saveWhatsapp({ number: "5491112345678" }),
    ...(await Promise.all(SAMPLE_INDUSTRIES.map((i) => container.samples.load(i, url.origin)))),
  ];
  const failed = steps.find((r) => !r.ok);
  if (failed) throw new Error(`Local setup failed: ${JSON.stringify(failed)}`);
  await access.saveOnboarding("producto", now);
}

/** A full session for the local owner; the plain token goes to the cookie. */
export async function startLocalSession(env: Env) {
  const token = random();
  const session = newSession(await webCryptography.sha256Hex(token), "completa", systemClock.now());
  await createD1SessionRepository(env.DB).create(session);
  return { token, session };
}
