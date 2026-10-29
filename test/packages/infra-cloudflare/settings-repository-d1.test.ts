import { env } from "cloudflare:test";
import { PHOTOS_MODE } from "../../../src/packages/core/index";
import { describe, expect, it } from "vitest";
import { createD1SettingsRepository } from "../../../src/packages/infra-cloudflare/d1/settings-repository-d1";

describe("D1SettingsRepository", () => {
  const settings = createD1SettingsRepository(env.DB);

  it("get of an unknown key is null", async () => {
    expect(await settings.get(PHOTOS_MODE)).toBeNull();
  });

  it("set then get", async () => {
    await settings.set(PHOTOS_MODE, "basica", new Date("2026-10-17T10:00:00.000Z"));
    expect(await settings.get(PHOTOS_MODE)).toBe("basica");
  });

  it("set twice keeps the last value", async () => {
    await settings.set(PHOTOS_MODE, "basica", new Date("2026-10-17T10:00:00.000Z"));
    await settings.set(PHOTOS_MODE, "profesional", new Date("2026-10-17T11:00:00.000Z"));
    expect(await settings.get(PHOTOS_MODE)).toBe("profesional");
  });
});
