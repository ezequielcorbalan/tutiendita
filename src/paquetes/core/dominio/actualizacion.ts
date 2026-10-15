/** Repo oficial del que salen las versiones nuevas. Un fork que publique su propia línea cambia esta constante. */
export const REPO_OFICIAL = "ezequielcorbalan/tutiendita";

/** Archivos del repo del comerciante que una actualización nunca pisa: `wrangler.jsonc` tiene los IDs de su base. */
export const ARCHIVOS_QUE_SE_CONSERVAN: readonly string[] = ["wrangler.jsonc"];

/** La GitHub App propia de la tienda (creada desde el panel con el manifiesto) y dónde está instalada. */
export type ConexionGithub = {
  readonly appId: number;
  readonly slug: string;
  /** Clave privada PEM que devuelve GitHub al crear la app. */
  readonly clavePrivada: string;
  readonly instalacionId: number | null;
  /** `dueño/repo` de la tienda. */
  readonly repositorio: string | null;
};

/** Conexión con la app instalada en un repo: la que hace falta para hablar con GitHub. */
export type ConexionLista = ConexionGithub & { readonly instalacionId: number; readonly repositorio: string };

export const estaLista = (c: ConexionGithub): c is ConexionLista =>
  c.instalacionId !== null && c.repositorio !== null;

export type EstadoDeActualizacion =
  | { readonly estado: "sin-conectar" }
  | { readonly estado: "sin-instalar"; readonly slug: string }
  | { readonly estado: "al-dia"; readonly actual: string }
  | { readonly estado: "hay-nueva"; readonly actual: string; readonly nueva: string };

const partes = (v: string) =>
  v
    .replace(/^v/, "")
    .split(/[.-]/)
    .slice(0, 3)
    .map((p) => Number.parseInt(p, 10) || 0);

/** `candidata` es posterior a `actual` comparando mayor, menor y parche (lo que siga a un guion se ignora). */
export function esMasNueva(candidata: string, actual: string): boolean {
  const a = partes(candidata);
  const b = partes(actual);
  for (let i = 0; i < 3; i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
  }
  return false;
}
