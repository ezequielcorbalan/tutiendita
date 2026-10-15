import type { OnboardingStep } from "./access";

/** The five onboarding screens, in order. */
export const ONBOARDING_STEPS: readonly OnboardingStep[] = [
  "acceso",
  "nombre",
  "whatsapp",
  "transferencia",
  "producto",
];

/** WhatsApp is required (decision 3): only transfer and first product can be skipped. */
export const SKIPPABLE_STEPS: readonly OnboardingStep[] = ["transferencia", "producto"];

export const isOnboardingStep = (step: string): step is OnboardingStep =>
  (ONBOARDING_STEPS as readonly string[]).includes(step);

/** 1 to 5, to show "Step n of 5". */
export const stepNumber = (step: OnboardingStep): number => ONBOARDING_STEPS.indexOf(step) + 1;

export const nextStep = (step: OnboardingStep): OnboardingStep | "completed" =>
  ONBOARDING_STEPS[ONBOARDING_STEPS.indexOf(step) + 1] ?? "completed";
