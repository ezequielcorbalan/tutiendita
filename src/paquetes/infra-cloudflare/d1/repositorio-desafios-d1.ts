import { type Desafio, DURACION_DESAFIO, type RepositorioDesafios } from "../../core/index";
import { iso } from "./fechas";

type FilaDesafio = {
  id: string;
  desafio: string;
  proposito: Desafio["proposito"];
  sesion_id_hash: string | null;
  webauthn_user_id: string | null;
  expira_en: string;
};

export function crearRepositorioDesafiosD1(db: D1Database): RepositorioDesafios {
  return {
    async guardar(d) {
      // El momento de creación del desafío, derivado de su vencimiento (sin leer el reloj acá).
      const ahora = iso(new Date(d.expiraEn.getTime() - DURACION_DESAFIO));
      await db.batch([
        // Limpieza oportunista de los vencidos (sin cron).
        db.prepare("DELETE FROM desafios_webauthn WHERE expira_en <= ?").bind(ahora),
        db
          .prepare(
            "INSERT INTO desafios_webauthn (id, desafio, proposito, sesion_id_hash, webauthn_user_id, expira_en) VALUES (?, ?, ?, ?, ?, ?)",
          )
          .bind(d.id, d.desafio, d.proposito, d.sesionIdHash, d.webauthnUserId, iso(d.expiraEn)),
      ]);
    },

    async consumir(id) {
      // Una sola sentencia: dos pedidos con el mismo id no pueden usarlo los dos.
      const f = await db
        .prepare("DELETE FROM desafios_webauthn WHERE id = ? RETURNING *")
        .bind(id)
        .first<FilaDesafio>();
      if (f === null) return null;
      return {
        id: f.id,
        desafio: f.desafio,
        proposito: f.proposito,
        sesionIdHash: f.sesion_id_hash,
        webauthnUserId: f.webauthn_user_id,
        expiraEn: new Date(f.expira_en),
      };
    },
  };
}
