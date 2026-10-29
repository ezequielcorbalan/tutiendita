import { describe, expect, it } from "vitest";
import { shrinkImage, targetSize } from "../../src/lib/shrink-image";

describe("targetSize", () => {
  it("scales the long side down to the maximum, keeping the ratio", () => {
    expect(targetSize(4000, 3000, 1200)).toEqual({ width: 1200, height: 900 });
    expect(targetSize(3000, 4000, 2000)).toEqual({ width: 1500, height: 2000 });
  });

  it("never upscales", () => {
    expect(targetSize(800, 600, 1200)).toEqual({ width: 800, height: 600 });
  });
});

describe("shrinkImage", () => {
  it("returns the original file when the browser cannot decode images", async () => {
    const file = new File(["x"], "a.jpg", { type: "image/jpeg" });
    const original = globalThis.createImageBitmap;
    // @ts-expect-error simulating a browser without createImageBitmap
    globalThis.createImageBitmap = undefined;
    try {
      expect(await shrinkImage(file, "basic")).toBe(file);
    } finally {
      globalThis.createImageBitmap = original;
    }
  });
});
