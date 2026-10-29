import { describe, expect, it } from "vitest";
import { passwordProblem } from "../../../src/packages/core/domain/password";

describe("owner password rules", () => {
  it("accepts 12+ characters with 3 kinds, and no common words", () => {
    expect(passwordProblem("Tigre-Manzana-2026!")).toBeNull();
    expect(passwordProblem("Tigre-Manzana-2026")).toBeNull();
  });

  it("refuses short or very long passwords", () => {
    expect(passwordProblem("Ab1!cd")).toBe("TOO_SHORT");
    expect(passwordProblem(`Aa1!${"x".repeat(200)}`)).toBe("TOO_SHORT");
  });

  it("refuses passwords with fewer than 3 kinds of character", () => {
    expect(passwordProblem("abcdefghijklmnop")).toBe("TOO_WEAK");
    expect(passwordProblem("ABCDXYZWPQRS12")).toBe("TOO_WEAK");
  });

  it("refuses common words even when the rest looks strong", () => {
    expect(passwordProblem("MyPassword2026")).toBe("TOO_WEAK");
    expect(passwordProblem("Mi-TIENDITA-2026")).toBe("TOO_WEAK");
  });
});
