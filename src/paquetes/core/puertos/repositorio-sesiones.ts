import type { Sesion } from "../dominio/acceso";

export interface RepositorioSesiones {
  crear(s: Sesion): Promise<void>;
  buscar(idHash: string): Promise<Sesion | null>;
  renovar(idHash: string, expiraEn: Date, ultimoUsoEn: Date): Promise<void>;
  borrar(idHash: string): Promise<void>;
  /** Borra todas las sesiones salvo `idHash` (o todas, con `null`). */
  borrarTodasMenos(idHash: string | null): Promise<void>;
  borrarVencidas(ahora: Date): Promise<void>;
}
