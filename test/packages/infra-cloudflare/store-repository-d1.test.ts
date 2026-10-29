import { env } from "cloudflare:test";
import type { Store } from "../../../src/packages/core/index";
import { beforeEach, describe, expect, it } from "vitest";
import { createD1StoreRepository } from "../../../src/packages/infra-cloudflare/d1/store-repository-d1";

const insert = (columns: Record<string, string | null>) => {
  const names = Object.keys(columns);
  return env.DB.prepare(
    `INSERT INTO tiendas (${names.join(", ")}) VALUES (${names.map(() => "?").join(", ")})`,
  )
    .bind(...Object.values(columns))
    .run();
};

describe("D1StoreRepository", () => {
  const repo = createD1StoreRepository(env.DB);

  beforeEach(async () => {
    await env.DB.prepare("DELETE FROM tiendas").run();
  });

  it("with no row in tiendas returns null (first start)", async () => {
    expect(await repo.get()).toBeNull();
  });

  it("with the row returns the mapped store, with nested contact", async () => {
    await insert({
      id: "store-1",
      nombre: "La tiendita de Ana",
      descripcion: "Dulces caseros",
      logo_key: "01ARZ3NDEKTSV4RRFFQ69G5FAV.png",
      moneda: "ARS",
      contacto_whatsapp: "+5491100000000",
      contacto_email: null,
      dominio: null,
      creado_en: "2026-10-15T10:00:00.000Z",
      actualizado_en: "2026-10-15T10:00:00.000Z",
    });
    const expected: Store = {
      id: "store-1",
      name: "La tiendita de Ana",
      description: "Dulces caseros",
      logoKey: "01ARZ3NDEKTSV4RRFFQ69G5FAV.png",
      currency: "ARS",
      language: "es",
      contact: { whatsapp: "+5491100000000", email: null },
      domain: null,
      heartbeatEnabled: true,
      heartbeatSentAt: null,
    };
    expect(await repo.get()).toEqual(expected);
  });

  it("save inserts and then updates the language", async () => {
    const store: Store = {
      id: "store-2",
      name: "Bakery",
      description: "",
      logoKey: null,
      currency: "USD",
      language: "en",
      contact: { whatsapp: null, email: null },
      domain: null,
      heartbeatEnabled: true,
      heartbeatSentAt: null,
    };
    await repo.save(store, new Date("2026-10-15T10:00:00.000Z"));
    expect(await repo.get()).toEqual(store);
    await repo.save({ ...store, language: "pt" }, new Date("2026-10-15T11:00:00.000Z"));
    expect(await repo.get()).toEqual({ ...store, language: "pt" });
  });

  describe("heartbeat", () => {
    const store: Store = {
      id: "store-3",
      name: "Bakery",
      description: "",
      logoKey: null,
      currency: "USD",
      language: "en",
      contact: { whatsapp: null, email: null },
      domain: null,
      heartbeatEnabled: true,
      heartbeatSentAt: null,
    };
    const T0 = new Date("2026-10-15T10:00:00.000Z");
    const row = () =>
      env.DB.prepare("SELECT nombre, latido_activo, latido_en, actualizado_en FROM tiendas").first<{
        nombre: string;
        latido_activo: number;
        latido_en: string | null;
        actualizado_en: string;
      }>();

    it("save round-trips the two fields", async () => {
      const sent = { ...store, heartbeatEnabled: false, heartbeatSentAt: "2026-10-16T00:00:00.000Z" };
      await repo.save(sent, T0);
      expect(await repo.get()).toEqual(sent);
    });

    it("save of an existing row keeps the heartbeat columns (they have their own writers)", async () => {
      await repo.save(store, T0);
      await repo.setHeartbeat(false, T0);
      await repo.markHeartbeat(new Date("2026-10-17T10:00:00.000Z"));
      // A Store read before those writes, saved later (slow domain check): the columns are not reverted.
      await repo.save({ ...store, name: "Bakery 2" }, T0);
      expect(await row()).toMatchObject({
        nombre: "Bakery 2",
        latido_activo: 0,
        latido_en: "2026-10-17T10:00:00.000Z",
      });
    });

    it("markHeartbeat writes only latido_en", async () => {
      await repo.save(store, T0);
      await repo.markHeartbeat(new Date("2026-10-17T10:00:00.000Z"));
      expect(await row()).toEqual({
        nombre: "Bakery",
        latido_activo: 1,
        latido_en: "2026-10-17T10:00:00.000Z",
        actualizado_en: T0.toISOString(),
      });
      expect((await repo.get())?.heartbeatSentAt).toBe("2026-10-17T10:00:00.000Z");
    });

    it("setHeartbeat writes latido_activo and the update date", async () => {
      await repo.save(store, T0);
      await repo.setHeartbeat(false, new Date("2026-10-17T10:00:00.000Z"));
      expect(await row()).toMatchObject({
        latido_activo: 0,
        latido_en: null,
        actualizado_en: "2026-10-17T10:00:00.000Z",
      });
      expect((await repo.get())?.heartbeatEnabled).toBe(false);
    });
  });
});
