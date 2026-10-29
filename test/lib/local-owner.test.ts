import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { build } from "../../src/container";
import { ensureLocalOwner, startLocalSession } from "../../src/dev/local-owner";
import { clearD1, clearR2 } from "../helpers";

const LOCAL = new URL("http://localhost:4321/");

beforeEach(async () => {
  await clearD1();
  await clearR2();
});

describe("local development owner", () => {
  it("claims an unclaimed store, finishes onboarding and loads every sample industry", async () => {
    await ensureLocalOwner(env, LOCAL);
    const container = build(env);
    expect(await container.storeStatus()).toEqual({ status: "ready" });
    expect((await container.getStore())?.name).toBe("Tiendita local");
    expect((await container.getPaymentMethod("whatsapp"))?.active).toBe(true);
    expect(await container.allowedOrigins()).toEqual(["http://localhost:4321"]);
    expect((await container.listProducts()).length).toBeGreaterThan(0);
  });

  it("leaves a store that already has an owner alone", async () => {
    await ensureLocalOwner(env, LOCAL);
    const before = (await build(env).listProducts()).length;
    await ensureLocalOwner(env, new URL("http://localhost:9999/"));
    expect((await build(env).listProducts()).length).toBe(before);
    expect(await build(env).allowedOrigins()).toEqual(["http://localhost:4321"]);
  });

  it("starts a full session the panel accepts", async () => {
    await ensureLocalOwner(env, LOCAL);
    const { token } = await startLocalSession(env);
    const r = await build(env).access.validateSession(token);
    expect(r.ok && r.value.session.type).toBe("completa");
  });
});
