/** Core no toca `crypto` global: la entropía y los hashes llegan por este puerto. */
export interface Criptografia {
  bytesAleatorios(n: number): Uint8Array;
  /** SHA-256 del texto en UTF-8, en hex minúscula. */
  sha256Hex(texto: string): Promise<string>;
  igualesEnTiempoConstante(a: string, b: string): boolean;
}

/**
 * SHA-256 (hex) del código de reclamo del último build, o `null` si el build no lo embebió. Lo provee la
 * app desde el módulo virtual `virtual:tiendita/reclamo`.
 */
export type HashDelCodigoDeReclamo = () => string | null;
