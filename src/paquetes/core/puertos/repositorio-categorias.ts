import type { Categoria } from "../dominio/categoria";

export interface RepositorioCategorias {
  listar(): Promise<Categoria[]>;
  buscarPorId(id: string): Promise<Categoria | null>;
  guardar(c: Categoria): Promise<void>;
  /** Borra la categoría solo si ningún producto la usa; devuelve si la borró. */
  borrarSiNoTieneProductos(id: string): Promise<boolean>;
}
