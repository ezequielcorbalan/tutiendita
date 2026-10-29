import { env } from "cloudflare:test";
import type { Category } from "../../../src/packages/core/index";
import { beforeEach, describe, expect, it } from "vitest";
import { createD1CategoryRepository } from "../../../src/packages/infra-cloudflare/d1/category-repository-d1";

const mates: Category = {
  id: "01ARZ3NDEKTSV4RRFFQ69G5FC1",
  name: "Mates",
  slug: "mates",
  parentId: null,
  optionTemplates: [],
};
const imperial: Category = {
  id: "01ARZ3NDEKTSV4RRFFQ69G5FC2",
  name: "Imperiales",
  slug: "imperiales",
  parentId: mates.id,
  optionTemplates: [],
};

describe("D1CategoryRepository", () => {
  const repo = createD1CategoryRepository(env.DB);

  beforeEach(async () => {
    await env.DB.prepare("DELETE FROM categorias").run();
  });

  it("save and list, sorted by name", async () => {
    await repo.save(mates);
    await repo.save(imperial);
    expect(await repo.list()).toEqual([imperial, mates]);
  });

  it("findById returns the category or null", async () => {
    await repo.save(mates);
    expect(await repo.findById(mates.id)).toEqual(mates);
    expect(await repo.findById("missing")).toBeNull();
  });

  it("saving the same id twice updates without duplicating", async () => {
    await repo.save(mates);
    await repo.save({ ...mates, name: "Mates y bombillas" });
    const list = await repo.list();
    expect(list).toHaveLength(1);
    expect(list[0]?.name).toBe("Mates y bombillas");
  });
});

describe("D1CategoryRepository.deleteIfUnused", () => {
  const repo = createD1CategoryRepository(env.DB);

  beforeEach(async () => {
    await env.DB.prepare("DELETE FROM imagenes_producto").run();
    await env.DB.prepare("DELETE FROM productos").run();
    await env.DB.prepare("DELETE FROM categorias").run();
  });

  it("deletes a category without products and returns true; if it does not exist, false", async () => {
    await repo.save(mates);
    expect(await repo.deleteIfUnused(mates.id)).toBe(true);
    expect(await repo.findById(mates.id)).toBeNull();
    expect(await repo.deleteIfUnused(mates.id)).toBe(false);
  });

  it("does not delete a category some product uses", async () => {
    await repo.save(mates);
    await env.DB.prepare(
      `INSERT INTO productos (id, nombre, slug, precio_monto, precio_moneda, estado, categoria_id, version, creado_en, actualizado_en)
       VALUES ('p1', 'Mate', 'mate', 100, 'ARS', 'borrador', ?, 1, '2026-10-15T10:00:00.000Z', '2026-10-15T10:00:00.000Z')`,
    )
      .bind(mates.id)
      .run();
    expect(await repo.deleteIfUnused(mates.id)).toBe(false);
    expect(await repo.findById(mates.id)).toEqual(mates);
  });
});

describe("D1CategoryRepository option templates", () => {
  const repo = createD1CategoryRepository(env.DB);
  const templates = [
    {
      name: "Relleno",
      values: [
        { label: "Dulce de leche", priceDelta: 0 },
        { label: "Chocolate", priceDelta: 50000 },
      ],
    },
    { name: "Tamaño", values: [{ label: "Grande", priceDelta: 0 }] },
  ];

  beforeEach(async () => {
    await env.DB.batch([env.DB.prepare("DELETE FROM productos"), env.DB.prepare("DELETE FROM categorias")]);
  });

  it("saves and reads the templates in order, replaces them on the next save and drops them with the category", async () => {
    await repo.save({ ...mates, optionTemplates: templates });
    expect((await repo.findById(mates.id))?.optionTemplates).toEqual(templates);
    expect((await repo.list())[0]?.optionTemplates.map((t) => t.name)).toEqual(["Relleno", "Tamaño"]);
    await repo.save({ ...mates, optionTemplates: [templates[1] as (typeof templates)[number]] });
    expect((await repo.findById(mates.id))?.optionTemplates.map((t) => t.name)).toEqual(["Tamaño"]);
    expect(await repo.deleteIfUnused(mates.id)).toBe(true);
    const { results } = await env.DB.prepare("SELECT count(*) AS n FROM plantillas_opcion").all<{
      n: number;
    }>();
    expect(results[0]?.n).toBe(0);
  });
});
