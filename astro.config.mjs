import cloudflare from "@astrojs/cloudflare";
import { defineConfig } from "astro/config";
import codigoDeReclamo from "./integraciones/codigo-de-reclamo.mjs";

// Astro manda: el middleware delega /api, /img, /feed, /.well-known y /mcp a Hono.
export default defineConfig({
  output: "server",
  adapter: cloudflare({
    // Sin servicio de imágenes de Astro: las imágenes de productos las sirve Hono desde R2.
    imageService: "passthrough",
  }),
  // Sin sesiones de Astro: evita que el adaptador agregue un binding KV "SESSION" que nadie usa.
  session: false,
  // Código de reclamo de la tienda: se genera en cada build y aparece al final del registro de compilación.
  integrations: [codigoDeReclamo()],
});
