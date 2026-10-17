import { type DomainError, domainError } from "./errors";
import { err, ok, type Result } from "./result";

/** The business that owns a deployment. There is exactly one per deployment. */
export type Store = {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly logoKey: string | null;
  readonly currency: string;
  /** Language the store and its panel are shown in. */
  readonly language: Language;
  readonly contact: {
    readonly whatsapp: string | null;
    readonly email: string | null;
  };
  readonly domain: string | null;
  /** Whether the store announces its origin to tutiendita.ar once a day (see heartbeat.ts). */
  readonly heartbeatEnabled: boolean;
  /** ISO date of the last announcement, `null` if it never happened. */
  readonly heartbeatSentAt: string | null;
};

export const LANGUAGES = ["es", "en", "pt"] as const;
export type Language = (typeof LANGUAGES)[number];
export const DEFAULT_LANGUAGE: Language = "es";

export const MAX_STORE_NAME_LENGTH = 80;
/** Onboarding does not ask for the currency: it is changed later from the panel. */
export const DEFAULT_CURRENCY = "ARS";

function validateName(name: string): Result<string, DomainError> {
  const clean = name.trim();
  if (clean === "" || clean.length > MAX_STORE_NAME_LENGTH) {
    return err(
      domainError("EMPTY_NAME", `The store name must be 1 to ${MAX_STORE_NAME_LENGTH} characters`, {
        max: MAX_STORE_NAME_LENGTH,
      }),
    );
  }
  return ok(clean);
}

export function validateLanguage(language: string): Result<Language, DomainError> {
  return (LANGUAGES as readonly string[]).includes(language)
    ? ok(language as Language)
    : err(domainError("INVALID_LANGUAGE", "Choose Spanish, English or Portuguese", { allowed: LANGUAGES }));
}

export function createStore(
  e: { name: string; language?: string },
  ctx: { id: string },
): Result<Store, DomainError> {
  const name = validateName(e.name);
  if (!name.ok) return name;
  const language = validateLanguage(e.language ?? DEFAULT_LANGUAGE);
  if (!language.ok) return language;
  return ok({
    id: ctx.id,
    name: name.value,
    description: "",
    logoKey: null,
    currency: DEFAULT_CURRENCY,
    language: language.value,
    contact: { whatsapp: null, email: null },
    domain: null,
    heartbeatEnabled: true,
    heartbeatSentAt: null,
  });
}

export function rename(t: Store, name: string): Result<Store, DomainError> {
  const clean = validateName(name);
  return clean.ok ? ok({ ...t, name: clean.value }) : clean;
}

export function withLanguage(t: Store, language: string): Result<Store, DomainError> {
  const valid = validateLanguage(language);
  return valid.ok ? ok({ ...t, language: valid.value }) : valid;
}

export const withWhatsapp = (t: Store, number: string): Store => ({
  ...t,
  contact: { ...t.contact, whatsapp: number },
});

export const withHeartbeat = (t: Store, enabled: boolean): Store => ({ ...t, heartbeatEnabled: enabled });
