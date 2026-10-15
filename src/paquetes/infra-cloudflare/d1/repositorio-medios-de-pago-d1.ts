import type { MedioDePagoConfigurado, RepositorioMediosDePago, TipoMedioDePago } from "../../core/index";
import { iso } from "./fechas";

type FilaMedio = { tipo: TipoMedioDePago; activo: number; configuracion: string; actualizado_en: string };

export function crearRepositorioMediosDePagoD1(db: D1Database): RepositorioMediosDePago {
  return {
    async obtener<T extends TipoMedioDePago>(tipo: T) {
      const f = await db.prepare("SELECT * FROM medios_de_pago WHERE tipo = ?").bind(tipo).first<FilaMedio>();
      if (f === null) return null;
      // La configuración la validó core al guardarla.
      return {
        tipo: f.tipo,
        activo: f.activo === 1,
        configuracion: JSON.parse(f.configuracion),
        actualizadoEn: new Date(f.actualizado_en),
      } as Extract<MedioDePagoConfigurado, { tipo: T }>;
    },

    async guardar(m) {
      await db
        .prepare(
          `INSERT INTO medios_de_pago (tipo, activo, configuracion, actualizado_en) VALUES (?, ?, ?, ?)
           ON CONFLICT (tipo) DO UPDATE SET activo = excluded.activo, configuracion = excluded.configuracion, actualizado_en = excluded.actualizado_en`,
        )
        .bind(m.tipo, m.activo ? 1 : 0, JSON.stringify(m.configuracion), iso(m.actualizadoEn))
        .run();
    },
  };
}
