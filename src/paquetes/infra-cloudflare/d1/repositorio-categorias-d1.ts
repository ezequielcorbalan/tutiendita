import type { Categoria, RepositorioCategorias } from "../../core/index";
import { and, asc, eq, notExists } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { categorias, productos } from "./esquema";

const aCategoria = (fila: typeof categorias.$inferSelect): Categoria =>
  Object.freeze({ id: fila.id, nombre: fila.nombre, slug: fila.slug, padreId: fila.padreId });

export function crearRepositorioCategoriasD1(db: D1Database): RepositorioCategorias {
  const orm = drizzle(db);
  return {
    async listar() {
      const filas = await orm.select().from(categorias).orderBy(asc(categorias.nombre), asc(categorias.id));
      return filas.map(aCategoria);
    },

    async buscarPorId(id) {
      const [fila] = await orm.select().from(categorias).where(eq(categorias.id, id)).limit(1);
      return fila ? aCategoria(fila) : null;
    },

    async guardar(c) {
      const { id, ...resto } = c;
      await orm.insert(categorias).values(c).onConflictDoUpdate({ target: categorias.id, set: resto });
    },

    /** Una sola sentencia: no hay carrera entre el chequeo de uso y el borrado. */
    async borrarSiNoTieneProductos(id) {
      const enUso = orm.select({ id: productos.id }).from(productos).where(eq(productos.categoriaId, id));
      const r = await orm.delete(categorias).where(and(eq(categorias.id, id), notExists(enUso)));
      return r.meta.changes > 0;
    },
  };
}
