import type { Producto } from "../dominio/producto";

export interface RepositorioProductos {
  listarPublicados(): Promise<Producto[]>;
  /** Publicados, borradores y pausados, en el mismo orden que `listarPublicados`. */
  listarTodos(): Promise<Producto[]>;
  buscarPorSlug(slug: string): Promise<Producto | null>;
  buscarPorId(id: string): Promise<Producto | null>;
  existeSlug(slug: string): Promise<boolean>;
  /** Inserta o reemplaza por id, incluidas sus imágenes. */
  guardar(p: Producto): Promise<void>;
}

/** La lanza `guardar` si otro producto ya ocupa ese slug (p. ej. dos altas concurrentes con el mismo nombre). */
export class SlugDuplicadoError extends Error {
  constructor(readonly slug: string) {
    super(`Ya existe un producto con el slug "${slug}"`);
    this.name = "SlugDuplicadoError";
  }
}
