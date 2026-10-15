/**
 * Códigos para humanos (reclamo y recuperación): 120 bits en 24 caracteres Crockford base32, que se
 * muestran en seis grupos de cuatro. La entropía la pone quien llama (puerto `Criptografia`).
 */
export const ALFABETO_CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const BYTES_DE_CODIGO = 15;
export const LARGO_DE_CODIGO = 24;

const BIEN_FORMADO = /^[0-9A-HJKMNP-TV-Z]{24}$/;

export function codigoDesdeBytes(bytes: Uint8Array): string {
  if (bytes.length !== BYTES_DE_CODIGO) {
    throw new Error(`Un código necesita ${BYTES_DE_CODIGO} bytes, llegaron ${bytes.length}`);
  }
  let salida = "";
  let acumulado = 0;
  let bits = 0;
  for (const byte of bytes) {
    acumulado = (acumulado << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      salida += ALFABETO_CROCKFORD[(acumulado >> bits) & 31];
    }
    acumulado &= (1 << bits) - 1;
  }
  return salida;
}

/** Como lo tipea la gente → forma canónica: sin separadores, mayúsculas, O→0 e I/L→1. */
export const normalizarCodigo = (texto: string): string =>
  texto
    .replace(/[\s-]+/g, "")
    .toUpperCase()
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1");

export const esCodigoBienFormado = (normalizado: string): boolean => BIEN_FORMADO.test(normalizado);

export const formatearCodigo = (codigo: string): string => codigo.match(/.{1,4}/g)?.join("-") ?? "";

const ALFABETO_BASE64URL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

/** base64url sin relleno (RFC 4648 §5): ids de sesión, desafíos y `webauthn_user_id`. */
export function aBase64Url(bytes: Uint8Array): string {
  let salida = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] ?? 0;
    const b = bytes[i + 1] ?? 0;
    const c = bytes[i + 2] ?? 0;
    const n = (a << 16) | (b << 8) | c;
    const quedan = bytes.length - i;
    salida += ALFABETO_BASE64URL[(n >> 18) & 63];
    salida += ALFABETO_BASE64URL[(n >> 12) & 63];
    if (quedan > 1) salida += ALFABETO_BASE64URL[(n >> 6) & 63];
    if (quedan > 2) salida += ALFABETO_BASE64URL[n & 63];
  }
  return salida;
}
