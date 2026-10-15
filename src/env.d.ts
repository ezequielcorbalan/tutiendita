/// <reference types="astro/client" />

/** Bindings del Worker (`env` de `cloudflare:workers` y de Hono). */
declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    IMAGENES: R2Bucket;
    ASSETS: Fetcher;
  }
}

type Env = Cloudflare.Env;

declare namespace App {
  interface Locals {
    /** Idioma de la tienda: lo deja el middleware en toda página (español si todavía no hay tienda). */
    idioma?: import("./paquetes/core/index").Idioma;
    /** Lo deja el middleware en las páginas de /panel (ya decidió que se pueden mostrar). */
    panel?: {
      estado: import("./paquetes/core/index").EstadoDeLaTienda;
      sesion: import("./paquetes/core/index").TipoSesion | null;
    };
  }
}

/** Lo genera integraciones/codigo-de-reclamo.mjs en cada build: solo el SHA-256 (hex) del código. */
declare module "virtual:tiendita/reclamo" {
  export const hashDelCodigoDeReclamo: string;
}
