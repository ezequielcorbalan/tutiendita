import type { GeneradorIds } from "../core/index";

/** Alfabeto Crockford base32 (sin I, L, O, U). */
const ALFABETO = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const LARGO_TIEMPO = 10;
const LARGO_AZAR = 16;

let ultimoTiempo = -1;
let ultimoAzar: number[] = [];

const codificarTiempo = (ms: number): string => {
  let resto = ms;
  let salida = "";
  for (let i = 0; i < LARGO_TIEMPO; i++) {
    salida = ALFABETO.charAt(resto % 32) + salida;
    resto = Math.floor(resto / 32);
  }
  return salida;
};

/** 16 dígitos base32 = 80 bits de azar. */
const azarNuevo = (): number[] => {
  const bytes = new Uint8Array(LARGO_AZAR);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b % 32);
};

/** Suma 1 a los dígitos base32; desborda solo si los 80 bits están en 1 (prácticamente imposible). */
const incrementar = (digitos: number[]): number[] => {
  const siguiente = [...digitos];
  for (let i = siguiente.length - 1; i >= 0; i--) {
    const d = siguiente[i] ?? 0;
    if (d < 31) {
      siguiente[i] = d + 1;
      return siguiente;
    }
    siguiente[i] = 0;
  }
  throw new Error("ULID: se agotó el azar dentro del mismo milisegundo");
};

/**
 * ULID monotónico: dentro del mismo milisegundo (o si el reloj retrocede) incrementa el azar anterior,
 * así dos ids seguidos siempre ordenan de forma creciente.
 */
export const generadorUlid: GeneradorIds = {
  nuevoId(): string {
    const ahora = Date.now();
    if (ahora > ultimoTiempo) {
      ultimoTiempo = ahora;
      ultimoAzar = azarNuevo();
    } else {
      ultimoAzar = incrementar(ultimoAzar);
    }
    return codificarTiempo(ultimoTiempo) + ultimoAzar.map((d) => ALFABETO.charAt(d)).join("");
  },
};
