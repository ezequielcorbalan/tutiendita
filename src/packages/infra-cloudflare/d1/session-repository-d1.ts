import type { Session, SessionRepository } from "../../core/index";
import { iso } from "./dates";

type SessionRow = {
  id_hash: string;
  tipo: Session["type"];
  creada_en: string;
  expira_en: string;
  ultimo_uso_en: string;
};

const toSession = (r: SessionRow): Session => ({
  idHash: r.id_hash,
  type: r.tipo,
  createdAt: new Date(r.creada_en),
  expiresAt: new Date(r.expira_en),
  lastUsedAt: new Date(r.ultimo_uso_en),
});

export function createD1SessionRepository(db: D1Database): SessionRepository {
  return {
    async create(s) {
      await db
        .prepare(
          "INSERT INTO sesiones (id_hash, tipo, creada_en, expira_en, ultimo_uso_en) VALUES (?, ?, ?, ?, ?)",
        )
        .bind(s.idHash, s.type, iso(s.createdAt), iso(s.expiresAt), iso(s.lastUsedAt))
        .run();
    },

    async findByHash(idHash) {
      const row = await db
        .prepare("SELECT * FROM sesiones WHERE id_hash = ?")
        .bind(idHash)
        .first<SessionRow>();
      return row === null ? null : toSession(row);
    },

    async renew(idHash, expiresAt, lastUsedAt) {
      await db
        .prepare("UPDATE sesiones SET expira_en = ?, ultimo_uso_en = ? WHERE id_hash = ?")
        .bind(iso(expiresAt), iso(lastUsedAt), idHash)
        .run();
    },

    async remove(idHash) {
      await db.prepare("DELETE FROM sesiones WHERE id_hash = ?").bind(idHash).run();
    },

    async deleteAllExcept(idHash) {
      if (idHash === null) await db.prepare("DELETE FROM sesiones").run();
      else await db.prepare("DELETE FROM sesiones WHERE id_hash <> ?").bind(idHash).run();
    },

    async deleteExpired(now) {
      await db.prepare("DELETE FROM sesiones WHERE expira_en <= ?").bind(iso(now)).run();
    },
  };
}
