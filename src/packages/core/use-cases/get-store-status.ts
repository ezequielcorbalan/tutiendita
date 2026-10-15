import type { OnboardingStep } from "../domain/access";
import type { AccessRepository } from "../ports/access-repository";

/**
 * `unclaimed`: just deployed with the button, no owner (the home page shows "Tu tiendita está lista"
 * with the button to claim it). `setting-up`: there is an owner and onboarding is half done (the home
 * page says "Estamos preparando la tienda"). `ready`: onboarding completed, the home page shows the catalog.
 */
export type StoreStatus =
  | { readonly status: "unclaimed" }
  | { readonly status: "setting-up"; readonly step: OnboardingStep }
  | { readonly status: "ready" };

export const getStoreStatus = (deps: { access: AccessRepository }) => async (): Promise<StoreStatus> => {
  const access = await deps.access.get();
  if (access === null) return { status: "unclaimed" };
  if (access.onboardingCompletedAt === null) return { status: "setting-up", step: access.onboardingStep };
  return { status: "ready" };
};
