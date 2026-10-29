import { describe, expect, it } from "vitest";
import {
  createStore,
  rename,
  validateLanguage,
  withHeartbeat,
  withLanguage,
  withWhatsapp,
} from "../../../src/packages/core/domain/store";

describe("createStore", () => {
  it("with ARS currency and Spanish language by default, no description or contact", () => {
    expect(createStore({ name: "  Panadería La Espiga " }, { id: "t1" })).toEqual({
      ok: true,
      value: {
        id: "t1",
        name: "Panadería La Espiga",
        description: "",
        logoKey: null,
        currency: "ARS",
        language: "es",
        contact: { whatsapp: null, email: null },
        domain: null,
        heartbeatEnabled: true,
        heartbeatSentAt: null,
      },
    });
  });

  it.each([
    ["empty", "   "],
    ["longer than 80 characters", "x".repeat(81)],
  ])("name %s → EMPTY_NAME", (_case, name) => {
    const r = createStore({ name }, { id: "t1" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("EMPTY_NAME");
  });

  it("with the chosen language", () => {
    const r = createStore({ name: "Padaria", language: "pt" }, { id: "t1" });
    expect(r.ok && r.value.language).toBe("pt");
  });

  it("unknown language → INVALID_LANGUAGE", () => {
    const r = createStore({ name: "Shop", language: "fr" }, { id: "t1" });
    expect(!r.ok && r.error.code).toBe("INVALID_LANGUAGE");
  });

  it("accepts exactly 80 characters", () => {
    expect(createStore({ name: "x".repeat(80) }, { id: "t1" }).ok).toBe(true);
  });
});

describe("rename and withWhatsapp", () => {
  const base = createStore({ name: "Old" }, { id: "t1" });
  if (!base.ok) throw new Error("invalid base store");

  it("rename validates and keeps the rest", () => {
    const r = rename(base.value, "New");
    expect(r.ok && r.value).toEqual({ ...base.value, name: "New" });
    expect(rename(base.value, "").ok).toBe(false);
  });

  it("withHeartbeat turns the daily announcement off and on", () => {
    expect(withHeartbeat(base.value, false).heartbeatEnabled).toBe(false);
    expect(withHeartbeat(withHeartbeat(base.value, false), true)).toEqual(base.value);
  });

  it("withWhatsapp fills in the contact", () => {
    expect(withWhatsapp(base.value, "+5491122334455").contact).toEqual({
      whatsapp: "+5491122334455",
      email: null,
    });
  });
});

describe("language", () => {
  it.each(["es", "en", "pt"])("validateLanguage accepts %s", (language) => {
    expect(validateLanguage(language)).toEqual({ ok: true, value: language });
  });

  it.each(["", "ES", "pt-BR", "fr", " en"])("validateLanguage rejects %j", (language) => {
    const r = validateLanguage(language);
    expect(!r.ok && r.error.code).toBe("INVALID_LANGUAGE");
  });

  it("withLanguage validates and keeps the rest", () => {
    const base = createStore({ name: "Store" }, { id: "t1" });
    if (!base.ok) throw new Error("invalid base store");
    const r = withLanguage(base.value, "en");
    expect(r.ok && r.value).toEqual({ ...base.value, language: "en" });
    expect(withLanguage(base.value, "de").ok).toBe(false);
  });
});
