import { describe, expect, it } from "vitest";
import { isErr, isOk } from "../../../src/packages/core/domain/result";
import type { HostingClient } from "../../../src/packages/core/ports/hosting";
import { hostedUpdateStatus, requestHostedUpdate } from "../../../src/packages/core/use-cases/hosted-updates";

const hosting = (latest: string | Error, requests: string[] = []): HostingClient => ({
  async latestVersion() {
    if (latest instanceof Error) throw latest;
    return { version: latest, kind: "security" as const };
  },
  async requestUpdate() {
    requests.push("update");
  },
});

describe("hosted updates", () => {
  it("reports a newer version as available", async () => {
    const r = await hostedUpdateStatus({ hosting: hosting("0.14.0") })("0.13.2");
    expect(isOk(r) && r.value).toEqual({
      status: "update-available",
      current: "0.13.2",
      newVersion: "0.14.0",
      kind: "security",
    });
  });

  it("reports the same version as up to date", async () => {
    const r = await hostedUpdateStatus({ hosting: hosting("0.13.2") })("0.13.2");
    expect(isOk(r) && r.value.status).toBe("up-to-date");
  });

  it("turns a hosting failure into HOSTING_NOT_RESPONDING instead of throwing", async () => {
    const r = await hostedUpdateStatus({ hosting: hosting(new Error("down")) })("0.13.2");
    expect(isErr(r) && r.error.code).toBe("HOSTING_NOT_RESPONDING");
  });

  it("asks the hosting service to update", async () => {
    const requests: string[] = [];
    const r = await requestHostedUpdate({ hosting: hosting("0.14.0", requests) })();
    expect(isOk(r)).toBe(true);
    expect(requests).toEqual(["update"]);
  });

  it("requestUpdate failure is HOSTING_NOT_RESPONDING", async () => {
    const failing: HostingClient = {
      latestVersion: async () => ({ version: "0.14.0", kind: "feature" }),
      requestUpdate: async () => {
        throw new Error("503");
      },
    };
    const r = await requestHostedUpdate({ hosting: failing })();
    expect(isErr(r) && r.error.code).toBe("HOSTING_NOT_RESPONDING");
  });
});
