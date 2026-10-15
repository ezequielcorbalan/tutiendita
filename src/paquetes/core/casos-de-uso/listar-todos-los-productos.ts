import type { Producto } from "../dominio/producto";
import type { RepositorioProductos } from "../puertos/repositorio-productos";

/** Para el panel del dueño: todos los productos, también borradores y pausados. */
export const listarTodosLosProductos = (deps: { repo: RepositorioProductos }) => (): Promise<Producto[]> =>
  deps.repo.listarTodos();
