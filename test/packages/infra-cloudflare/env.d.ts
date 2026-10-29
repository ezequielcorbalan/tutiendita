/** Bindings seen by `env` from `cloudflare:test` (the pool types it as `Cloudflare.Env`). */
declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    IMAGENES: R2Bucket;
    MIGRATIONS: import("cloudflare:test").D1Migration[];
  }
}
