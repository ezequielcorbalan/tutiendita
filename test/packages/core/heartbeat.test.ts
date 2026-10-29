import { describe, expect, it } from "vitest";
import { HEARTBEAT_INTERVAL_MS, shouldSendHeartbeat } from "../../../src/packages/core/domain/heartbeat";
import { createStore, type Store } from "../../../src/packages/core/domain/store";
import type { StoreRegistry } from "../../../src/packages/core/ports/store-registry";
import { sendHeartbeat, setHeartbeatEnabled } from "../../../src/packages/core/use-cases/heartbeat";
import { InMemoryStoreRepository } from "./doubles/in-memory";

const NOW = new Date("2026-10-17T10:00:00.000Z");
const HOUR = 60 * 60 * 1000;

function someStore(): Store {
  const r = createStore({ name: "Tienda" }, { id: "t1" });
  if (!r.ok) throw new Error("invalid store");
  return r.value;
}

class FakeRegistry implements StoreRegistry {
  readonly announced: string[] = [];
  constructor(private readonly failure: Error | null = null) {}
  async announce(origin: string): Promise<void> {
    if (this.failure) throw this.failure;
    this.announced.push(origin);
  }
}

describe("shouldSendHeartbeat", () => {
  it("is false when disabled", () => {
    expect(shouldSendHeartbeat({ heartbeatEnabled: false, heartbeatSentAt: null }, NOW)).toBe(false);
  });

  it("is true when never sent", () => {
    expect(shouldSendHeartbeat({ heartbeatEnabled: true, heartbeatSentAt: null }, NOW)).toBe(true);
  });

  it("is false 23 h after the last one", () => {
    const sentAt = new Date(NOW.getTime() - 23 * HOUR).toISOString();
    expect(shouldSendHeartbeat({ heartbeatEnabled: true, heartbeatSentAt: sentAt }, NOW)).toBe(false);
  });

  it("is true 24 h after the last one", () => {
    expect(HEARTBEAT_INTERVAL_MS).toBe(24 * HOUR);
    const sentAt = new Date(NOW.getTime() - HEARTBEAT_INTERVAL_MS).toISOString();
    expect(shouldSendHeartbeat({ heartbeatEnabled: true, heartbeatSentAt: sentAt }, NOW)).toBe(true);
  });
});

describe("sendHeartbeat", () => {
  it("marks the store and announces the origin", async () => {
    const store = new InMemoryStoreRepository(someStore());
    const registry = new FakeRegistry();
    await sendHeartbeat({ store, registry }, "https://tienda.example", NOW);
    expect((await store.get())?.heartbeatSentAt).toBe(NOW.toISOString());
    expect(registry.announced).toEqual(["https://tienda.example"]);
  });

  it("marks before announcing: a failing registry leaves the mark", async () => {
    const store = new InMemoryStoreRepository(someStore());
    const registry = new FakeRegistry(new Error("registry answered 500"));
    await expect(sendHeartbeat({ store, registry }, "https://tienda.example", NOW)).rejects.toThrow(
      "registry answered 500",
    );
    expect((await store.get())?.heartbeatSentAt).toBe(NOW.toISOString());
  });
});

describe("setHeartbeatEnabled", () => {
  it("persists the flag", async () => {
    const store = new InMemoryStoreRepository(someStore());
    const r = await setHeartbeatEnabled({ store }, false, NOW);
    expect(r.ok && r.value.heartbeatEnabled).toBe(false);
    expect((await store.get())?.heartbeatEnabled).toBe(false);
  });

  it("fails without a store", async () => {
    const r = await setHeartbeatEnabled({ store: new InMemoryStoreRepository() }, false, NOW);
    expect(!r.ok && r.error.code).toBe("INVALID_STEP");
  });
});
