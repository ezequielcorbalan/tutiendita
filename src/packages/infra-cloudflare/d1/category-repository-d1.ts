import type { Category, CategoryRepository, OptionTemplate } from "../../core/index";
import { and, asc, eq, inArray, notExists, type SQL } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { categories, optionTemplates, products } from "./schema";

type CategoryRow = typeof categories.$inferSelect;
type TemplateRow = typeof optionTemplates.$inferSelect;
/** The stored JSON keeps Spanish keys (it is data in D1). */
type StoredValue = { etiqueta: string; ajuste: number };

const parseValues = (json: string): OptionTemplate["values"] =>
  (JSON.parse(json) as StoredValue[]).map((v) => ({ label: v.etiqueta, priceDelta: v.ajuste }));

const toCategory = (row: CategoryRow, templates: TemplateRow[]): Category =>
  Object.freeze({
    id: row.id,
    name: row.name,
    slug: row.slug,
    parentId: row.parentId,
    optionTemplates: templates.map((t) => ({ name: t.name, values: parseValues(t.valuesJson) })),
  });

export function createD1CategoryRepository(db: D1Database): CategoryRepository {
  const orm = drizzle(db);

  /** Categories matching `where`, each with its templates (two queries; the second filters by subquery). */
  async function load(where?: SQL): Promise<Category[]> {
    const rows = await orm
      .select()
      .from(categories)
      .where(where)
      .orderBy(asc(categories.name), asc(categories.id));
    if (rows.length === 0) return [];
    const ids = orm.select({ id: categories.id }).from(categories).where(where);
    const templates = await orm
      .select()
      .from(optionTemplates)
      .where(inArray(optionTemplates.categoryId, ids))
      .orderBy(asc(optionTemplates.position));
    return rows.map((row) =>
      toCategory(
        row,
        templates.filter((t) => t.categoryId === row.id),
      ),
    );
  }

  return {
    list: () => load(),

    async findById(id) {
      return (await load(eq(categories.id, id)))[0] ?? null;
    },

    /** Upserts the category and replaces its templates, in one batch (a transaction in D1). */
    async save(c) {
      const { optionTemplates: templates, ...row } = c;
      const { id, ...rest } = row;
      const upsert = orm
        .insert(categories)
        .values({ id, ...rest })
        .onConflictDoUpdate({ target: categories.id, set: rest });
      const clear = orm.delete(optionTemplates).where(eq(optionTemplates.categoryId, c.id));
      if (templates.length === 0) {
        await orm.batch([upsert, clear]);
        return;
      }
      const insert = orm.insert(optionTemplates).values(
        templates.map((t, position) => ({
          id: `${c.id}:${position}`,
          categoryId: c.id,
          name: t.name,
          valuesJson: JSON.stringify(
            t.values.map((v): StoredValue => ({ etiqueta: v.label, ajuste: v.priceDelta })),
          ),
          position,
        })),
      );
      await orm.batch([upsert, clear, insert]);
    },

    /** A single statement: no race between the usage check and the delete. The templates cascade. */
    async deleteIfUnused(id) {
      const inUse = orm.select({ id: products.id }).from(products).where(eq(products.categoryId, id));
      const r = await orm.delete(categories).where(and(eq(categories.id, id), notExists(inUse)));
      return r.meta.changes > 0;
    },
  };
}
