/**
 * Intentos por clave (`reclamo:<ip>`, `recuperacion:<ip>`, `ingreso:<ip>`) en ventanas fijas de 15 minutos.
 * shortcut: chequear y sumar son dos sentencias (en ráfaga pasan unos intentos de más) y la clave es la IP
 * (muchas IPs suman cupo; detrás de un CGNAT se comparte), pasar a un Durable Object o al binding de Rate
 * Limiting de Workers si aparece abuso real.
 */
export interface LimitadorDeIntentos {
  registrarFallo(clave: string, ahora: Date): Promise<void>;
  /** `maximo` por ventana; por defecto MAXIMO_DE_INTENTOS. */
  estaBloqueado(clave: string, ahora: Date, maximo?: number): Promise<boolean>;
}

export const MAXIMO_DE_INTENTOS = 10;
export const VENTANA_DE_INTENTOS = 15 * 60_000;

/** Inicio de la ventana que contiene `ahora` (las ventanas arrancan en múltiplos de 15 minutos). */
export const ventanaDe = (ahora: Date): Date =>
  new Date(Math.floor(ahora.getTime() / VENTANA_DE_INTENTOS) * VENTANA_DE_INTENTOS);

export const segundosHastaLaProximaVentana = (ahora: Date): number =>
  Math.ceil((ventanaDe(ahora).getTime() + VENTANA_DE_INTENTOS - ahora.getTime()) / 1000);
