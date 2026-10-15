import type { Categoria } from "../dominio/categoria";

export interface RepositorioCategorias {
  listar(): Promise<Categoria[]>;
  buscarPorId(id: string): Promise<Categoria | null>;
  guardar(c: Categoria): Promise<void>;
}
