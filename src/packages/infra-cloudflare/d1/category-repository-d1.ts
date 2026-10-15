import type { Category, CategoryRepository } from "../../core/index";
import { and, asc, eq, notExists } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { categories, products } from "./schema";

const toCategory = (row: typeof categories.$inferSelect): Category =>
  Object.freeze({ id: row.id, name: row.name, slug: row.slug, parentId: row.parentId });

export function createD1CategoryRepository(db: D1Database): CategoryRepository {
  const orm = drizzle(db);
  return {
    async list() {
      const rows = await orm.select().from(categories).orderBy(asc(categories.name), asc(categories.id));
      return rows.map(toCategory);
    },

    async findById(id) {
      const [row] = await orm.select().from(categories).where(eq(categories.id, id)).limit(1);
      return row ? toCategory(row) : null;
    },

    async save(c) {
      const { id, ...rest } = c;
      await orm.insert(categories).values(c).onConflictDoUpdate({ target: categories.id, set: rest });
    },

    /** A single statement: no race between the usage check and the delete. */
    async deleteIfUnused(id) {
      const inUse = orm.select({ id: products.id }).from(products).where(eq(products.categoryId, id));
      const r = await orm.delete(categories).where(and(eq(categories.id, id), notExists(inUse)));
      return r.meta.changes > 0;
    },
  };
}
