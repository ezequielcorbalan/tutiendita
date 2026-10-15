import type { RepositorioSesiones, Sesion } from "../../core/index";
import { iso } from "./fechas";

type FilaSesion = {
  id_hash: string;
  tipo: Sesion["tipo"];
  creada_en: string;
  expira_en: string;
  ultimo_uso_en: string;
};

const aSesion = (f: FilaSesion): Sesion => ({
  idHash: f.id_hash,
  tipo: f.tipo,
  creadaEn: new Date(f.creada_en),
  expiraEn: new Date(f.expira_en),
  ultimoUsoEn: new Date(f.ultimo_uso_en),
});

export function crearRepositorioSesionesD1(db: D1Database): RepositorioSesiones {
  return {
    async crear(s) {
      await db
        .prepare(
          "INSERT INTO sesiones (id_hash, tipo, creada_en, expira_en, ultimo_uso_en) VALUES (?, ?, ?, ?, ?)",
        )
        .bind(s.idHash, s.tipo, iso(s.creadaEn), iso(s.expiraEn), iso(s.ultimoUsoEn))
        .run();
    },

    async buscar(idHash) {
      const fila = await db
        .prepare("SELECT * FROM sesiones WHERE id_hash = ?")
        .bind(idHash)
        .first<FilaSesion>();
      return fila === null ? null : aSesion(fila);
    },

    async renovar(idHash, expiraEn, ultimoUsoEn) {
      await db
        .prepare("UPDATE sesiones SET expira_en = ?, ultimo_uso_en = ? WHERE id_hash = ?")
        .bind(iso(expiraEn), iso(ultimoUsoEn), idHash)
        .run();
    },

    async borrar(idHash) {
      await db.prepare("DELETE FROM sesiones WHERE id_hash = ?").bind(idHash).run();
    },

    async borrarTodasMenos(idHash) {
      if (idHash === null) await db.prepare("DELETE FROM sesiones").run();
      else await db.prepare("DELETE FROM sesiones WHERE id_hash <> ?").bind(idHash).run();
    },

    async borrarVencidas(ahora) {
      await db.prepare("DELETE FROM sesiones WHERE expira_en <= ?").bind(iso(ahora)).run();
    },
  };
}
