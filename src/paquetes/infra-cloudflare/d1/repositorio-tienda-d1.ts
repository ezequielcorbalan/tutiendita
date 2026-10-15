import type { RepositorioTienda, Tienda } from "../../core/index";
import { asc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { tiendas } from "./esquema";

const aTienda = (fila: typeof tiendas.$inferSelect): Tienda =>
  Object.freeze({
    id: fila.id,
    nombre: fila.nombre,
    descripcion: fila.descripcion,
    logoKey: fila.logoKey,
    moneda: fila.moneda,
    idioma: fila.idioma,
    contacto: Object.freeze({ whatsapp: fila.contactoWhatsapp, email: fila.contactoEmail }),
    dominio: fila.dominio,
  });

/** Una sola fila por despliegue; si hubiera más, manda la primera creada. La escribe el primer ingreso. */
export function crearRepositorioTiendaD1(db: D1Database): RepositorioTienda {
  const orm = drizzle(db);
  return {
    async obtener() {
      const [fila] = await orm
        .select()
        .from(tiendas)
        .orderBy(asc(tiendas.creadoEn), asc(tiendas.id))
        .limit(1);
      return fila ? aTienda(fila) : null;
    },

    async guardar(t, ahora) {
      const columnas = {
        nombre: t.nombre,
        descripcion: t.descripcion,
        logoKey: t.logoKey,
        moneda: t.moneda,
        idioma: t.idioma,
        contactoWhatsapp: t.contacto.whatsapp,
        contactoEmail: t.contacto.email,
        dominio: t.dominio,
        actualizadoEn: ahora.toISOString(),
      };
      await orm
        .insert(tiendas)
        .values({ id: t.id, ...columnas, creadoEn: ahora.toISOString() })
        .onConflictDoUpdate({ target: tiendas.id, set: columnas });
    },
  };
}
