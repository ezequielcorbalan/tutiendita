import { env } from "cloudflare:test";
import type { Session } from "../../../src/packages/core/index";
import { beforeEach, describe, expect, it } from "vitest";
import { createD1ChallengeRepository } from "../../../src/packages/infra-cloudflare/d1/challenge-repository-d1";
import { createD1SessionRepository } from "../../../src/packages/infra-cloudflare/d1/session-repository-d1";

const T0 = new Date("2026-10-15T10:00:00.000Z");
const more = (min: number) => new Date(T0.getTime() + min * 60_000);
const session = (idHash: string, expiresInMin: number, type: Session["type"] = "completa"): Session => ({
  idHash,
  type,
  createdAt: T0,
  expiresAt: more(expiresInMin),
  lastUsedAt: T0,
});

const sessions = createD1SessionRepository(env.DB);
const challenges = createD1ChallengeRepository(env.DB);

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM sesiones"),
    env.DB.prepare("DELETE FROM desafios_webauthn"),
  ]);
});

describe("D1SessionRepository", () => {
  it("creates, finds and renews", async () => {
    await sessions.create(session("a", 15, "reclamo"));
    expect(await sessions.findByHash("a")).toEqual(session("a", 15, "reclamo"));
    expect(await sessions.findByHash("b")).toBeNull();
    await sessions.renew("a", more(60), more(5));
    expect(await sessions.findByHash("a")).toMatchObject({ expiresAt: more(60), lastUsedAt: more(5) });
  });

  it("deletes one, all but one, all, and the expired ones", async () => {
    for (const [h, m] of [
      ["a", 10],
      ["b", 20],
      ["c", 30],
    ] as const)
      await sessions.create(session(h, m));
    await sessions.deleteExpired(more(20));
    expect(await sessions.findByHash("a")).toBeNull();
    expect(await sessions.findByHash("b")).toBeNull();
    expect(await sessions.findByHash("c")).not.toBeNull();
    await sessions.create(session("d", 40));
    await sessions.deleteAllExcept("d");
    expect(await sessions.findByHash("c")).toBeNull();
    expect(await sessions.findByHash("d")).not.toBeNull();
    await sessions.remove("d");
    await sessions.create(session("e", 40));
    await sessions.deleteAllExcept(null);
    expect(await env.DB.prepare("SELECT count(*) AS n FROM sesiones").first("n")).toBe(0);
  });
});

describe("D1ChallengeRepository", () => {
  it("consume reads and deletes: the second attempt finds nothing", async () => {
    const d = {
      id: "d1",
      challenge: "abc",
      purpose: "registro" as const,
      sessionIdHash: "s1",
      webauthnUserId: "u1",
      expiresAt: more(5),
    };
    await challenges.save(d);
    expect(await challenges.consume("d1")).toEqual(d);
    expect(await challenges.consume("d1")).toBeNull();
  });

  it("stores nulls (sign-in challenge)", async () => {
    const d = {
      id: "d2",
      challenge: "x",
      purpose: "ingreso" as const,
      sessionIdHash: null,
      webauthnUserId: null,
      expiresAt: more(5),
    };
    await challenges.save(d);
    expect(await challenges.consume("d2")).toEqual(d);
  });
});
