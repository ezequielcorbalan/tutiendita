import type { OnboardingStep } from "../domain/access";
import { type DomainError, domainError } from "../domain/errors";
import { isOnboardingStep, nextStep, ONBOARDING_STEPS, SKIPPABLE_STEPS } from "../domain/onboarding";
import {
  type TransferConfig,
  validateTransfer,
  validateWhatsapp,
  WHATSAPP_TEMPLATE,
  type WhatsappConfig,
} from "../domain/payment-method";
import { err, ok, type Result } from "../domain/result";
import { createStore, rename, type Store, withLanguage, withWhatsapp } from "../domain/store";
import type { AccessRepository } from "../ports/access-repository";
import type { Clock } from "../ports/clock";
import type { IdGenerator } from "../ports/id-generator";
import type { PaymentMethodRepository } from "../ports/payment-method-repository";
import type { StoreRepository } from "../ports/store-repository";

export type OnboardingDeps = {
  access: AccessRepository;
  store: StoreRepository;
  methods: PaymentMethodRepository;
  clock: Clock;
  ids: IdGenerator;
};

const invalidStep = (message: string, details?: Record<string, unknown>) =>
  err(domainError("INVALID_STEP", message, details));

/** Screen 2: creates the store (ARS currency, empty description) or renames it; with `language`, also sets it. */
export const saveStoreName =
  (deps: OnboardingDeps) =>
  async (e: { name: string; language?: string }): Promise<Result<Store, DomainError>> => {
    const current = await deps.store.get();
    let store = current === null ? createStore(e, { id: deps.ids.newId() }) : rename(current, e.name);
    if (store.ok && current !== null && e.language !== undefined)
      store = withLanguage(store.value, e.language);
    if (!store.ok) return store;
    await deps.store.save(store.value, deps.clock.now());
    return store;
  };

/** From the panel: the language the store and the panel are shown in. */
export const changeStoreLanguage =
  (deps: OnboardingDeps) =>
  async (e: { language: string }): Promise<Result<Store, DomainError>> => {
    const current = await deps.store.get();
    if (current === null) return invalidStep("Choose the store name first");
    const store = withLanguage(current, e.language);
    if (!store.ok) return store;
    await deps.store.save(store.value, deps.clock.now());
    return store;
  };

/** Screen 3: the channel orders arrive through; it also becomes the store's contact. */
export const saveWhatsapp =
  (deps: OnboardingDeps) =>
  async (e: { number: string }): Promise<Result<WhatsappConfig, DomainError>> => {
    const store = await deps.store.get();
    if (store === null) return invalidStep("Choose the store name first");
    const number = validateWhatsapp(e.number);
    if (!number.ok) return number;
    const now = deps.clock.now();
    const config = { number: number.value, template: WHATSAPP_TEMPLATE };
    await deps.methods.save({ type: "whatsapp", active: true, config, updatedAt: now });
    await deps.store.save(withWhatsapp(store, number.value), now);
    return ok(config);
  };

/** Screen 4 (skippable): alias or CBU/CVU and holder. */
export const saveTransfer =
  (deps: OnboardingDeps) =>
  async (e: { account: string; holder: string }): Promise<Result<TransferConfig, DomainError>> => {
    const config = validateTransfer(e);
    if (!config.ok) return config;
    await deps.methods.save({
      type: "transferencia",
      active: true,
      config: config.value,
      updatedAt: deps.clock.now(),
    });
    return config;
  };

export type OnboardingProgress = { step: OnboardingStep; completed: boolean };

/** Completing a required step requires its data to be saved. */
async function dataSaved(deps: OnboardingDeps, step: OnboardingStep): Promise<boolean> {
  switch (step) {
    case "nombre":
      return (await deps.store.get()) !== null;
    case "whatsapp":
      return (await deps.methods.get("whatsapp")) !== null;
    case "transferencia":
      return (await deps.methods.get("transferencia")) !== null;
    default:
      return true;
  }
}

/**
 * Completes or skips `step`. It must be the current step or an earlier one (going back is allowed);
 * progress never moves backwards. Finishing the last one marks onboarding as completed.
 */
export const advanceOnboarding =
  (deps: OnboardingDeps) =>
  async (e: {
    step: OnboardingStep;
    skipped?: boolean;
  }): Promise<Result<OnboardingProgress, DomainError>> => {
    const status = await deps.access.get();
    if (status === null) return invalidStep("The store has no owner yet");
    if (status.onboardingCompletedAt !== null) return ok({ step: status.onboardingStep, completed: true });
    if (!isOnboardingStep(e.step)) return invalidStep("Unknown step", { step: e.step });
    const current = ONBOARDING_STEPS.indexOf(status.onboardingStep);
    const order = ONBOARDING_STEPS.indexOf(e.step);
    if (order > current)
      return invalidStep("That step has not been reached yet", { current: status.onboardingStep });
    if (e.skipped === true && !SKIPPABLE_STEPS.includes(e.step)) {
      return invalidStep("This step cannot be skipped", { step: e.step });
    }
    if (e.skipped !== true && !(await dataSaved(deps, e.step))) {
      return invalidStep("This step is not completed yet", { step: e.step });
    }
    if (order < current) return ok({ step: status.onboardingStep, completed: false });
    const next = nextStep(e.step);
    if (next === "completed") {
      await deps.access.saveOnboarding(e.step, deps.clock.now());
      return ok({ step: e.step, completed: true });
    }
    await deps.access.saveOnboarding(next, null);
    return ok({ step: next, completed: false });
  };
