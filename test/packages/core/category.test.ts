import { describe, expect, it } from "vitest";
import { createCategory, editCategory } from "../../../src/packages/core/domain/category";
import { isErr, isOk } from "../../../src/packages/core/domain/result";

describe("createCategory", () => {
  it("creates a root category", () => {
    const r = createCategory({ name: "Sweets" }, { id: "c1", slug: "sweets" });
    expect(isOk(r) && r.value).toEqual({
      id: "c1",
      name: "Sweets",
      slug: "sweets",
      parentId: null,
      optionTemplates: [],
    });
  });

  it("creates a subcategory", () => {
    const r = createCategory({ name: "Alfajores", parentId: "c1" }, { id: "c2", slug: "alfajores" });
    expect(isOk(r) && r.value.parentId).toBe("c1");
  });

  it("rejects an empty name and an invalid slug", () => {
    expect(isErr(createCategory({ name: " " }, { id: "c", slug: "x" }))).toBe(true);
    const r = createCategory({ name: "Ok" }, { id: "c", slug: "Not Valid" });
    expect(isErr(r) && r.error.code).toBe("INVALID_SLUG");
  });
});

describe("editCategory", () => {
  it("renames and replaces the option templates, keeping the slug", () => {
    const c = createCategory({ name: "Tortas" }, { id: "c1", slug: "tortas" });
    if (!isOk(c)) throw new Error("fixture");
    const templates = [{ name: "Relleno", values: [{ label: "Dulce de leche", priceDelta: 0 }] }];
    const r = editCategory(c.value, { name: "Tortas y postres", optionTemplates: templates });
    expect(isOk(r) && r.value).toMatchObject({
      name: "Tortas y postres",
      slug: "tortas",
      optionTemplates: templates,
    });
    const bad = editCategory(c.value, { optionTemplates: [{ name: "Relleno", values: [] }] });
    expect(isErr(bad) && bad.error.code).toBe("INVALID_OPTIONS");
  });
});
