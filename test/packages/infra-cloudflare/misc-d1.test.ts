import { env } from "cloudflare:test";
import type { Store } from "../../../src/packages/core/index";
import { beforeEach, describe, expect, it } from "vitest";
import { createD1AttemptLimiter } from "../../../src/packages/infra-cloudflare/d1/attempt-limiter-d1";
import { createD1PaymentMethodRepository } from "../../../src/packages/infra-cloudflare/d1/payment-method-repository-d1";
import { createD1StoreRepository } from "../../../src/packages/infra-cloudflare/d1/store-repository-d1";
import { webCryptography } from "../../../src/packages/infra-cloudflare/webcrypto-cryptography";

const T0 = new Date("2026-10-15T10:00:00.000Z");
const more = (min: number) => new Date(T0.getTime() + min * 60_000);

beforeEach(async () => {
  await env.DB.batch(
    ["intentos_fallidos", "medios_de_pago", "tiendas"].map((t) => env.DB.prepare(`DELETE FROM ${t}`)),
  );
});

describe("D1AttemptLimiter", () => {
  const limiter = createD1AttemptLimiter(env.DB);

  it("blocks at 10 failures within the 15-minute window, per key", async () => {
    for (let i = 0; i < 9; i += 1) await limiter.recordFailure("reclamo:1.1.1.1", more(1));
    expect(await limiter.isBlocked("reclamo:1.1.1.1", more(2))).toBe(false);
    await limiter.recordFailure("reclamo:1.1.1.1", more(14));
    expect(await limiter.isBlocked("reclamo:1.1.1.1", more(14))).toBe(true);
    expect(await limiter.isBlocked("reclamo:2.2.2.2", more(14))).toBe(false);
    expect(await limiter.isBlocked("reclamo:1.1.1.1", more(15))).toBe(false);
  });

  it("accepts another maximum per window (sign-in requests)", async () => {
    for (let i = 0; i < 10; i += 1) await limiter.recordFailure("ingreso:1.1.1.1", more(1));
    expect(await limiter.isBlocked("ingreso:1.1.1.1", more(2), 30)).toBe(false);
    expect(await limiter.isBlocked("ingreso:1.1.1.1", more(2))).toBe(true);
  });

  it("recording deletes old windows", async () => {
    await limiter.recordFailure("a", T0);
    await limiter.recordFailure("b", more(30));
    expect(await env.DB.prepare("SELECT clave FROM intentos_fallidos").all()).toMatchObject({
      results: [{ clave: "b" }],
    });
  });
});

describe("D1PaymentMethodRepository", () => {
  const methods = createD1PaymentMethodRepository(env.DB);

  it("saves and reads the config of each type with Spanish JSON keys in D1; saving again replaces", async () => {
    expect(await methods.get("whatsapp")).toBeNull();
    const whatsapp = {
      type: "whatsapp" as const,
      active: true,
      config: { number: "+5491122334455", template: "Hola" },
      updatedAt: T0,
    };
    await methods.save(whatsapp);
    expect(await methods.get("whatsapp")).toEqual(whatsapp);
    const stored = () => env.DB.prepare("SELECT tipo, configuracion FROM medios_de_pago ORDER BY tipo").all();
    // A row as an existing store already has it (Spanish JSON keys).
    await env.DB.prepare(
      "INSERT INTO medios_de_pago (tipo, activo, configuracion, actualizado_en) VALUES ('transferencia', 0, ?, ?)",
    )
      .bind('{"tipoDeCuenta":"alias","cuenta":"mate.dulce","titular":"Ana"}', more(1).toISOString())
      .run();
    const transfer = {
      type: "transferencia" as const,
      active: false,
      config: { accountType: "alias" as const, account: "mate.dulce", holder: "Ana" },
      updatedAt: more(1),
    };
    expect(await methods.get("transferencia")).toEqual(transfer);
    await methods.save({ ...transfer, active: true });
    expect(await methods.get("transferencia")).toEqual({ ...transfer, active: true });
    expect((await stored()).results).toEqual([
      {
        tipo: "transferencia",
        configuracion: '{"tipoDeCuenta":"alias","cuenta":"mate.dulce","titular":"Ana"}',
      },
      { tipo: "whatsapp", configuracion: '{"numero":"+5491122334455","plantilla":"Hola"}' },
    ]);
  });
});

describe("D1StoreRepository.save", () => {
  const repo = createD1StoreRepository(env.DB);
  const store: Store = {
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
  };

  it("inserts the first time and updates afterwards keeping the creation date", async () => {
    await repo.save(store, T0);
    expect(await repo.get()).toEqual(store);
    const changed = {
      ...store,
      name: "La Espiga",
      contact: { whatsapp: "+5491122334455", email: null },
    };
    await repo.save(changed, more(5));
    expect(await repo.get()).toEqual(changed);
    expect(await env.DB.prepare("SELECT creado_en, actualizado_en FROM tiendas").first()).toEqual({
      creado_en: T0.toISOString(),
      actualizado_en: more(5).toISOString(),
    });
  });
});

describe("webCryptography", () => {
  it("hex SHA-256 of a known vector", async () => {
    expect(await webCryptography.sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("random bytes of the requested length, different between calls", () => {
    const a = webCryptography.randomBytes(32);
    expect(a).toHaveLength(32);
    expect(a).not.toEqual(webCryptography.randomBytes(32));
  });

  it("constant-time comparison", () => {
    expect(webCryptography.constantTimeEquals("abcd", "abcd")).toBe(true);
    expect(webCryptography.constantTimeEquals("abcd", "abce")).toBe(false);
    expect(webCryptography.constantTimeEquals("abc", "abcd")).toBe(false);
  });
});

describe("GitHub connection in D1", () => {
  it("stores a single row and updates it on install", async () => {
    const { createD1GithubConnectionRepository } = await import("../../../src/packages/infra-cloudflare/d1/github-connection-repository-d1");
    const repo = createD1GithubConnectionRepository(env.DB);
    expect(await repo.get()).toBeNull();
    const base = {
      appId: 7,
      slug: "tiendita-ana",
      privateKeyPem: "PEM",
      installationId: null,
      repository: null,
    };
    await repo.save(base, new Date("2026-10-15T12:00:00Z"));
    await repo.save(
      { ...base, installationId: 99, repository: "ana/tiendita" },
      new Date("2026-10-15T12:01:00Z"),
    );
    expect(await repo.get()).toEqual({ ...base, installationId: 99, repository: "ana/tiendita" });
    const { results } = await env.DB.prepare("SELECT count(*) AS n FROM conexion_github").all<{
      n: number;
    }>();
    expect(results[0]?.n).toBe(1);
  });
});
