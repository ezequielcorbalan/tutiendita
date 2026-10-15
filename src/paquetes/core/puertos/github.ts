import type { ConexionGithub, ConexionLista } from "../dominio/actualizacion";

/** Habla con la API de GitHub en nombre de la app propia de la tienda. Los errores de red o de GitHub se lanzan. */
export interface ClienteGithub {
  /** Canjea el `code` que devuelve GitHub al crear la app desde el manifiesto. */
  canjearManifiesto(codigo: string): Promise<{ appId: number; slug: string; clavePrivada: string }>;
  /** `dueño/repo` de cada repositorio al que la instalación tiene acceso (verifica que la instalación sea de la app). */
  repositoriosDeLaInstalacion(c: ConexionGithub & { instalacionId: number }): Promise<string[]>;
  /** Versión (`package.json`) en `main` del repo oficial. */
  versionOficial(c: ConexionLista, repoOficial: string): Promise<string>;
  /**
   * Abre en el repo de la tienda un pull request con los archivos del repo oficial que cambiaron, sin tocar
   * `conservar`. Devuelve `null` si no hay nada que cambiar.
   */
  prepararActualizacion(
    c: ConexionLista,
    p: { repoOficial: string; version: string; conservar: readonly string[] },
  ): Promise<{ numero: number; url: string; archivos: number } | null>;
  /** Mergea el pull request (squash): Cloudflare redespliega solo con el push a la rama principal. */
  aplicarActualizacion(c: ConexionLista, numero: number): Promise<void>;
}

/** Una sola conexión por tienda. */
export interface RepositorioConexionGithub {
  obtener(): Promise<ConexionGithub | null>;
  guardar(c: ConexionGithub, ahora: Date): Promise<void>;
}
