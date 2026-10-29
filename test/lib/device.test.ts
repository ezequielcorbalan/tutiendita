import { describe, expect, it } from "vitest";
import { deviceName } from "../../src/lib/device";

describe("deviceName", () => {
  it.each([
    ["Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)", "iPhone"],
    ["Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)", "iPad"],
    ["Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/130", "Android"],
    ["Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130", "Windows"],
    ["Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) Safari/605", "Mac"],
    ["Mozilla/5.0 (X11; CrOS x86_64 15000) Chrome/130", "Chromebook"],
    ["Mozilla/5.0 (X11; Linux x86_64) Firefox/130", "Linux"],
    // "Dispositivo" is user text (the passkey name shown to the merchant).
    ["curl/8", "Dispositivo"],
    [undefined, "Dispositivo"],
  ])("%s → %s", (ua, name) => {
    expect(deviceName(ua)).toBe(name);
  });
});
