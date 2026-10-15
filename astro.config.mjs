import cloudflare from "@astrojs/cloudflare";
import { defineConfig } from "astro/config";
import claimCode from "./integrations/claim-code.mjs";

// Astro leads: the middleware delegates /api, /img, /feed, /.well-known and /mcp to Hono.
export default defineConfig({
  output: "server",
  adapter: cloudflare({
    // No Astro image service: product images are served by Hono from R2.
    imageService: "passthrough",
  }),
  // No Astro sessions: keeps the adapter from adding a "SESSION" KV binding nobody uses.
  session: false,
  // The store's claim code: generated on every build, shown at the end of the build log.
  integrations: [claimCode()],
});
