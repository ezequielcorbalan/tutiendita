import { beforeEach, describe, expect, it } from "vitest";
import type { OnboardingStep } from "../../../src/packages/core/domain/access";
import { nextStep, ONBOARDING_STEPS, stepNumber } from "../../../src/packages/core/domain/onboarding";
import { WHATSAPP_TEMPLATE } from "../../../src/packages/core/domain/payment-method";
import {
  advanceOnboarding,
  changeStoreLanguage,
  type OnboardingDeps,
  saveStoreName,
  saveTransfer,
  saveWhatsapp,
} from "../../../src/packages/core/use-cases/onboarding";
import {
  InMemoryAccessRepository,
  InMemoryCredentialRepository,
  InMemorySessionRepository,
  MovingClock,
} from "./doubles/access";
import {
  InMemoryPaymentMethodRepository,
  InMemoryStoreRepository,
  SequentialIdGenerator,
} from "./doubles/in-memory";

const T0 = new Date("2026-10-15T10:00:00.000Z");
let access: InMemoryAccessRepository;
let store: InMemoryStoreRepository;
let methods: InMemoryPaymentMethodRepository;
let deps: OnboardingDeps;

beforeEach(() => {
  access = new InMemoryAccessRepository(new InMemoryCredentialRepository(), new InMemorySessionRepository());
  access.seedOwner({ origin: "https://x.workers.dev", rpId: "x.workers.dev", primary: true });
  store = new InMemoryStoreRepository();
  methods = new InMemoryPaymentMethodRepository();
  deps = { access, store, methods, clock: new MovingClock(T0), ids: new SequentialIdGenerator() };
});

const goTo = async (step: OnboardingStep) => access.saveOnboarding(step, null);
const codeOf = (r: { ok: boolean }) =>
  r.ok ? "OK" : (r as unknown as { error: { code: string } }).error.code;

describe("steps", () => {
  it("fixed order of five screens and numbering to show 'Step n of 5'", () => {
    expect(ONBOARDING_STEPS).toEqual(["acceso", "nombre", "whatsapp", "transferencia", "producto"]);
    expect(stepNumber("acceso")).toBe(1);
    expect(stepNumber("producto")).toBe(5);
    expect(nextStep("whatsapp")).toBe("transferencia");
    expect(nextStep("producto")).toBe("completed");
  });
});

describe("saveStoreName", () => {
  it("creates the store with ARS currency the first time and renames it afterwards", async () => {
    const r = await saveStoreName(deps)({ name: "Panadería La Espiga" });
    expect(r.ok && r.value).toMatchObject({ id: "id-1", name: "Panadería La Espiga", currency: "ARS" });
    await saveStoreName(deps)({ name: "La Espiga" });
    expect(await store.get()).toMatchObject({ id: "id-1", name: "La Espiga" });
    expect(store.savedAt).toEqual(T0);
  });

  it("saves the chosen language on creation and on rename; without a language keeps the previous one", async () => {
    await saveStoreName(deps)({ name: "Padaria", language: "pt" });
    expect((await store.get())?.language).toBe("pt");
    await saveStoreName(deps)({ name: "Padaria Nova" });
    expect((await store.get())?.language).toBe("pt");
    await saveStoreName(deps)({ name: "Bakery", language: "en" });
    expect(await store.get()).toMatchObject({ name: "Bakery", language: "en" });
  });

  it("invalid language → INVALID_LANGUAGE without saving", async () => {
    expect(codeOf(await saveStoreName(deps)({ name: "X", language: "fr" }))).toBe("INVALID_LANGUAGE");
    expect(await store.get()).toBeNull();
  });

  it("empty name → EMPTY_NAME without saving", async () => {
    expect(codeOf(await saveStoreName(deps)({ name: " " }))).toBe("EMPTY_NAME");
    expect(await store.get()).toBeNull();
  });

  it("renaming with an invalid name does not overwrite the previous one", async () => {
    await saveStoreName(deps)({ name: "Good" });
    expect(codeOf(await saveStoreName(deps)({ name: "" }))).toBe("EMPTY_NAME");
    expect((await store.get())?.name).toBe("Good");
  });
});

describe("changeStoreLanguage", () => {
  it("changes the language and keeps the rest", async () => {
    await saveStoreName(deps)({ name: "La Espiga" });
    const previous = await store.get();
    const r = await changeStoreLanguage(deps)({ language: "en" });
    expect(r.ok && r.value).toEqual({ ...previous, language: "en" });
    expect(await store.get()).toEqual({ ...previous, language: "en" });
  });

  it("invalid language → INVALID_LANGUAGE without touching the store", async () => {
    await saveStoreName(deps)({ name: "La Espiga" });
    expect(codeOf(await changeStoreLanguage(deps)({ language: "xx" }))).toBe("INVALID_LANGUAGE");
    expect((await store.get())?.language).toBe("es");
  });

  it("no store yet → INVALID_STEP", async () => {
    expect(codeOf(await changeStoreLanguage(deps)({ language: "en" }))).toBe("INVALID_STEP");
  });
});

describe("saveWhatsapp", () => {
  it("saves the active method with the default template and fills in the store contact", async () => {
    await saveStoreName(deps)({ name: "La Espiga" });
    const r = await saveWhatsapp(deps)({ number: "11 2233-4455" });
    expect(r.ok && r.value).toEqual({ number: "+5491122334455", template: WHATSAPP_TEMPLATE });
    expect(await methods.get("whatsapp")).toEqual({
      type: "whatsapp",
      active: true,
      config: { number: "+5491122334455", template: WHATSAPP_TEMPLATE },
      updatedAt: T0,
    });
    expect((await store.get())?.contact.whatsapp).toBe("+5491122334455");
  });

  it("invalid number → INVALID_WHATSAPP; no store → INVALID_STEP", async () => {
    expect(codeOf(await saveWhatsapp(deps)({ number: "11 2233-4455" }))).toBe("INVALID_STEP");
    await saveStoreName(deps)({ name: "La Espiga" });
    expect(codeOf(await saveWhatsapp(deps)({ number: "abc" }))).toBe("INVALID_WHATSAPP");
    expect(await methods.get("whatsapp")).toBeNull();
  });
});

describe("saveTransfer", () => {
  it("saves alias or CBU with holder", async () => {
    const r = await saveTransfer(deps)({ account: "mate.dulce", holder: "Ana" });
    expect(r.ok).toBe(true);
    expect(await methods.get("transferencia")).toEqual({
      type: "transferencia",
      active: true,
      config: { accountType: "alias", account: "mate.dulce", holder: "Ana" },
      updatedAt: T0,
    });
  });

  it("invalid → INVALID_TRANSFER without saving", async () => {
    expect(codeOf(await saveTransfer(deps)({ account: "x", holder: "Ana" }))).toBe("INVALID_TRANSFER");
    expect(await methods.get("transferencia")).toBeNull();
  });
});

describe("advanceOnboarding", () => {
  it("goes through the five screens: required ones with their data, transfer and product skippable", async () => {
    expect(await advanceOnboarding(deps)({ step: "acceso" })).toEqual({
      ok: true,
      value: { step: "nombre", completed: false },
    });
    await saveStoreName(deps)({ name: "La Espiga" });
    expect((await advanceOnboarding(deps)({ step: "nombre" })).ok).toBe(true);
    await saveWhatsapp(deps)({ number: "11 2233-4455" });
    expect((await advanceOnboarding(deps)({ step: "whatsapp" })).ok).toBe(true);
    expect(await advanceOnboarding(deps)({ step: "transferencia", skipped: true })).toEqual({
      ok: true,
      value: { step: "producto", completed: false },
    });
    expect(access.status?.onboardingCompletedAt).toBeNull();
    expect(await advanceOnboarding(deps)({ step: "producto", skipped: true })).toEqual({
      ok: true,
      value: { step: "producto", completed: true },
    });
    expect(access.status?.onboardingCompletedAt).toEqual(T0);
  });

  it.each(["acceso", "nombre", "whatsapp"] as const)("cannot skip %s → INVALID_STEP", async (step) => {
    await goTo(step);
    expect(codeOf(await advanceOnboarding(deps)({ step, skipped: true }))).toBe("INVALID_STEP");
  });

  it("cannot jump ahead to a step not reached yet", async () => {
    expect(codeOf(await advanceOnboarding(deps)({ step: "transferencia", skipped: true }))).toBe(
      "INVALID_STEP",
    );
    expect(access.status?.onboardingStep).toBe("acceso");
  });

  it.each([
    ["nombre", "without a store"],
    ["whatsapp", "without a saved WhatsApp"],
    ["transferencia", "without a saved transfer"],
  ] as const)("completing %s %s → INVALID_STEP", async (step, _reason) => {
    await goTo(step);
    expect(codeOf(await advanceOnboarding(deps)({ step }))).toBe("INVALID_STEP");
  });

  it("completing transfer with saved data advances", async () => {
    await goTo("transferencia");
    await saveTransfer(deps)({ account: "mate.dulce", holder: "Ana" });
    expect((await advanceOnboarding(deps)({ step: "transferencia" })).ok).toBe(true);
    expect(access.status?.onboardingStep).toBe("producto");
  });

  it("going back and redoing an earlier step does not move progress backwards", async () => {
    await goTo("transferencia");
    await saveStoreName(deps)({ name: "Other name" });
    expect(await advanceOnboarding(deps)({ step: "nombre" })).toEqual({
      ok: true,
      value: { step: "transferencia", completed: false },
    });
  });

  it("unknown step → INVALID_STEP", async () => {
    expect(codeOf(await advanceOnboarding(deps)({ step: "other" as OnboardingStep }))).toBe("INVALID_STEP");
  });

  it("no owner → INVALID_STEP; already completed → responds completed without touching anything", async () => {
    await access.saveOnboarding("producto", T0);
    expect(await advanceOnboarding(deps)({ step: "nombre" })).toEqual({
      ok: true,
      value: { step: "producto", completed: true },
    });
    access.status = null;
    expect(codeOf(await advanceOnboarding(deps)({ step: "acceso" }))).toBe("INVALID_STEP");
  });
});
