import type { RepositorioConexionGithub } from "../../core/index";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { conexionGithub } from "./esquema";

export function crearRepositorioConexionGithubD1(db: D1Database): RepositorioConexionGithub {
  const orm = drizzle(db);
  return {
    async obtener() {
      const [f] = await orm.select().from(conexionGithub).where(eq(conexionGithub.id, 1)).limit(1);
      return f
        ? Object.freeze({
            appId: f.appId,
            slug: f.slug,
            clavePrivada: f.clavePrivada,
            instalacionId: f.instalacionId,
            repositorio: f.repositorio,
          })
        : null;
    },

    async guardar(c, ahora) {
      const columnas = { ...c, actualizadoEn: ahora.toISOString() };
      await orm
        .insert(conexionGithub)
        .values({ id: 1, ...columnas })
        .onConflictDoUpdate({ target: conexionGithub.id, set: columnas });
    },
  };
}
