import type {
  AccessRepository,
  AccessState,
  AllowedOrigin,
  Credential,
  OnboardingStep,
} from "../../core/index";
import { dateOrNull, iso } from "./dates";

type AccessRow = {
  webauthn_user_id: string;
  reclamada_en: string;
  primer_ingreso_paso: OnboardingStep;
  primer_ingreso_completado_en: string | null;
};

type OriginRow = { origen: string; rp_id: string; principal: number };

/** INSERT of a credential that only runs if `condition` holds (its parameters go last). */
const insertCredentialIf = (db: D1Database, c: Credential, condition: string, ...params: string[]) =>
  db
    .prepare(
      `INSERT INTO credenciales_passkey (id, clave_publica, contador, transportes, rp_id, origen, tipo_dispositivo, respaldada, nombre, creada_en, ultimo_uso_en)
       SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL WHERE ${condition}`,
    )
    .bind(
      c.id,
      c.publicKeyBytes,
      c.counter,
      JSON.stringify(c.transports),
      c.rpId,
      c.origin,
      c.deviceType,
      c.backedUp ? 1 : 0,
      c.name,
      iso(c.createdAt),
      ...params,
    );

/**
 * Raw SQL on D1 (not Drizzle): the claim needs a `batch` of conditional statements, which is the only
 * kind of transaction D1 offers.
 */
export function createD1AccessRepository(db: D1Database): AccessRepository {
  return {
    async get(): Promise<AccessState | null> {
      const row = await db
        .prepare(
          "SELECT webauthn_user_id, reclamada_en, primer_ingreso_paso, primer_ingreso_completado_en FROM acceso WHERE id = 1",
        )
        .first<AccessRow>();
      if (row === null) return null;
      return {
        webauthnUserId: row.webauthn_user_id,
        claimedAt: new Date(row.reclamada_en),
        onboardingStep: row.primer_ingreso_paso,
        onboardingCompletedAt: dateOrNull(row.primer_ingreso_completado_en),
      };
    },

    async claim(d) {
      const now = iso(d.now);
      // Every statement after the first only runs if the access row belongs to this claim
      // (its webauthn_user_id is random): if someone else won, the batch changes nothing else.
      const isThisClaim = "EXISTS (SELECT 1 FROM acceso WHERE webauthn_user_id = ?)";
      const results = await db.batch([
        db
          .prepare(
            `INSERT INTO acceso (id, webauthn_user_id, reclamada_en, codigo_recuperacion_hash, codigo_recuperacion_creado_en, primer_ingreso_paso)
             SELECT 1, ?, ?, ?, ?, 'acceso' WHERE NOT EXISTS (SELECT 1 FROM acceso)`,
          )
          .bind(d.webauthnUserId, now, d.recoveryCodeHash, now),
        // Emergency plan: if the access row was deleted, whatever the previous owner left is no longer valid.
        db.prepare(`DELETE FROM credenciales_passkey WHERE ${isThisClaim}`).bind(d.webauthnUserId),
        db.prepare(`DELETE FROM origenes_permitidos WHERE ${isThisClaim}`).bind(d.webauthnUserId),
        db.prepare(`DELETE FROM sesiones WHERE ${isThisClaim}`).bind(d.webauthnUserId),
        db
          .prepare(
            `INSERT INTO origenes_permitidos (origen, rp_id, principal, agregado_en) SELECT ?, ?, 1, ? WHERE ${isThisClaim}`,
          )
          .bind(d.origin.origin, d.origin.rpId, now, d.webauthnUserId),
        insertCredentialIf(db, d.credential, isThisClaim, d.webauthnUserId),
      ]);
      return results[0]?.meta.changes === 1;
    },

    async startRecovery(hash, session) {
      const validCode = "EXISTS (SELECT 1 FROM acceso WHERE id = 1 AND codigo_recuperacion_hash = ?)";
      const results = await db.batch([
        db.prepare(`DELETE FROM sesiones WHERE ${validCode}`).bind(hash),
        db
          .prepare(
            `INSERT INTO sesiones (id_hash, tipo, creada_en, expira_en, ultimo_uso_en) SELECT ?, ?, ?, ?, ? WHERE ${validCode}`,
          )
          .bind(
            session.idHash,
            session.type,
            iso(session.createdAt),
            iso(session.expiresAt),
            iso(session.lastUsedAt),
            hash,
          ),
      ]);
      return results[1]?.meta.changes === 1;
    },

    async finishRecovery(d) {
      const now = iso(d.now);
      // The first UPDATE only runs if the recovery session is still alive; the rest, only if that UPDATE
      // set the new (random) hash. Since the batch deletes all recovery sessions, a second one cannot win.
      const thisOneWon = "EXISTS (SELECT 1 FROM acceso WHERE id = 1 AND codigo_recuperacion_hash = ?)";
      const results = await db.batch([
        db
          .prepare(
            `UPDATE acceso SET codigo_recuperacion_hash = ?, codigo_recuperacion_creado_en = ?
             WHERE id = 1 AND EXISTS (SELECT 1 FROM sesiones WHERE id_hash = ? AND tipo = 'recuperacion' AND expira_en > ?)`,
          )
          .bind(d.recoveryCodeHash, now, d.sessionIdHash, now),
        insertCredentialIf(db, d.credential, thisOneWon, d.recoveryCodeHash),
        db
          .prepare(`DELETE FROM sesiones WHERE tipo = 'recuperacion' AND ${thisOneWon}`)
          .bind(d.recoveryCodeHash),
      ]);
      return results[0]?.meta.changes === 1;
    },

    async replaceRecoveryCode(hash, now) {
      await db
        .prepare(
          "UPDATE acceso SET codigo_recuperacion_hash = ?, codigo_recuperacion_creado_en = ? WHERE id = 1",
        )
        .bind(hash, iso(now))
        .run();
    },

    async saveOnboarding(step, completedAt) {
      await db
        .prepare("UPDATE acceso SET primer_ingreso_paso = ?, primer_ingreso_completado_en = ? WHERE id = 1")
        .bind(step, completedAt === null ? null : iso(completedAt))
        .run();
    },

    async allowedOrigins(): Promise<AllowedOrigin[]> {
      const { results } = await db
        // Without an access row (emergency plan) the table does not count: the next claim replaces it.
        .prepare(
          "SELECT origen, rp_id, principal FROM origenes_permitidos WHERE EXISTS (SELECT 1 FROM acceso) ORDER BY principal DESC, origen",
        )
        .all<OriginRow>();
      return results.map((r) => ({ origin: r.origen, rpId: r.rp_id, primary: r.principal === 1 }));
    },
  };
}
