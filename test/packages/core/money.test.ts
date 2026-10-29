import { describe, expect, it } from "vitest";
import { add, currencyDecimals, isPositive, money, multiply } from "../../../src/packages/core/domain/money";
import { isErr, isOk } from "../../../src/packages/core/domain/result";

const ars = (amount: number) => {
  const r = money(amount, "ARS");
  if (!isOk(r)) throw new Error("invalid fixture");
  return r.value;
};

describe("Money", () => {
  it("accepts a non-negative integer with an ISO currency", () => {
    const r = money(1500, "ARS");
    expect(isOk(r)).toBe(true);
    if (isOk(r)) expect(r.value).toEqual({ amount: 1500, currency: "ARS" });
  });

  it("rejects decimals", () => {
    const r = money(12.5, "ARS");
    expect(isErr(r)).toBe(true);
    if (isErr(r)) expect(r.error.code).toBe("INVALID_PRICE");
  });

  it("rejects negatives", () => {
    expect(isErr(money(-1, "ARS"))).toBe(true);
  });

  it("rejects a currency that is not three uppercase letters", () => {
    expect(isErr(money(1, "ars"))).toBe(true);
    expect(isErr(money(1, "ARSS"))).toBe(true);
  });

  it("adds amounts of the same currency", () => {
    expect(add(ars(100), ars(250))).toEqual({ amount: 350, currency: "ARS" });
  });

  it("throws when adding different currencies (programming bug)", () => {
    const usd = money(1, "USD");
    if (!isOk(usd)) throw new Error("fixture");
    expect(() => add(ars(1), usd.value)).toThrow();
  });

  it("multiplies by an integer quantity", () => {
    expect(multiply(ars(4500), 3)).toEqual({ amount: 13500, currency: "ARS" });
  });

  it("isPositive is false for zero", () => {
    expect(isPositive(ars(0))).toBe(false);
    expect(isPositive(ars(1))).toBe(true);
  });
});

describe("currencyDecimals (minor unit per ISO 4217)", () => {
  it.each([
    ["ARS", 2],
    ["USD", 2],
    ["EUR", 2],
    ["BRL", 2],
    ["CLP", 0],
    ["UYU", 2],
    ["PYG", 0],
    ["BOB", 2],
    ["PEN", 2],
    ["COP", 2],
    ["MXN", 2],
    ["JPY", 0],
    ["KWD", 3],
    ["BHD", 3],
    ["IQD", 3],
  ])("%s → %i", (currency, expected) => {
    expect(currencyDecimals(currency)).toBe(expected);
  });

  it("a currency not in the table uses 2 decimals", () => {
    expect(currencyDecimals("XYZ")).toBe(2);
  });
});
