import { type ErrorDeDominio, errorDeDominio } from "./errores";
import { err, ok, type Result } from "./result";

/**
 * Un medio de pago le dice al comprador cómo pagarle al vendedor. No mueve dinero.
 * Por ahora se guarda la configuración de WhatsApp y Transferencia; el checkout llega en otro sub-proyecto.
 */
export type MedioDePago = {
  readonly tipo: string;
  readonly nombre: string;
};

export type ConfiguracionWhatsapp = {
  /** E.164: `+5491122334455`. */
  readonly numero: string;
  readonly plantilla: string;
};

export type ConfiguracionTransferencia = {
  readonly tipoDeCuenta: "alias" | "cbu";
  readonly cuenta: string;
  readonly titular: string;
};

export type MedioDePagoConfigurado =
  | {
      readonly tipo: "whatsapp";
      readonly activo: boolean;
      readonly configuracion: ConfiguracionWhatsapp;
      readonly actualizadoEn: Date;
    }
  | {
      readonly tipo: "transferencia";
      readonly activo: boolean;
      readonly configuracion: ConfiguracionTransferencia;
      readonly actualizadoEn: Date;
    };

export type TipoMedioDePago = MedioDePagoConfigurado["tipo"];

/** Mensaje con el que se abre WhatsApp al pedir; editable más adelante desde el panel. */
export const PLANTILLA_WHATSAPP = "¡Hola! Quiero hacer este pedido:";

const E164 = /^[1-9]\d{7,14}$/;
const LARGO_NACIONAL_AR = 10;

/** Sin el 0 de larga distancia y sin el 15 de celular que la gente pone después del código de área. */
function nacionalArgentino(digitos: string): string {
  const n = digitos.startsWith("0") ? digitos.slice(1) : digitos;
  if (n.length !== LARGO_NACIONAL_AR + 2) return n;
  // Códigos de área de 2, 3 o 4 dígitos: el 15 va justo después.
  for (const k of [2, 3, 4]) {
    if (n.slice(k, k + 2) === "15") return n.slice(0, k) + n.slice(k + 2);
  }
  return n;
}

/**
 * Acepta el número como lo escribe la gente (espacios, guiones, paréntesis, 0, 15, con o sin +54 9) y lo
 * devuelve en E.164. Sin prefijo internacional asume Argentina; para WhatsApp, los celulares argentinos
 * llevan el 9 después del 54.
 */
export function validarWhatsapp(numero: string): Result<string, ErrorDeDominio> {
  const invalido = err(
    errorDeDominio(
      "WHATSAPP_INVALIDO",
      "Revisá el número: código de área y número, por ejemplo 11 2233-4455",
    ),
  );
  const limpio = numero.trim();
  let digitos = limpio.replace(/\D/g, "");
  let internacional = limpio.startsWith("+");
  if (!internacional && digitos.startsWith("00")) {
    digitos = digitos.slice(2);
    internacional = true;
  }
  if (!internacional && digitos.startsWith("54") && digitos.length >= LARGO_NACIONAL_AR + 2)
    internacional = true;

  if (internacional && !digitos.startsWith("54")) return E164.test(digitos) ? ok(`+${digitos}`) : invalido;

  let nacional = internacional ? digitos.slice(2) : digitos;
  if (internacional && nacional.startsWith("9")) nacional = nacional.slice(1);
  nacional = nacionalArgentino(nacional);
  // Un número que arranca con 15 sin código de área no se puede completar.
  if (!/^\d{10}$/.test(nacional) || nacional.startsWith("15") || nacional.startsWith("0")) return invalido;
  return ok(`+549${nacional}`);
}

const PESOS_BLOQUE_1 = [7, 1, 3, 9, 7, 1, 3];
const PESOS_BLOQUE_2 = [3, 9, 7, 1, 3, 9, 7, 1, 3, 9, 7, 1, 3];

function verificadorValido(bloque: string, pesos: readonly number[]): boolean {
  const suma = pesos.reduce((acc, peso, i) => acc + peso * Number(bloque[i]), 0);
  return (10 - (suma % 10)) % 10 === Number(bloque[pesos.length]);
}

/** CBU o CVU: 22 dígitos en dos bloques (8 y 14), cada uno con su dígito verificador. */
export const esCbuValido = (cbu: string): boolean =>
  /^\d{22}$/.test(cbu) &&
  verificadorValido(cbu.slice(0, 8), PESOS_BLOQUE_1) &&
  verificadorValido(cbu.slice(8), PESOS_BLOQUE_2);

const ALIAS = /^[A-Za-z0-9.-]{6,20}$/;
export const LARGO_MAXIMO_TITULAR = 80;

/** Alias (6 a 20: letras, números, punto y guion) o CBU/CVU; cuál de los dos se detecta solo. */
export function validarTransferencia(e: {
  cuenta: string;
  titular: string;
}): Result<ConfiguracionTransferencia, ErrorDeDominio> {
  const invalida = (campo: string, mensaje: string) =>
    err(errorDeDominio("TRANSFERENCIA_INVALIDA", mensaje, { campo }));
  const titular = e.titular.trim();
  const cuenta = e.cuenta.trim();
  const soloDigitos = cuenta.replace(/[\s-]/g, "");
  let configuracion: ConfiguracionTransferencia;
  if (/^\d+$/.test(soloDigitos)) {
    if (!esCbuValido(soloDigitos)) {
      return invalida("cuenta", "El CBU o CVU tiene que tener 22 números y ser válido. Revisalo.");
    }
    configuracion = { tipoDeCuenta: "cbu", cuenta: soloDigitos, titular };
  } else if (ALIAS.test(cuenta)) {
    configuracion = { tipoDeCuenta: "alias", cuenta, titular };
  } else {
    return invalida("cuenta", "El alias va de 6 a 20 caracteres: letras, números, punto y guion.");
  }
  if (titular === "" || titular.length > LARGO_MAXIMO_TITULAR) {
    return invalida("titular", "Escribí el nombre del titular de la cuenta.");
  }
  return ok(configuracion);
}
