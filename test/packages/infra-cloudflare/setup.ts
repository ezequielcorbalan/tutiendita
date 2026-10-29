import { applyD1Migrations, env } from "cloudflare:test";
import { beforeAll } from "vitest";

/** Applies the migrations (read in vitest.config.ts) to the emulated D1; it is idempotent. */
beforeAll(async () => {
  await applyD1Migrations(env.DB, env.MIGRATIONS);
});
