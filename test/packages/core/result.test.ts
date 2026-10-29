import { describe, expect, it } from "vitest";
import { err, isErr, isOk, ok } from "../../../src/packages/core/domain/result";

describe("Result", () => {
  it("ok wraps a value", () => {
    const r = ok(42);
    expect(isOk(r)).toBe(true);
    expect(isErr(r)).toBe(false);
    if (isOk(r)) expect(r.value).toBe(42);
  });

  it("err wraps an error", () => {
    const r = err({ code: "X" });
    expect(isErr(r)).toBe(true);
    if (isErr(r)) expect(r.error.code).toBe("X");
  });
});
