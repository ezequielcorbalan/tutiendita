import { type ErrorDeDominio, errorDeDominio } from "./errores";
import { err, ok, type Result } from "./result";

/** Monto entero en la unidad mínima de la moneda (centavos). Nunca float. */
export type Dinero = {
  readonly monto: number;
  readonly moneda: string;
};

const MONEDA_ISO = /^[A-Z]{3}$/;

export function dinero(monto: number, moneda: string): Result<Dinero, ErrorDeDominio> {
  if (!Number.isInteger(monto) || monto < 0) {
    return err(
      errorDeDominio("PRECIO_INVALIDO", "El monto debe ser un entero mayor o igual a cero", { monto }),
    );
  }
  if (!MONEDA_ISO.test(moneda)) {
    return err(
      errorDeDominio("PRECIO_INVALIDO", "La moneda debe ser un código ISO 4217 de tres letras", { moneda }),
    );
  }
  return ok({ monto, moneda });
}

export function sumar(a: Dinero, b: Dinero): Dinero {
  if (a.moneda !== b.moneda) {
    throw new Error(`No se pueden sumar monedas distintas: ${a.moneda} y ${b.moneda}`);
  }
  return { monto: a.monto + b.monto, moneda: a.moneda };
}

export function multiplicar(d: Dinero, cantidad: number): Dinero {
  if (!Number.isInteger(cantidad)) {
    throw new Error(`La cantidad debe ser entera: ${cantidad}`);
  }
  return { monto: d.monto * cantidad, moneda: d.moneda };
}

export const esPositivo = (d: Dinero): boolean => d.monto > 0;

/**
 * Decimales de la unidad mínima según ISO 4217 (no CLDR/Intl, que difiere en algunas, ej. IQD).
 * Tabla mínima: monedas de la región más casos con 0 y 3 decimales. El resto usa 2.
 */
const DECIMALES_ISO_4217: Readonly<Record<string, number>> = {
  ARS: 2,
  USD: 2,
  EUR: 2,
  BRL: 2,
  CLP: 0,
  UYU: 2,
  PYG: 0,
  BOB: 2,
  PEN: 2,
  COP: 2,
  MXN: 2,
  JPY: 0,
  KWD: 3,
  BHD: 3,
  IQD: 3,
};

export const decimalesDeMoneda = (moneda: string): number => DECIMALES_ISO_4217[moneda] ?? 2;
