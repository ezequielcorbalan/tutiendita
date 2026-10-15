// Integración de Astro: código de reclamo de la tienda.
//
// En cada `astro build` genera un código aleatorio de 120 bits (24 caracteres Crockford base32), lo imprime
// en un recuadro al final de la salida del build (en Workers Builds, el registro de compilación que solo ve
// quien tiene la cuenta de Cloudflare) y embebe SOLO su SHA-256 en el módulo virtual
// `virtual:tiendita/reclamo`, que importa el código del Worker. Si un script del cliente lo importara, el
// build falla. Con la variable de build CODIGO_DE_RECLAMO se usa ese código en vez de generar uno (tests,
// CI o quien prefiera fijarlo); no se declara en .dev.vars.example: el botón no la pide. El código público de
// los tests solo se acepta con TIENDITA_BUILD_DE_TEST=1 (scripts/build-de-test.mjs): un build publicable con
// ese código dejaría la tienda reclamable por cualquiera.
import { createHash } from "node:crypto";

export const ALFABETO = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const MODULO_VIRTUAL = "virtual:tiendita/reclamo";
const ID_RESUELTO = `\0${MODULO_VIRTUAL}`;
const BIEN_FORMADO = /^[0-9A-HJKMNP-TV-Z]{24}$/;
/** Código fijo de los tests (público: está en el repo). Vive acá para que la integración pueda rechazarlo. */
export const CODIGO_DE_RECLAMO_DE_PRUEBA = "TEST-T1EN-D1TA-0000-0000-0001";

/** 15 bytes → 24 caracteres Crockford (la misma codificación que `codigoDesdeBytes` de core). */
export function codificar(bytes) {
  let salida = "";
  let acumulado = 0;
  let bits = 0;
  for (const byte of bytes) {
    acumulado = (acumulado << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      salida += ALFABETO[(acumulado >> bits) & 31];
    }
    acumulado &= (1 << bits) - 1;
  }
  return salida;
}

/** Igual que `normalizarCodigo` de core: sin separadores, mayúsculas, O→0 e I/L→1. */
export const normalizar = (texto) =>
  texto
    .replace(/[\s-]+/g, "")
    .toUpperCase()
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1");

export const formatear = (codigo) => codigo.match(/.{1,4}/g).join("-");

export const generarCodigo = () => codificar(crypto.getRandomValues(new Uint8Array(15)));

export function codigoDelEntorno(entorno = process.env) {
  const fijado = entorno.CODIGO_DE_RECLAMO;
  if (fijado === undefined || fijado === "") return generarCodigo();
  const codigo = normalizar(fijado);
  if (!BIEN_FORMADO.test(codigo)) {
    throw new Error(
      "CODIGO_DE_RECLAMO tiene que tener 24 caracteres Crockford base32 (por ejemplo 7KQ2-M9XD-4RTA-ABCD-EFGH-0112).",
    );
  }
  if (codigo === normalizar(CODIGO_DE_RECLAMO_DE_PRUEBA) && entorno.TIENDITA_BUILD_DE_TEST !== "1") {
    throw new Error(
      "CODIGO_DE_RECLAMO es el código de prueba de los tests (público): solo sirve para el build de test.",
    );
  }
  return codigo;
}

export const hashDe = (codigo) => createHash("sha256").update(normalizar(codigo)).digest("hex");

/** Recuadro bien visible, con una línea en ASCII fácil de buscar en el registro ("CODIGO DE RECLAMO:"). */
export function recuadro(codigo) {
  const lineas = [
    "",
    "TU TIENDITA: CÓDIGO PARA RECLAMARLA",
    "",
    `CODIGO DE RECLAMO: ${formatear(codigo)}`,
    "",
    'Abrí tu tienda, tocá "Reclamar mi tienda" y pegá este código.',
    "Vale el del último deploy y deja de servir cuando la reclamás.",
    "",
  ];
  const ancho = Math.max(...lineas.map((l) => l.length)) + 4;
  const borde = `+${"=".repeat(ancho)}+`;
  return ["", borde, ...lineas.map((l) => `|  ${l.padEnd(ancho - 2)}|`), borde, ""].join("\n");
}

export function pluginCodigoDeReclamo({ codigo }) {
  return {
    name: "tiendita:codigo-de-reclamo",
    resolveId(id) {
      return id === MODULO_VIRTUAL ? ID_RESUELTO : undefined;
    },
    load(id) {
      if (id !== ID_RESUELTO) return undefined;
      if (this.environment?.name === "client") {
        this.error(
          `${MODULO_VIRTUAL} solo puede importarse desde el servidor, nunca desde un script del cliente.`,
        );
      }
      return `export const hashDelCodigoDeReclamo = ${JSON.stringify(hashDe(codigo))};\n`;
    },
  };
}

export default function codigoDeReclamo({ entorno = process.env } = {}) {
  let codigo = null;
  const imprimir = () => console.log(recuadro(codigo));
  return {
    name: "tiendita:codigo-de-reclamo",
    hooks: {
      "astro:config:setup": ({ updateConfig }) => {
        codigo = codigoDelEntorno(entorno);
        updateConfig({ vite: { plugins: [pluginCodigoDeReclamo({ codigo })] } });
      },
      // En `astro dev` el código sale en la terminal; en el build, al final de la salida para que quede visible.
      "astro:server:start": imprimir,
      "astro:build:done": imprimir,
    },
  };
}
