import { CHALLENGE_DURATION, type Challenge, type ChallengeRepository } from "../../core/index";
import { iso } from "./dates";

type ChallengeRow = {
  id: string;
  desafio: string;
  proposito: Challenge["purpose"];
  sesion_id_hash: string | null;
  webauthn_user_id: string | null;
  expira_en: string;
};

export function createD1ChallengeRepository(db: D1Database): ChallengeRepository {
  return {
    async save(d) {
      // The challenge creation time, derived from its expiry (without reading the clock here).
      const now = iso(new Date(d.expiresAt.getTime() - CHALLENGE_DURATION));
      await db.batch([
        // Opportunistic cleanup of expired ones (no cron).
        db.prepare("DELETE FROM desafios_webauthn WHERE expira_en <= ?").bind(now),
        db
          .prepare(
            "INSERT INTO desafios_webauthn (id, desafio, proposito, sesion_id_hash, webauthn_user_id, expira_en) VALUES (?, ?, ?, ?, ?, ?)",
          )
          .bind(d.id, d.challenge, d.purpose, d.sessionIdHash, d.webauthnUserId, iso(d.expiresAt)),
      ]);
    },

    async consume(id) {
      // A single statement: two requests with the same id cannot both use it.
      const row = await db
        .prepare("DELETE FROM desafios_webauthn WHERE id = ? RETURNING *")
        .bind(id)
        .first<ChallengeRow>();
      if (row === null) return null;
      return {
        id: row.id,
        challenge: row.desafio,
        purpose: row.proposito,
        sessionIdHash: row.sesion_id_hash,
        webauthnUserId: row.webauthn_user_id,
        expiresAt: new Date(row.expira_en),
      };
    },
  };
}
