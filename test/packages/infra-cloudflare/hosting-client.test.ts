import { describe, expect, it } from "vitest";
import { createHostingClient } from "../../../src/packages/infra-cloudflare/hosting/hosting-client";

/** Fake fetch that records its calls and answers with `status` and `body`. */
function fakeFetch(status: number, body: unknown = null) {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const f: typeof fetch = async (input, init) => {
    calls.push({ url: String(input), init });
    return new Response(body === null ? null : JSON.stringify(body), { status });
  };
  return { f, calls };
}

describe("hosting client", () => {
  it("reads the latest version with the store's bearer token", async () => {
    const { f, calls } = fakeFetch(200, { latest: "0.14.0", kind: "security" });
    const latest = await createHostingClient("https://hosting.test", "secret", f).latestVersion();
    expect(latest).toEqual({ version: "0.14.0", kind: "security" });
    expect(calls[0]?.url).toBe("https://hosting.test/api/self/version");
    expect(new Headers(calls[0]?.init?.headers).get("authorization")).toBe("Bearer secret");
    expect(calls[0]?.init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("an unknown or missing kind counts as a feature update; a trailing slash in the URL is fine", async () => {
    const { f, calls } = fakeFetch(200, { latest: "0.14.0", kind: "whatever" });
    const latest = await createHostingClient("https://hosting.test/", "secret", f).latestVersion();
    expect(latest.kind).toBe("feature");
    expect(calls[0]?.url).toBe("https://hosting.test/api/self/version");
  });

  it("rejects when the service answers an error or no version", async () => {
    await expect(
      createHostingClient("https://hosting.test", "s", fakeFetch(500).f).latestVersion(),
    ).rejects.toThrow("hosting answered 500");
    await expect(
      createHostingClient("https://hosting.test", "s", fakeFetch(200, {}).f).latestVersion(),
    ).rejects.toThrow("no version");
  });

  it("posts the update request with the bearer token", async () => {
    const { f, calls } = fakeFetch(202);
    await createHostingClient("https://hosting.test", "secret", f).requestUpdate();
    expect(calls[0]?.url).toBe("https://hosting.test/api/self/update");
    expect(calls[0]?.init?.method).toBe("POST");
    expect(new Headers(calls[0]?.init?.headers).get("authorization")).toBe("Bearer secret");
  });

  it("rejects when the update is refused", async () => {
    await expect(
      createHostingClient("https://hosting.test", "s", fakeFetch(403).f).requestUpdate(),
    ).rejects.toThrow("hosting answered 403");
  });
});
