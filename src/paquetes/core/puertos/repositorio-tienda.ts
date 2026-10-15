import type { Tienda } from "../dominio/tienda";

/** La tienda del despliegue (hay una sola). La escribe el primer ingreso. */
export interface RepositorioTienda {
  /** La tienda configurada, o `null` si todavía no se eligió el nombre en el primer ingreso. */
  obtener(): Promise<Tienda | null>;
  /** Inserta o actualiza por id; `ahora` es la fecha de actualización (y de creación, si es nueva). */
  guardar(t: Tienda, ahora: Date): Promise<void>;
}
