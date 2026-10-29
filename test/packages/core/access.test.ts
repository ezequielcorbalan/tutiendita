import { describe, expect, it } from "vitest";
import {
  hostOfOrigin,
  isSessionValid,
  newSession,
  SESSION_DURATION,
  type Session,
  shouldRenew,
} from "../../../src/packages/core/domain/access";

const T0 = new Date("2026-10-15T10:00:00.000Z");
const more = (ms: number) => new Date(T0.getTime() + ms);
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

describe("newSession", () => {
  it("full lasts 30 days; claim and recovery, 15 minutes", () => {
    expect(newSession("h", "completa", T0).expiresAt).toEqual(more(30 * DAY));
    expect(newSession("h", "reclamo", T0).expiresAt).toEqual(more(15 * MINUTE));
    expect(newSession("h", "recuperacion", T0).expiresAt).toEqual(more(15 * MINUTE));
    expect(SESSION_DURATION.completa).toBe(30 * DAY);
  });

  it("stores the hash, the type and the dates", () => {
    expect(newSession("abc", "reclamo", T0)).toEqual({
      idHash: "abc",
      type: "reclamo",
      createdAt: T0,
      expiresAt: more(15 * MINUTE),
      lastUsedAt: T0,
    });
  });
});

describe("isSessionValid", () => {
  const s = newSession("h", "reclamo", T0);
  it("valid before expiring, expired from the expiration instant", () => {
    expect(isSessionValid(s, more(15 * MINUTE - 1))).toBe(true);
    expect(isSessionValid(s, more(15 * MINUTE))).toBe(false);
  });
});

describe("shouldRenew", () => {
  const full = newSession("h", "completa", T0);
  it("a full one is renewed at most once per day", () => {
    expect(shouldRenew(full, more(DAY - 1))).toBe(false);
    expect(shouldRenew(full, more(DAY))).toBe(true);
  });

  it("claim and recovery are never renewed", () => {
    const short: Session = { ...newSession("h", "recuperacion", T0), lastUsedAt: more(-2 * DAY) };
    expect(shouldRenew(short, T0)).toBe(false);
  });
});

describe("hostOfOrigin", () => {
  it("returns the host without port or scheme", () => {
    expect(hostOfOrigin("https://tiendita.ana.workers.dev")).toBe("tiendita.ana.workers.dev");
    expect(hostOfOrigin("http://localhost:4321")).toBe("localhost");
  });

  it("null if it is not an http(s) origin", () => {
    expect(hostOfOrigin("ftp://x")).toBeNull();
    expect(hostOfOrigin("not a url")).toBeNull();
  });
});
