import { describe, expect, it } from "vitest";
import { isValidCbu, validateTransfer, validateWhatsapp } from "../../../src/packages/core/domain/payment-method";

describe("validateWhatsapp: accepts the number as people write it and converts it to E.164", () => {
  it.each([
    ["11 2233-4455", "+5491122334455"],
    ["(011) 15 2233-4455", "+5491122334455"],
    ["11 15 2233 4455", "+5491122334455"],
    ["+54 9 11 2233-4455", "+5491122334455"],
    ["+54 11 2233-4455", "+5491122334455"],
    ["5491122334455", "+5491122334455"],
    ["0054 9 11 2233 4455", "+5491122334455"],
    ["351 15 123-4567", "+5493511234567"],
    ["0351 4123456", "+5493514123456"],
    ["2214 15 123456", "+5492214123456"],
    ["+1 415 555 2671", "+14155552671"],
    ["+598 94 123 456", "+59894123456"],
  ])("%s → %s", (input, expected) => {
    expect(validateWhatsapp(input)).toEqual({ ok: true, value: expected });
  });

  it.each(["", "hello", "123", "15 2233-4455", "11 2233-445", "+0 123456789", "+12345678901234567"])(
    "%j → INVALID_WHATSAPP",
    (input) => {
      const r = validateWhatsapp(input);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("INVALID_WHATSAPP");
    },
  );
});

describe("CBU and CVU", () => {
  it.each(["2850590940090418135201", "0000003100010000000009"])("%s has valid check digits", (cbu) => {
    expect(isValidCbu(cbu)).toBe(true);
  });

  it.each([
    ["wrong first check digit", "2850590840090418135201"],
    ["wrong second check digit", "2850590940090418135202"],
    ["wrong length", "285059094009041813520"],
    ["with letters", "28505909400904181352O1"],
  ])("%s → invalid", (_case, cbu) => {
    expect(isValidCbu(cbu)).toBe(false);
  });
});

describe("validateTransfer", () => {
  it("detects a CBU (even with spaces) and saves it without separators", () => {
    expect(validateTransfer({ account: "2850590 9400904 18135201", holder: " Ana Pérez " })).toEqual({
      ok: true,
      value: { accountType: "cbu", account: "2850590940090418135201", holder: "Ana Pérez" },
    });
  });

  it("detects an alias", () => {
    expect(validateTransfer({ account: " mate.dulce.leche ", holder: "Ana" })).toEqual({
      ok: true,
      value: { accountType: "alias", account: "mate.dulce.leche", holder: "Ana" },
    });
  });

  it.each([
    ["short alias", "abc", "Ana", "account"],
    ["long alias", "a".repeat(21), "Ana", "account"],
    ["alias with spaces in the middle", "mate dulce", "Ana", "account"],
    ["alias with odd characters", "mate_dulce!", "Ana", "account"],
    ["CBU with wrong check digit", "2850590940090418135202", "Ana", "account"],
    ["number that is not a CBU", "12345678", "Ana", "account"],
    ["empty holder", "mate.dulce", "  ", "holder"],
    ["very long holder", "mate.dulce", "x".repeat(81), "holder"],
  ])("%s → INVALID_TRANSFER on %s", (_case, account, holder, field) => {
    const r = validateTransfer({ account, holder });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("INVALID_TRANSFER");
      expect(r.error.details).toMatchObject({ field });
    }
  });
});
