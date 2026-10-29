import { describe, expect, it } from "vitest";
import { isAcceptable, move, toRefs } from "../../src/scripts/gallery-editor";

const file = (name: string) => new File([new Uint8Array([1])], name, { type: "image/png" });

describe("gallery editor helpers", () => {
  it("saved photos keep their key and new files are numbered in the order they appear", () => {
    const a = file("a.png");
    const b = file("b.png");
    const { gallery, files } = toRefs([
      { file: a, url: "blob:a" },
      { key: "K1.webp", url: "/img/K1.webp" },
      { file: b, url: "blob:b" },
    ]);
    expect(gallery).toEqual([{ upload: 0 }, { key: "K1.webp" }, { upload: 1 }]);
    expect(files).toEqual([a, b]);
  });

  it("moves a photo one place and leaves the list as is at the edges", () => {
    expect(move(["a", "b", "c"], 1, -1)).toEqual(["b", "a", "c"]);
    expect(move(["a", "b", "c"], 1, 1)).toEqual(["a", "c", "b"]);
    expect(move(["a", "b", "c"], 0, -1)).toEqual(["a", "b", "c"]);
    expect(move(["a", "b", "c"], 2, 1)).toEqual(["a", "b", "c"]);
  });

  it("accepts only jpeg, png or webp up to 5 MB", () => {
    const sized = (type: string, size: number) => new File([new Uint8Array(size)], "p", { type });
    expect(isAcceptable(sized("image/webp", 5 * 1024 * 1024))).toBe(true);
    expect(isAcceptable(sized("image/png", 5 * 1024 * 1024 + 1))).toBe(false);
    expect(isAcceptable(sized("image/gif", 10))).toBe(false);
  });
});
