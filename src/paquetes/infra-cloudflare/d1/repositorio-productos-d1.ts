import {
  type ImagenProducto,
  type Producto,
  type RepositorioProductos,
  SlugDuplicadoError,
} from "../../core/index";
import { asc, desc, eq, type SQL } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { imagenesProducto, productos } from "./esquema";

type FilaProducto = typeof productos.$inferSelect;
type FilaImagen = typeof imagenesProducto.$inferSelect;
type FilaUnida = { productos: FilaProducto; imagenes_producto: FilaImagen | null };

const aProducto = (fila: FilaProducto, imagenes: ImagenProducto[]): Producto =>
  Object.freeze({
    id: fila.id,
    nombre: fila.nombre,
    slug: fila.slug,
    descripcion: fila.descripcion,
    precio: { monto: fila.precioMonto, moneda: fila.precioMoneda },
    imagenes,
    stock: fila.stock,
    estado: fila.estado,
    categoriaId: fila.categoriaId,
    federar: fila.federar,
    version: fila.version,
    creadoEn: new Date(fila.creadoEn),
    actualizadoEn: new Date(fila.actualizadoEn),
  });

/** Agrupa filas producto⟕imagen conservando el orden de llegada de los productos. */
const agrupar = (filas: FilaUnida[]): Producto[] => {
  const porId = new Map<string, { fila: FilaProducto; imagenes: ImagenProducto[] }>();
  for (const { productos: p, imagenes_producto: img } of filas) {
    let entrada = porId.get(p.id);
    if (!entrada) {
      entrada = { fila: p, imagenes: [] };
      porId.set(p.id, entrada);
    }
    if (img) entrada.imagenes.push({ key: img.key, orden: img.orden });
  }
  return [...porId.values()].map(({ fila, imagenes }) => aProducto(fila, imagenes));
};

const aFila = (p: Producto): FilaProducto => ({
  id: p.id,
  nombre: p.nombre,
  slug: p.slug,
  descripcion: p.descripcion,
  precioMonto: p.precio.monto,
  precioMoneda: p.precio.moneda,
  stock: p.stock,
  estado: p.estado,
  categoriaId: p.categoriaId,
  federar: p.federar,
  version: p.version,
  creadoEn: p.creadoEn.toISOString(),
  actualizadoEn: p.actualizadoEn.toISOString(),
});

/** D1 reporta la violación como "D1_ERROR: UNIQUE constraint failed: productos.slug…" (a veces en `cause`). */
const esSlugDuplicado = (error: unknown): boolean => {
  for (let e: unknown = error, i = 0; e instanceof Error && i < 5; e = e.cause, i += 1) {
    if (e.message.includes("UNIQUE constraint failed: productos.slug")) return true;
  }
  return false;
};

export function crearRepositorioProductosD1(db: D1Database): RepositorioProductos {
  const orm = drizzle(db);

  const consultar = (donde: SQL, orden: SQL[] = []): Promise<FilaUnida[]> =>
    orm
      .select()
      .from(productos)
      .leftJoin(imagenesProducto, eq(imagenesProducto.productoId, productos.id))
      .where(donde)
      .orderBy(...orden, asc(imagenesProducto.orden));

  const buscarUno = async (donde: SQL): Promise<Producto | null> =>
    agrupar(await consultar(donde))[0] ?? null;

  /** Upsert del producto y reemplazo de sus imágenes, todo en un batch (una transacción en D1). */
  const guardarEnBatch = async (p: Producto): Promise<void> => {
    const { id, ...resto } = aFila(p);
    const upsert = orm
      .insert(productos)
      .values({ id, ...resto })
      .onConflictDoUpdate({ target: productos.id, set: resto });
    const borrarImagenes = orm.delete(imagenesProducto).where(eq(imagenesProducto.productoId, p.id));
    if (p.imagenes.length === 0) {
      await orm.batch([upsert, borrarImagenes]);
      return;
    }
    const insertarImagenes = orm.insert(imagenesProducto).values(
      p.imagenes.map((img) => ({
        id: `${p.id}:${img.orden}`,
        productoId: p.id,
        key: img.key,
        orden: img.orden,
      })),
    );
    await orm.batch([upsert, borrarImagenes, insertarImagenes]);
  };

  return {
    async listarPublicados() {
      const filas = await consultar(eq(productos.estado, "publicado"), [
        desc(productos.creadoEn),
        asc(productos.id),
      ]);
      return agrupar(filas);
    },

    buscarPorSlug: (slug) => buscarUno(eq(productos.slug, slug)),

    buscarPorId: (id) => buscarUno(eq(productos.id, id)),

    async existeSlug(slug) {
      const fila = await orm
        .select({ id: productos.id })
        .from(productos)
        .where(eq(productos.slug, slug))
        .limit(1);
      return fila.length > 0;
    },

    /** Si otro producto ya tiene el slug, lanza SlugDuplicadoError (el batch no aplica nada). */
    async guardar(p) {
      try {
        await guardarEnBatch(p);
      } catch (error) {
        if (esSlugDuplicado(error)) throw new SlugDuplicadoError(p.slug);
        throw error;
      }
    },
  };
}
