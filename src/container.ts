import {
  type AccessDeps,
  advanceOnboarding,
  applyUpdate,
  changeStoreLanguage,
  connectGithub,
  createProduct,
  deletePasskey,
  deleteSampleProducts,
  finishPasskeyRegistration,
  finishSignIn,
  getProduct,
  getStoreStatus,
  listAllProducts,
  listPasskeys,
  listPublishedProducts,
  loadSampleProducts,
  type OnboardingDeps,
  prepareUpdate,
  regenerateRecoveryCode,
  registerInstallation,
  saveStoreName,
  saveTransfer,
  saveWhatsapp,
  signInWithRecoveryCode,
  signOut,
  startPasskeyRegistration,
  startSignIn,
  type UpdatesDeps,
  updateStatus,
  validateClaimCode,
  validateSession,
} from "./packages/core/index";
import {
  createD1AccessRepository,
  createD1AttemptLimiter,
  createD1CategoryRepository,
  createD1ChallengeRepository,
  createD1CredentialRepository,
  createD1GithubConnectionRepository,
  createD1PaymentMethodRepository,
  createD1ProductRepository,
  createD1SessionRepository,
  createD1StoreRepository,
  createGithubClient,
  createR2ImageStorage,
  systemClock,
  ulidGenerator,
  webCryptography,
} from "./packages/infra-cloudflare/index";
import { createSimpleWebAuthnCeremony } from "./adapters/simplewebauthn-ceremony";
import { codeHash } from "./claim";

/** Composition root: builds the use cases per request with the adapters from `env`. */
export function build(env: Env) {
  const repo = createD1ProductRepository(env.DB);
  const categories = createD1CategoryRepository(env.DB);
  const images = createR2ImageStorage(env.IMAGENES, ulidGenerator);
  const store = createD1StoreRepository(env.DB);
  const accessRepo = createD1AccessRepository(env.DB);
  const deps: AccessDeps = {
    access: accessRepo,
    credentials: createD1CredentialRepository(env.DB),
    sessions: createD1SessionRepository(env.DB),
    challenges: createD1ChallengeRepository(env.DB),
    limiter: createD1AttemptLimiter(env.DB),
    ceremony: createSimpleWebAuthnCeremony(),
    cryptography: webCryptography,
    clock: systemClock,
    store,
    claimCodeHash: codeHash,
  };
  const onboardingDeps: OnboardingDeps = {
    access: accessRepo,
    store,
    methods: createD1PaymentMethodRepository(env.DB),
    clock: systemClock,
    ids: ulidGenerator,
  };
  const productDeps = { repo, categories, images, clock: systemClock, ids: ulidGenerator };
  // Sample photos are static Worker assets (public/samples). They are requested with the request's own origin:
  // in production the host doesn't matter, but `astro dev` (Vite) rejects unknown hosts with 403.
  const readPhotoFrom = (origin: string) => async (path: string) => {
    const res = await env.ASSETS.fetch(new URL(path, origin));
    if (!res.ok) throw new Error(`Missing sample photo ${path} (${res.status})`);
    return new Uint8Array(await res.arrayBuffer());
  };
  const updatesDeps: UpdatesDeps = {
    connection: createD1GithubConnectionRepository(env.DB),
    github: createGithubClient(),
    clock: systemClock,
  };
  return {
    storeStatus: getStoreStatus({ access: accessRepo }),
    allowedOrigins: async () => (await accessRepo.allowedOrigins()).map((o) => o.origin),
    getStore: () => store.get(),
    getPaymentMethod: onboardingDeps.methods.get.bind(onboardingDeps.methods),
    listProducts: listPublishedProducts({ repo }),
    listAllProducts: listAllProducts({ repo }),
    getProduct: getProduct({ repo }),
    createProduct: createProduct(productDeps),
    listCategories: () => categories.list(),
    samples: {
      load: (industry: Parameters<ReturnType<typeof loadSampleProducts>>[0], origin: string) =>
        loadSampleProducts({ ...productDeps, store, readPhoto: readPhotoFrom(origin) })(industry),
      remove: deleteSampleProducts(productDeps),
    },
    access: {
      validateClaimCode: validateClaimCode(deps),
      startPasskeyRegistration: startPasskeyRegistration(deps),
      finishPasskeyRegistration: finishPasskeyRegistration(deps),
      startSignIn: startSignIn(deps),
      finishSignIn: finishSignIn(deps),
      signInWithRecoveryCode: signInWithRecoveryCode(deps),
      regenerateRecoveryCode: regenerateRecoveryCode(deps),
      validateSession: validateSession(deps),
      signOut: signOut(deps),
      listPasskeys: listPasskeys(deps),
      deletePasskey: deletePasskey(deps),
    },
    onboarding: {
      saveStoreName: saveStoreName(onboardingDeps),
      changeLanguage: changeStoreLanguage(onboardingDeps),
      saveWhatsapp: saveWhatsapp(onboardingDeps),
      saveTransfer: saveTransfer(onboardingDeps),
      advance: advanceOnboarding(onboardingDeps),
    },
    updates: {
      getConnection: () => updatesDeps.connection.get(),
      status: updateStatus(updatesDeps),
      connect: connectGithub(updatesDeps),
      registerInstallation: registerInstallation(updatesDeps),
      prepare: prepareUpdate(updatesDeps),
      apply: applyUpdate(updatesDeps),
    },
    images,
    bucket: env.IMAGENES,
  };
}

export type Container = ReturnType<typeof build>;
