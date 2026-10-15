/** Acceso del único dueño de la tienda: passkeys, sesiones y orígenes permitidos. */

/** Lo que devuelve la ceremonia de registro verificada (independiente de la librería de WebAuthn). */
export type CredencialVerificada = {
  readonly id: string;
  readonly clavePublica: Uint8Array;
  readonly contador: number;
  readonly transportes: readonly string[];
  readonly tipoDispositivo: string;
  readonly respaldada: boolean;
};

export type Credencial = CredencialVerificada & {
  /** `rpId` con el que se registró: el host del origen. */
  readonly rpId: string;
  readonly origen: string;
  readonly nombre: string;
  readonly creadaEn: Date;
  readonly ultimoUsoEn: Date | null;
};

export type TipoSesion = "completa" | "reclamo" | "recuperacion";

/** El id de la sesión viaja solo en la cookie; acá se guarda su SHA-256. */
export type Sesion = {
  readonly idHash: string;
  readonly tipo: TipoSesion;
  readonly creadaEn: Date;
  readonly expiraEn: Date;
  readonly ultimoUsoEn: Date;
};

const MINUTO = 60_000;
const DIA = 24 * 60 * MINUTO;

export const DURACION_SESION: Readonly<Record<TipoSesion, number>> = {
  completa: 30 * DIA,
  reclamo: 15 * MINUTO,
  recuperacion: 15 * MINUTO,
};

/** Una sesión completa se renueva (y se reescribe en D1) como mucho una vez por día de uso. */
export const INTERVALO_DE_RENOVACION = DIA;

export const DURACION_DESAFIO = 5 * MINUTO;

export const nuevaSesion = (idHash: string, tipo: TipoSesion, ahora: Date): Sesion => ({
  idHash,
  tipo,
  creadaEn: ahora,
  expiraEn: new Date(ahora.getTime() + DURACION_SESION[tipo]),
  ultimoUsoEn: ahora,
});

export const sesionVigente = (s: Sesion, ahora: Date): boolean => ahora.getTime() < s.expiraEn.getTime();

export const debeRenovar = (s: Sesion, ahora: Date): boolean =>
  s.tipo === "completa" && ahora.getTime() - s.ultimoUsoEn.getTime() >= INTERVALO_DE_RENOVACION;

/** Origen desde el que se aceptan ceremonias, con el `rpId` que le corresponde. */
export type OrigenPermitido = {
  readonly origen: string;
  readonly rpId: string;
  readonly principal: boolean;
};

export type PasoPrimerIngreso = "acceso" | "nombre" | "whatsapp" | "transferencia" | "producto";

/** La fila singleton de `acceso`: existe si y solo si la tienda tiene dueño. */
export type EstadoDelAcceso = {
  readonly webauthnUserId: string;
  readonly reclamadaEn: Date;
  readonly pasoPrimerIngreso: PasoPrimerIngreso;
  readonly primerIngresoCompletadoEn: Date | null;
};

const ORIGEN = /^https?:\/\/(\[[0-9a-f:.]+\]|[a-z0-9.-]+)(:\d+)?$/i;

/** `https://tiendita.ana.workers.dev` → `tiendita.ana.workers.dev`; null si no es un origen http(s). */
export function hostDeOrigen(origen: string): string | null {
  const m = ORIGEN.exec(origen);
  return m?.[1] ? m[1].toLowerCase() : null;
}
