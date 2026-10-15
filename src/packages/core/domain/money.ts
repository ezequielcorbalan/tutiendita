import { type DomainError, domainError } from "./errors";
import { err, ok, type Result } from "./result";

/** Integer amount in the currency's minor unit (cents). Never a float. */
export type Money = {
  readonly amount: number;
  readonly currency: string;
};

const ISO_CURRENCY = /^[A-Z]{3}$/;

export function money(amount: number, currency: string): Result<Money, DomainError> {
  if (!Number.isInteger(amount) || amount < 0) {
    return err(
      domainError("INVALID_PRICE", "The amount must be an integer greater than or equal to zero", { amount }),
    );
  }
  if (!ISO_CURRENCY.test(currency)) {
    return err(
      domainError("INVALID_PRICE", "The currency must be a three-letter ISO 4217 code", { currency }),
    );
  }
  return ok({ amount, currency });
}

export function add(a: Money, b: Money): Money {
  if (a.currency !== b.currency) {
    throw new Error(`Cannot add different currencies: ${a.currency} and ${b.currency}`);
  }
  return { amount: a.amount + b.amount, currency: a.currency };
}

export function multiply(d: Money, quantity: number): Money {
  if (!Number.isInteger(quantity)) {
    throw new Error(`The quantity must be an integer: ${quantity}`);
  }
  return { amount: d.amount * quantity, currency: d.currency };
}

export const isPositive = (d: Money): boolean => d.amount > 0;

/**
 * Minor-unit decimals per ISO 4217 (not CLDR/Intl, which differs for some, e.g. IQD).
 * Minimal table: the region's currencies plus cases with 0 and 3 decimals. The rest use 2.
 */
const ISO_4217_DECIMALS: Readonly<Record<string, number>> = {
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

export const currencyDecimals = (currency: string): number => ISO_4217_DECIMALS[currency] ?? 2;
