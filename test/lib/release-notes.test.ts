import { describe, expect, it } from "vitest";
import { inline, parseNotes } from "../../src/lib/release-notes";

describe("release notes", () => {
  it("italics with single asterisks, but a lone asterisk stays text", () => {
    expect(inline("avisa en *Actualizaciones* y 2 * 3")).toEqual([
      { text: "avisa en " },
      { text: "Actualizaciones", em: true },
      { text: " y 2 * 3" },
    ]);
  });

  it("bold that holds code keeps both", () => {
    expect(inline("**`npm run dev` arranca**")).toEqual([
      { text: "npm run dev", code: true, strong: true },
      { text: " arranca", strong: true },
    ]);
  });

  it("splits bold, code and links (keeping only the link text)", () => {
    expect(inline("**Ficha** en `dos` columnas ([#13](https://github.com/x/y/pull/13))")).toEqual([
      { text: "Ficha", strong: true },
      { text: " en " },
      { text: "dos", code: true },
      { text: " columnas (" },
      { text: "#13" },
      { text: ")" },
    ]);
  });

  it("reads headings, lists and multi-line paragraphs, with GitHub's CRLF line endings", () => {
    const notes = "## Novedades\r\n\r\n- Uno\r\n* Dos\r\n\r\nUna línea\r\nque sigue.\r\n\r\nOtro párrafo";
    expect(parseNotes(notes)).toEqual([
      { type: "heading", parts: [{ text: "Novedades" }] },
      { type: "list", items: [[{ text: "Uno" }], [{ text: "Dos" }]] },
      { type: "paragraph", parts: [{ text: "Una línea que sigue." }] },
      { type: "paragraph", parts: [{ text: "Otro párrafo" }] },
    ]);
  });

  it("HTML in the notes stays text: nothing is interpreted", () => {
    expect(parseNotes('<img src=x onerror="alert(1)">')).toEqual([
      { type: "paragraph", parts: [{ text: '<img src=x onerror="alert(1)">' }] },
    ]);
  });

  it("empty notes give no blocks", () => {
    expect(parseNotes("")).toEqual([]);
    expect(parseNotes("\r\n  \r\n")).toEqual([]);
  });
});
