/** Extra bindings that only exist in tests (migrations read in vitest.config.ts). */
declare namespace Cloudflare {
  interface Env {
    MIGRATIONS: import("cloudflare:test").D1Migration[];
  }
  /** Main of the "pages" project: the Astro Worker (exports.default.fetch in the tests). */
  interface GlobalProps {
    mainModule: typeof import("@astrojs/cloudflare/entrypoints/server");
  }
}
