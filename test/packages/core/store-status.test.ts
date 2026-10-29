import { describe, expect, it } from "vitest";
import { getStoreStatus } from "../../../src/packages/core/use-cases/get-store-status";
import {
  InMemoryAccessRepository,
  InMemoryCredentialRepository,
  InMemorySessionRepository,
} from "./doubles/access";

const newAccess = () =>
  new InMemoryAccessRepository(new InMemoryCredentialRepository(), new InMemorySessionRepository());

describe("getStoreStatus", () => {
  it("no access row: unclaimed (first start)", async () => {
    expect(await getStoreStatus({ access: newAccess() })()).toEqual({ status: "unclaimed" });
  });

  it("with an owner and onboarding half done: setting-up, with the saved step", async () => {
    const access = newAccess();
    access.seedOwner({ origin: "https://x.workers.dev", rpId: "x.workers.dev", primary: true });
    await access.saveOnboarding("whatsapp", null);
    expect(await getStoreStatus({ access })()).toEqual({ status: "setting-up", step: "whatsapp" });
  });

  it("with onboarding completed: ready", async () => {
    const access = newAccess();
    access.seedOwner({ origin: "https://x.workers.dev", rpId: "x.workers.dev", primary: true });
    await access.saveOnboarding("producto", new Date());
    expect(await getStoreStatus({ access })()).toEqual({ status: "ready" });
  });
});
