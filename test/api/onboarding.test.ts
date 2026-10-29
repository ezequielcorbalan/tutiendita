import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { claimWithPasskey } from "../flow";
import {
  BASE,
  call,
  clearD1,
  clearR2,
  cookieHeader,
  form,
  send,
  startTestSession,
  validCreation,
} from "../helpers";

type ErrorBody = { error: { code: string; details?: Record<string, unknown> } };
const errorCode = async (res: Response) => ((await res.json()) as ErrorBody).error.code;
const accessInD1 = () =>
  env.DB.prepare(
    "SELECT primer_ingreso_paso AS step, primer_ingreso_completado_en AS completed FROM acceso",
  ).first<{
    step: string;
    completed: string | null;
  }>();

beforeEach(async () => {
  await clearD1();
  await clearR2();
});

describe("onboarding through the API (screens 1 to 5)", () => {
  it("from claim to a ready store: name, WhatsApp, transfer and first product", async () => {
    const { cookies } = await claimWithPasskey();
    const options = { cookies };

    expect(await (await send("POST", "/api/onboarding/advance", { step: "acceso" }, options)).json()).toEqual(
      {
        step: "nombre",
        completed: false,
      },
    );

    const store = await send("PUT", "/api/store", { name: "Panadería La Espiga" }, options);
    expect(store.status).toBe(200);
    expect(await store.json()).toMatchObject({ name: "Panadería La Espiga", currency: "ARS" });
    await send("POST", "/api/onboarding/advance", { step: "nombre" }, options);

    const whatsapp = await send(
      "PUT",
      "/api/payment-methods/whatsapp",
      { number: "11 15 2233-4455" },
      options,
    );
    expect(whatsapp.status).toBe(200);
    expect(await whatsapp.json()).toMatchObject({ number: "+5491122334455" });
    await send("POST", "/api/onboarding/advance", { step: "whatsapp" }, options);

    const transfer = await send(
      "PUT",
      "/api/payment-methods/transfer",
      { account: "panaderia.espiga", holder: "Ana Pérez" },
      options,
    );
    expect(transfer.status).toBe(200);
    expect(await transfer.json()).toEqual({
      accountType: "alias",
      account: "panaderia.espiga",
      holder: "Ana Pérez",
    });
    await send("POST", "/api/onboarding/advance", { step: "transferencia" }, options);

    const product = await call("/api/products", {
      method: "POST",
      body: form(validCreation({ name: "Pan de campo" })),
      headers: { origin: BASE, cookie: cookieHeader(cookies) },
    });
    expect(product.status).toBe(201);
    const end = await send("POST", "/api/onboarding/advance", { step: "producto" }, options);
    expect(await end.json()).toEqual({ step: "producto", completed: true });

    expect((await accessInD1())?.completed).not.toBeNull();
    // Raw D1 row: real column names.
    expect(await env.DB.prepare("SELECT nombre, moneda, contacto_whatsapp FROM tiendas").first()).toEqual({
      nombre: "Panadería La Espiga",
      moneda: "ARS",
      contacto_whatsapp: "+5491122334455",
    });
  });

  it("transfer and product can be skipped; WhatsApp can't", async () => {
    const cookies = await startTestSession("completa", { completed: false });
    const options = { cookies };
    await send("POST", "/api/onboarding/advance", { step: "acceso" }, options);
    await send("PUT", "/api/store", { name: "La Espiga" }, options);
    await send("POST", "/api/onboarding/advance", { step: "nombre" }, options);

    const whatsappSkip = await send(
      "POST",
      "/api/onboarding/advance",
      { step: "whatsapp", skipped: true },
      options,
    );
    expect(whatsappSkip.status).toBe(422);
    expect(await errorCode(whatsappSkip)).toBe("INVALID_STEP");

    await send("PUT", "/api/payment-methods/whatsapp", { number: "11 2233-4455" }, options);
    await send("POST", "/api/onboarding/advance", { step: "whatsapp" }, options);
    expect(
      (await send("POST", "/api/onboarding/advance", { step: "transferencia", skipped: true }, options))
        .status,
    ).toBe(200);
    const end = await send("POST", "/api/onboarding/advance", { step: "producto", skipped: true }, options);
    expect(await end.json()).toEqual({ step: "producto", completed: true });
  });

  it("validations → 422 with the domain code", async () => {
    const cookies = await startTestSession("completa", { completed: false });
    const options = { cookies };
    expect(await errorCode(await send("PUT", "/api/store", { name: "  " }, options))).toBe("EMPTY_NAME");
    expect(await errorCode(await send("PUT", "/api/store", {}, options))).toBe("INVALID_INPUT");
    await send("PUT", "/api/store", { name: "La Espiga" }, options);
    expect(
      await errorCode(await send("PUT", "/api/payment-methods/whatsapp", { number: "hello" }, options)),
    ).toBe("INVALID_WHATSAPP");
    const cbu = await send(
      "PUT",
      "/api/payment-methods/transfer",
      { account: "2850590940090418135202", holder: "Ana" },
      options,
    );
    expect(await errorCode(cbu)).toBe("INVALID_TRANSFER");
    expect(await errorCode(await send("POST", "/api/onboarding/advance", { step: "other" }, options))).toBe(
      "INVALID_INPUT",
    );
  });

  it("the language is picked with the name and changed later; an unknown one → INVALID_LANGUAGE", async () => {
    const cookies = await startTestSession("completa", { completed: false });
    const options = { cookies };
    const languageInD1 = async () =>
      (await env.DB.prepare("SELECT idioma AS language FROM tiendas").first<{ language: string }>())
        ?.language;

    expect(await errorCode(await send("PUT", "/api/store/language", { language: "en" }, options))).toBe(
      "INVALID_STEP",
    );
    const withoutLanguage = await send("PUT", "/api/store", { name: "La Espiga" }, options);
    expect(await withoutLanguage.json()).toMatchObject({ language: "es" });
    const withLanguage = await send("PUT", "/api/store", { name: "Padaria", language: "pt" }, options);
    expect(await withLanguage.json()).toMatchObject({ name: "Padaria", language: "pt" });
    expect(await languageInD1()).toBe("pt");

    const change = await send("PUT", "/api/store/language", { language: "en" }, options);
    expect(change.status).toBe(200);
    expect(await change.json()).toEqual({ language: "en" });
    expect(await languageInD1()).toBe("en");

    const invalid = await send("PUT", "/api/store/language", { language: "fr" }, options);
    expect(invalid.status).toBe(422);
    expect(await errorCode(invalid)).toBe("INVALID_LANGUAGE");
    expect(await errorCode(await send("PUT", "/api/store", { name: "X", language: "xx" }, options))).toBe(
      "INVALID_LANGUAGE",
    );
    expect(await errorCode(await send("PUT", "/api/store/language", {}, options))).toBe("INVALID_INPUT");
    expect(await languageInD1()).toBe("en");
  });

  it("the heartbeat is turned off (and on) from the store; a non-boolean → INVALID_INPUT", async () => {
    const options = { cookies: await startTestSession("completa") };
    const enabledInD1 = async () =>
      (await env.DB.prepare("SELECT latido_activo AS enabled FROM tiendas").first<{ enabled: number }>())
        ?.enabled;
    expect(await errorCode(await send("PUT", "/api/store/heartbeat", { enabled: false }, options))).toBe(
      "INVALID_STEP",
    );
    await send("PUT", "/api/store", { name: "La Espiga" }, options);
    expect(await enabledInD1()).toBe(1);

    const off = await send("PUT", "/api/store/heartbeat", { enabled: false }, options);
    expect(off.status).toBe(200);
    expect(await off.json()).toEqual({ enabled: false });
    expect(await enabledInD1()).toBe(0);

    const invalid = await send("PUT", "/api/store/heartbeat", { enabled: "no" }, options);
    expect(invalid.status).toBe(422);
    expect(await errorCode(invalid)).toBe("INVALID_INPUT");
    expect(await enabledInD1()).toBe(0);

    const on = await send("PUT", "/api/store/heartbeat", { enabled: true }, options);
    expect(await on.json()).toEqual({ enabled: true });
    expect(await enabledInD1()).toBe(1);
  });

  it.each([
    ["PUT", "/api/store", { name: "x" }],
    ["PUT", "/api/store/language", { language: "en" }],
    ["PUT", "/api/store/heartbeat", { enabled: false }],
    ["PUT", "/api/payment-methods/whatsapp", { number: "11 2233-4455" }],
    ["PUT", "/api/payment-methods/transfer", { account: "mate.dulce", holder: "Ana" }],
    ["POST", "/api/onboarding/advance", { step: "acceso" }],
  ])("%s %s without a session → 401, with a recovery session → 403", async (method, path, body) => {
    expect((await send(method, path, body)).status).toBe(401);
    const recovery = await startTestSession("recuperacion");
    expect((await send(method, path, body, { cookies: recovery })).status).toBe(403);
  });
});
