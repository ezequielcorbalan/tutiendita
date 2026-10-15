import type { Credencial } from "../dominio/acceso";

export interface RepositorioCredenciales {
  listar(): Promise<Credencial[]>;
  buscarPorId(id: string): Promise<Credencial | null>;
  /** Inserta; `false` si ya hay una credencial con ese id (nunca la pisa). */
  guardar(c: Credencial): Promise<boolean>;
  actualizarUso(id: string, contador: number, ahora: Date): Promise<void>;
  /** Borra en una sola sentencia y solo si queda otra (dos borrados en carrera no dejan cero). */
  borrarSiNoEsLaUltima(id: string): Promise<boolean>;
  contar(): Promise<number>;
}
