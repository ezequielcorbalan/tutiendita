import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { beforeAll } from "vitest";

/** Applies the migrations (read in vitest.config.ts) to the emulated D1; it's idempotent. */
beforeAll(async () => {
  await applyD1Migrations(env.DB, env.MIGRATIONS);
});
