import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";
import { claimCodePlugin } from "./integrations/claim-code.mjs";
import { TEST_CLAIM_CODE } from "./test/test-code.mjs";

// The photos bucket is optional (added from Settings), so the projects that load the built Worker bind it
// like a store with R2 (hosted stores always have it).
const R2 = { r2Buckets: ["IMAGENES"] };

// REGISTRY_URL "" disables the heartbeat: no test leaves the network.
const testBindings = async () => ({ MIGRATIONS: await readD1Migrations("migraciones"), REGISTRY_URL: "" });

export default defineConfig({
  test: {
    projects: [
      {
        // Domain rules and use cases (src/packages/core): plain Node, no Worker.
        test: { name: "core", include: ["test/packages/core/**/*.test.ts"] },
      },
      {
        // D1, R2 and HTTP adapters (src/packages/infra-cloudflare) against the emulated bindings.
        plugins: [
          cloudflareTest(async () => ({
            wrangler: { configPath: "./test/packages/infra-cloudflare/wrangler.test.jsonc" },
            miniflare: { bindings: { MIGRATIONS: await readD1Migrations("migraciones") } },
          })),
        ],
        test: {
          name: "infra",
          include: ["test/packages/infra-cloudflare/**/*.test.ts"],
          setupFiles: ["./test/packages/infra-cloudflare/setup.ts"],
        },
      },
      {
        // API: the Hono app directly (src/api/app.ts), without depending on the Astro build. The claim
        // code's virtual module is resolved by the same plugin the build uses, with the test code.
        plugins: [
          claimCodePlugin({ code: TEST_CLAIM_CODE }),
          cloudflareTest(async () => ({
            wrangler: { configPath: "./wrangler.test.jsonc" },
            miniflare: { bindings: await testBindings() },
          })),
        ],
        test: {
          name: "api",
          include: ["test/api/**/*.test.ts", "test/lib/**/*.test.ts"],
          setupFiles: ["./test/setup.ts"],
          // The app is imported on the first call (test/helpers.ts) and SimpleWebAuthn takes a while to
          // transform the first time, especially with the "pages" project running in parallel.
          testTimeout: 60_000,
        },
      },
      {
        // Pages: the Worker that `astro build` produces (dist/server), with its wrangler.json; the pool
        // loads it as main and the tests hit it with exports.default.fetch. `npm test` builds first with
        // scripts/test-build.mjs (fixed CODIGO_DE_RECLAMO).
        plugins: [
          cloudflareTest(async () => ({
            wrangler: { configPath: "./dist/server/wrangler.json" },
            miniflare: { ...R2, bindings: await testBindings() },
          })),
        ],
        test: { name: "pages", include: ["test/pages/**/*.test.ts"], setupFiles: ["./test/setup.ts"] },
      },
      {
        // The same built Worker as a store of the hosted plan: its env as the hosting service deploys it,
        // and a fake hosting service that answers every outbound request (a security release is pending).
        plugins: [
          cloudflareTest(async () => ({
            wrangler: { configPath: "./dist/server/wrangler.json" },
            miniflare: {
              ...R2,
              bindings: {
                ...(await testBindings()),
                HOSTING_URL: "https://hosting.test",
                HOSTING_TOKEN: "store-token",
                // sha256 of 7KQ2M9XD4RTAABCDEFGH0112 (test/pages-hosted)
                CLAIM_CODE_HASH: "af203d19d0395a189dc92f3a6fb8147078c56e7627038d205388de007e9e3ef9",
                MAX_PRODUCTS: "200",
              },
              outboundService: (request: Request) =>
                new URL(request.url).pathname === "/api/self/version"
                  ? Response.json({ latest: "99.0.0", kind: "security" })
                  : new Response(null, { status: 202 }),
            },
          })),
        ],
        test: {
          name: "pages-hosted",
          include: ["test/pages-hosted/**/*.test.ts"],
          setupFiles: ["./test/setup.ts"],
        },
      },
    ],
  },
});
