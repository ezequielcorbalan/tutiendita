import {
  DuplicateSlugError,
  type Product,
  type ProductImage,
  type ProductOption,
  type ProductRepository,
} from "../../core/index";
import { asc, desc, eq, inArray, type SQL } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { drizzle } from "drizzle-orm/d1";
import { optionValues, productImages, productOptions, products } from "./schema";

type ProductRow = typeof products.$inferSelect;
type ImageRow = typeof productImages.$inferSelect;
type OptionRow = typeof productOptions.$inferSelect;
type ValueRow = typeof optionValues.$inferSelect;
// Drizzle keys join results by SQL table name.
type JoinedRow = { productos: ProductRow; imagenes_producto: ImageRow | null };

/** D1 allows 100 bound parameters per statement: splits the rows so each insert stays under it. */
const MAX_BOUND_PARAMS = 100;
function chunkByParams<T extends object>(rows: T[]): T[][] {
  const first = rows[0];
  if (first === undefined) return [];
  const size = Math.max(1, Math.floor(MAX_BOUND_PARAMS / Object.keys(first).length));
  return Array.from({ length: Math.ceil(rows.length / size) }, (_, i) =>
    rows.slice(i * size, (i + 1) * size),
  );
}

const toProduct = (row: ProductRow, images: ProductImage[], options: ProductOption[]): Product =>
  Object.freeze({
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    price: { amount: row.priceAmount, currency: row.priceCurrency },
    images,
    options,
    stock: row.stock,
    status: row.status,
    categoryId: row.categoryId,
    federate: row.federate,
    version: row.version,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  });

/** Groups product⟕image rows, keeping the order in which products arrive. */
const group = (rows: JoinedRow[], optionsByProduct: Map<string, ProductOption[]>): Product[] => {
  const byId = new Map<string, { row: ProductRow; images: ProductImage[] }>();
  for (const { productos: p, imagenes_producto: img } of rows) {
    let input = byId.get(p.id);
    if (!input) {
      input = { row: p, images: [] };
      byId.set(p.id, input);
    }
    if (img) input.images.push({ key: img.key, position: img.position });
  }
  return [...byId.values()].map(({ row, images }) =>
    toProduct(row, images, optionsByProduct.get(row.id) ?? []),
  );
};

/** Option rows with their value rows (both already ordered by position), grouped by product. */
const groupOptions = (options: OptionRow[], values: ValueRow[]): Map<string, ProductOption[]> => {
  const byProduct = new Map<string, ProductOption[]>();
  for (const o of options) {
    const list = byProduct.get(o.productId) ?? [];
    list.push({
      id: o.id,
      name: o.name,
      values: values
        .filter((v) => v.optionId === o.id)
        .map((v) => ({ id: v.id, label: v.label, priceDelta: v.priceDelta, imageKey: v.imageKey })),
    });
    byProduct.set(o.productId, list);
  }
  return byProduct;
};

const toRow = (p: Product): ProductRow => ({
  id: p.id,
  name: p.name,
  slug: p.slug,
  description: p.description,
  priceAmount: p.price.amount,
  priceCurrency: p.price.currency,
  stock: p.stock,
  status: p.status,
  categoryId: p.categoryId,
  federate: p.federate,
  version: p.version,
  createdAt: p.createdAt.toISOString(),
  updatedAt: p.updatedAt.toISOString(),
});

/** D1 reports the violation as "D1_ERROR: UNIQUE constraint failed: productos.slug…" (sometimes in `cause`). */
const isDuplicateSlug = (error: unknown): boolean => {
  for (let e: unknown = error, i = 0; e instanceof Error && i < 5; e = e.cause, i += 1) {
    if (e.message.includes("UNIQUE constraint failed: productos.slug")) return true;
  }
  return false;
};

export function createD1ProductRepository(db: D1Database): ProductRepository {
  const orm = drizzle(db);

  /**
   * Products matching `where` with their images (one join) and options (two more queries, filtered by
   * subquery so the number of bound parameters never grows with the catalog).
   */
  async function load(where: SQL | undefined, orderBy: SQL[] = []): Promise<Product[]> {
    const rows = await orm
      .select()
      .from(products)
      .leftJoin(productImages, eq(productImages.productId, products.id))
      .where(where)
      .orderBy(...orderBy, asc(productImages.position));
    if (rows.length === 0) return [];
    const ids = orm.select({ id: products.id }).from(products).where(where);
    const options = await orm
      .select()
      .from(productOptions)
      .where(inArray(productOptions.productId, ids))
      .orderBy(asc(productOptions.position));
    const values =
      options.length === 0
        ? []
        : await orm
            .select()
            .from(optionValues)
            .where(
              inArray(
                optionValues.optionId,
                orm
                  .select({ id: productOptions.id })
                  .from(productOptions)
                  .where(inArray(productOptions.productId, ids)),
              ),
            )
            .orderBy(asc(optionValues.position));
    return group(rows, groupOptions(options, values));
  }

  const findOne = async (where: SQL): Promise<Product | null> => (await load(where))[0] ?? null;

  const optionIdsOf = (productId: string) =>
    orm.select({ id: productOptions.id }).from(productOptions).where(eq(productOptions.productId, productId));

  /** Upserts the product and replaces its images and options, all in one batch (a transaction in D1). */
  const saveInBatch = async (p: Product): Promise<void> => {
    const { id, ...rest } = toRow(p);
    const statements: BatchItem<"sqlite">[] = [
      orm
        .insert(products)
        .values({ id, ...rest })
        .onConflictDoUpdate({ target: products.id, set: rest }),
      orm.delete(productImages).where(eq(productImages.productId, p.id)),
      orm.delete(optionValues).where(inArray(optionValues.optionId, optionIdsOf(p.id))),
      orm.delete(productOptions).where(eq(productOptions.productId, p.id)),
    ];
    if (p.images.length > 0) {
      statements.push(
        orm.insert(productImages).values(
          p.images.map((img) => ({
            id: `${p.id}:${img.position}`,
            productId: p.id,
            key: img.key,
            position: img.position,
          })),
        ),
      );
    }
    if (p.options.length > 0) {
      statements.push(
        orm
          .insert(productOptions)
          .values(p.options.map((o, position) => ({ id: o.id, productId: p.id, name: o.name, position }))),
      );
      const values = p.options.flatMap((o) =>
        o.values.map((v, position) => ({
          id: v.id,
          optionId: o.id,
          label: v.label,
          priceDelta: v.priceDelta,
          imageKey: v.imageKey,
          position,
        })),
      );
      for (const rows of chunkByParams(values)) statements.push(orm.insert(optionValues).values(rows));
    }
    const [first, ...others] = statements;
    if (first === undefined) return;
    await orm.batch([first, ...others]);
  };

  const newestFirst = [desc(products.createdAt), asc(products.id)];

  return {
    listPublished: () => load(eq(products.status, "publicado"), newestFirst),

    listAll: () => load(undefined, newestFirst),

    findBySlug: (slug) => findOne(eq(products.slug, slug)),

    findById: (id) => findOne(eq(products.id, id)),

    async slugExists(slug) {
      const row = await orm
        .select({ id: products.id })
        .from(products)
        .where(eq(products.slug, slug))
        .limit(1);
      return row.length > 0;
    },

    /** If another product already has the slug, throws DuplicateSlugError (the batch applies nothing). */
    async save(p) {
      try {
        await saveInBatch(p);
      } catch (error) {
        if (isDuplicateSlug(error)) throw new DuplicateSlugError(p.slug);
        throw error;
      }
    },

    /** With its image, option and value rows, in one batch (one transaction in D1). */
    async remove(id) {
      await orm.batch([
        orm.delete(optionValues).where(inArray(optionValues.optionId, optionIdsOf(id))),
        orm.delete(productOptions).where(eq(productOptions.productId, id)),
        orm.delete(productImages).where(eq(productImages.productId, id)),
        orm.delete(products).where(eq(products.id, id)),
      ]);
    },
  };
}
