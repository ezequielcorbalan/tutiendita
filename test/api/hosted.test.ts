import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearD1, create, send, startTestSession, validCreation } from "../helpers";
import { TEST_CLAIM_CODE } from "../test-code.mjs";

const codeOf = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code;
const sha256Hex = async (text: string) => {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
};

beforeEach(clearD1);

describe("hosted plan: MAX_PRODUCTS", () => {
  const limited = { ...env, MAX_PRODUCTS: "1" } as Env;

  it("answers 409 PRODUCT_LIMIT_REACHED once the store holds that many products", async () => {
    expect((await create(validCreation(), limited)).status).toBe(201);
    const second = await create(validCreation({ name: "Otro" }), limited);
    expect(second.status).toBe(409);
    expect(await codeOf(second)).toBe("PRODUCT_LIMIT_REACHED");
  });

  it("is ignored when it is not a positive number", async () => {
    const lax = { ...env, MAX_PRODUCTS: "0" } as Env;
    expect((await create(validCreation(), lax)).status).toBe(201);
    expect((await create(validCreation({ name: "Otro" }), lax)).status).toBe(201);
  });
});

describe("hosted plan: CLAIM_CODE_HASH", () => {
  const HOSTED_CODE = "7KQ2-M9XD-4RTA-ABCD-EFGH-0112";
  const claim = (code: string, environment: Env) =>
    send("POST", "/api/access/claim", { code }, { environment });

  it("claims with the code whose hash the deployer passed, never with the build's", async () => {
    const hosted = {
      ...env,
      HOSTING_URL: "https://hosting.test",
      CLAIM_CODE_HASH: await sha256Hex("7KQ2M9XD4RTAABCDEFGH0112"),
    } as Env;
    const build = await claim(TEST_CLAIM_CODE, hosted);
    expect(build.status).toBe(422);
    expect(await codeOf(build)).toBe("INVALID_CODE");
    expect((await claim(HOSTED_CODE, hosted)).status).toBe(200);
  });

  it("accepts the hash in uppercase or with a trailing newline", async () => {
    const hash = await sha256Hex("7KQ2M9XD4RTAABCDEFGH0112");
    const hosted = {
      ...env,
      HOSTING_URL: "https://hosting.test",
      CLAIM_CODE_HASH: `${hash.toUpperCase()}\n`,
    } as Env;
    expect((await claim(HOSTED_CODE, hosted)).status).toBe(200);
  });

  it("a hosted store without a valid hash can't be claimed, not even with the build's code", async () => {
    for (const CLAIM_CODE_HASH of [undefined, "", "not-a-hash"]) {
      const hosted = { ...env, HOSTING_URL: "https://hosting.test", CLAIM_CODE_HASH } as Env;
      const res = await claim(TEST_CLAIM_CODE, hosted);
      expect(res.status).toBe(422);
      expect(await codeOf(res)).toBe("INVALID_CODE");
    }
  });
});

describe("hosted plan: Update button", () => {
  const hosted = { ...env, HOSTING_URL: "https://hosting.test", HOSTING_TOKEN: "store-secret" } as Env;
  afterEach(() => vi.restoreAllMocks());

  it("is 404 on a store that is not hosted", async () => {
    const cookies = await startTestSession();
    expect((await send("POST", "/api/updates/hosted", {}, { cookies })).status).toBe(404);
  });

  it("asks the hosting service with the store's token and answers 202", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 202 }));
    const cookies = await startTestSession();
    const res = await send("POST", "/api/updates/hosted", {}, { cookies, environment: hosted });
    expect(res.status).toBe(202);
    const [url, init] = fetchSpy.mock.calls[0] ?? [];
    expect(String(url)).toBe("https://hosting.test/api/self/update");
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer store-secret");
  });

  it("answers 502 HOSTING_NOT_RESPONDING when the service refuses", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 500 }));
    const cookies = await startTestSession();
    const res = await send("POST", "/api/updates/hosted", {}, { cookies, environment: hosted });
    expect(res.status).toBe(502);
    expect(await codeOf(res)).toBe("HOSTING_NOT_RESPONDING");
  });

  it("needs the owner's session", async () => {
    const res = await send("POST", "/api/updates/hosted", {}, { environment: hosted });
    expect(res.status).toBe(401);
  });
});
