import { describe, expect, it } from "vitest";
import { buildNumber, COUNTRIES, defaultCountry, splitNumber } from "../../src/lib/phone";

describe("buildNumber", () => {
  it("in Argentina it sends the number as is: the domain already understands the 0, the 15 and adds the 9", () => {
    expect(buildNumber("AR", "11 15 2233-4455")).toBe("11 15 2233-4455");
  });

  it("in another country it prepends the code and drops the leading long-distance 0", () => {
    expect(buildNumber("UY", "099 123 456")).toBe("+59899123456");
    expect(buildNumber("BR", "(11) 98765-4321")).toBe("+5511987654321");
  });

  it("if the person already typed the international code, it keeps what they typed", () => {
    expect(buildNumber("AR", "+34 612 345 678")).toBe("+34 612 345 678");
    expect(buildNumber("UY", "0034612345678")).toBe("0034612345678");
  });

  it("an unknown country doesn't make up a prefix", () => {
    expect(buildNumber("ZZ", "123")).toBe("123");
  });
});

describe("splitNumber", () => {
  it("splits an Argentine mobile without the 9", () => {
    expect(splitNumber("+5491122334455", "AR")).toEqual({ country: "AR", national: "1122334455" });
  });

  it("picks the longest matching code", () => {
    expect(splitNumber("+59899123456", "AR")).toEqual({ country: "UY", national: "99123456" });
    expect(splitNumber("+351912345678", "AR")).toEqual({ country: "PT", national: "912345678" });
  });

  it("without a number it uses the default country", () => {
    expect(splitNumber(undefined, "BR")).toEqual({ country: "BR", national: "" });
  });
});

describe("countries", () => {
  it("the default country comes from the store language", () => {
    expect(defaultCountry("es")).toBe("AR");
    expect(defaultCountry("pt")).toBe("BR");
    expect(defaultCountry("en")).toBe("US");
  });

  it("each country appears only once and Argentina first", () => {
    expect(COUNTRIES[0]?.iso).toBe("AR");
    expect(new Set(COUNTRIES.map((p) => p.iso)).size).toBe(COUNTRIES.length);
  });
});
