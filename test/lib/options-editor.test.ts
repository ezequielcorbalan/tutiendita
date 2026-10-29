import { describe, expect, it } from "vitest";
import { afterGalleryChange, imageRefOf } from "../../src/scripts/options-editor";

const photos = [
  { url: "/img/K1.webp", ref: { key: "K1.webp" } },
  { url: "blob:new", ref: { upload: 0 } },
];

describe("photo of an option value", () => {
  it("an untouched row sends no image_ref, so the server keeps its photo", () => {
    expect(imageRefOf({ url: "/img/K1.webp", touched: false }, photos)).toEqual({});
    expect(imageRefOf({ url: "", touched: false }, photos)).toEqual({});
  });

  it("a touched row sends its photo's ref, or null for no photo", () => {
    expect(imageRefOf({ url: "blob:new", touched: true }, photos)).toEqual({ image_ref: { upload: 0 } });
    expect(imageRefOf({ url: "/img/K1.webp", touched: true }, photos)).toEqual({
      image_ref: { key: "K1.webp" },
    });
    expect(imageRefOf({ url: "", touched: true }, photos)).toEqual({ image_ref: null });
  });

  it("removing the gallery photo a row uses leaves it without photo, sent as null", () => {
    const row = afterGalleryChange({ url: "/img/K1.webp", touched: false }, new Set(["blob:new"]));
    expect(row).toEqual({ url: "", touched: true });
    expect(imageRefOf(row, photos.slice(1))).toEqual({ image_ref: null });
  });

  it("rows whose photo is still there (or that have none) stay as they were", () => {
    const urls = new Set(photos.map((p) => p.url));
    const kept = { url: "/img/K1.webp", touched: false };
    expect(afterGalleryChange(kept, urls)).toBe(kept);
    const none = { url: "", touched: false };
    expect(afterGalleryChange(none, new Set())).toBe(none);
  });
});
