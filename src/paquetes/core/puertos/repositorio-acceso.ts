import type {
  Credencial,
  EstadoDelAcceso,
  OrigenPermitido,
  PasoPrimerIngreso,
  Sesion,
} from "../dominio/acceso";

export type DatosDelReclamo = {
  readonly webauthnUserId: string;
  readonly ahora: Date;
  readonly origen: OrigenPermitido;
  readonly credencial: Credencial;
  readonly codigoRecuperacionHash: string;
};

export type DatosDeLaRecuperacion = {
  readonly sesionIdHash: string;
  readonly credencial: Credencial;
  /** Hash del código nuevo, que reemplaza al usado. */
  readonly codigoRecuperacionHash: string;
  readonly ahora: Date;
};

/** La fila singleton de `acceso` y los orígenes permitidos. */
export interface RepositorioAcceso {
  obtener(): Promise<EstadoDelAcceso | null>;
  /**
   * Atómico: inserta la fila de `acceso` solo si no existe y, en la misma transacción, reemplaza
   * credenciales, orígenes y sesiones que hubieran quedado (plan de emergencia) por los del reclamo.
   * `false` si otro reclamo ganó.
   */
  reclamar(d: DatosDelReclamo): Promise<boolean>;
  /**
   * Atómico: si `hash` es el del código de recuperación vigente, borra todas las sesiones y crea `sesion`.
   * No gasta el código (se gasta en `completarRecuperacion`). `false` si no coincide.
   */
  iniciarRecuperacion(hash: string, sesion: Sesion): Promise<boolean>;
  /**
   * Atómico: solo si `sesionIdHash` sigue siendo una sesión de recuperación vigente, guarda la credencial,
   * reemplaza el código por el nuevo y borra todas las sesiones de recuperación. `false` si otra sesión ya
   * usó el código (un solo uso efectivo: un código, una passkey).
   */
  completarRecuperacion(d: DatosDeLaRecuperacion): Promise<boolean>;
  reemplazarCodigoDeRecuperacion(hash: string, ahora: Date): Promise<void>;
  guardarPrimerIngreso(paso: PasoPrimerIngreso, completadoEn: Date | null): Promise<void>;
  /** Vacío si no hay fila de `acceso` (sin dueño, aunque hayan quedado filas del plan de emergencia). */
  origenesPermitidos(): Promise<OrigenPermitido[]>;
}
