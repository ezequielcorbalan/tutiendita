import type { Producto } from "../dominio/producto";
import type { RepositorioProductos } from "../puertos/repositorio-productos";

export const listarProductosPublicados = (deps: { repo: RepositorioProductos }) => (): Promise<Producto[]> =>
  deps.repo.listarPublicados();
