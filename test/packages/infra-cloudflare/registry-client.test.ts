import { describe, expect, it } from "vitest";
import { createRegistryClient } from "../../../src/packages/infra-cloudflare/registry/registry-client";

/** Fake fetch that records its single call and answers with `status`. */
function fakeFetch(status: number) {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const f: typeof fetch = async (input, init) => {
    calls.push({ url: String(input), init });
    return new Response(null, { status });
  };
  return { f, calls };
}

describe("registry client", () => {
  it("posts { url } as JSON to <base>/api/heartbeat with a timeout", async () => {
    const { f, calls } = fakeFetch(204);
    await createRegistryClient("https://tutiendita.ar", f).announce("https://tienda.example");
    expect(calls).toHaveLength(1);
    const [call] = calls;
    expect(call?.url).toBe("https://tutiendita.ar/api/heartbeat");
    expect(call?.init?.method).toBe("POST");
    expect(new Headers(call?.init?.headers).get("content-type")).toBe("application/json");
    expect(call?.init?.body).toBe('{"url":"https://tienda.example"}');
    expect(call?.init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("rejects when the registry answers 5xx", async () => {
    const { f } = fakeFetch(500);
    await expect(
      createRegistryClient("https://tutiendita.ar", f).announce("https://tienda.example"),
    ).rejects.toThrow("registry answered 500");
  });
});
