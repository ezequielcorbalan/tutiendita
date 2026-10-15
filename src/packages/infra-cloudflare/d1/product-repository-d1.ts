import { DuplicateSlugError, type Product, type ProductImage, type ProductRepository } from "../../core/index";
import { asc, desc, eq, type SQL } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { productImages, products } from "./schema";

type ProductRow = typeof products.$inferSelect;
type ImageRow = typeof productImages.$inferSelect;
// Drizzle keys join results by SQL table name.
type JoinedRow = { productos: ProductRow; imagenes_producto: ImageRow | null };

const toProduct = (row: ProductRow, images: ProductImage[]): Product =>
  Object.freeze({
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    price: { amount: row.priceAmount, currency: row.priceCurrency },
    images,
    stock: row.stock,
    status: row.status,
    categoryId: row.categoryId,
    federate: row.federate,
    version: row.version,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  });

/** Groups product⟕image rows, keeping the order in which products arrive. */
const group = (rows: JoinedRow[]): Product[] => {
  const byId = new Map<string, { row: ProductRow; images: ProductImage[] }>();
  for (const { productos: p, imagenes_producto: img } of rows) {
    let input = byId.get(p.id);
    if (!input) {
      input = { row: p, images: [] };
      byId.set(p.id, input);
    }
    if (img) input.images.push({ key: img.key, position: img.position });
  }
  return [...byId.values()].map(({ row, images }) => toProduct(row, images));
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

  const query = (where: SQL | undefined, orderBy: SQL[] = []): Promise<JoinedRow[]> =>
    orm
      .select()
      .from(products)
      .leftJoin(productImages, eq(productImages.productId, products.id))
      .where(where)
      .orderBy(...orderBy, asc(productImages.position));

  const findOne = async (where: SQL): Promise<Product | null> => group(await query(where))[0] ?? null;

  /** Upserts the product and replaces its images, all in one batch (a transaction in D1). */
  const saveInBatch = async (p: Product): Promise<void> => {
    const { id, ...rest } = toRow(p);
    const upsert = orm
      .insert(products)
      .values({ id, ...rest })
      .onConflictDoUpdate({ target: products.id, set: rest });
    const deleteImages = orm.delete(productImages).where(eq(productImages.productId, p.id));
    if (p.images.length === 0) {
      await orm.batch([upsert, deleteImages]);
      return;
    }
    const insertImages = orm.insert(productImages).values(
      p.images.map((img) => ({
        id: `${p.id}:${img.position}`,
        productId: p.id,
        key: img.key,
        position: img.position,
      })),
    );
    await orm.batch([upsert, deleteImages, insertImages]);
  };

  const newestFirst = [desc(products.createdAt), asc(products.id)];

  return {
    listPublished: async () => group(await query(eq(products.status, "publicado"), newestFirst)),

    listAll: async () => group(await query(undefined, newestFirst)),

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

    /** With its image rows, in one batch (one transaction in D1). */
    async remove(id) {
      await orm.batch([
        orm.delete(productImages).where(eq(productImages.productId, id)),
        orm.delete(products).where(eq(products.id, id)),
      ]);
    },
  };
}
