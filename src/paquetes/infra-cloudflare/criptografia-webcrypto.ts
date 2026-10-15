import type { Criptografia } from "../core/index";

const hex = (bytes: ArrayBuffer): string =>
  [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");

/** El puerto `Criptografia` con WebCrypto (disponible en Workers sin dependencias). */
export const criptografiaWebCrypto: Criptografia = {
  bytesAleatorios: (n) => crypto.getRandomValues(new Uint8Array(n)),

  sha256Hex: async (texto) => hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto))),

  /** Recorre siempre todo el texto: el tiempo no depende de dónde difieren (los hashes tienen largo fijo). */
  igualesEnTiempoConstante: (a, b) => {
    let diferencia = a.length ^ b.length;
    for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
      diferencia |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
    }
    return diferencia === 0;
  },
};
