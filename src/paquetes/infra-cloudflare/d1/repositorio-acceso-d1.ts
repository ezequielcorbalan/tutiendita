import type {
  Credencial,
  EstadoDelAcceso,
  OrigenPermitido,
  PasoPrimerIngreso,
  RepositorioAcceso,
} from "../../core/index";
import { fechaONull, iso } from "./fechas";

type FilaAcceso = {
  webauthn_user_id: string;
  reclamada_en: string;
  primer_ingreso_paso: PasoPrimerIngreso;
  primer_ingreso_completado_en: string | null;
};

type FilaOrigen = { origen: string; rp_id: string; principal: number };

/** INSERT de una credencial que solo actúa si se cumple `condicion` (con sus parámetros al final). */
const insertarCredencialSi = (db: D1Database, c: Credencial, condicion: string, ...params: string[]) =>
  db
    .prepare(
      `INSERT INTO credenciales_passkey (id, clave_publica, contador, transportes, rp_id, origen, tipo_dispositivo, respaldada, nombre, creada_en, ultimo_uso_en)
       SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL WHERE ${condicion}`,
    )
    .bind(
      c.id,
      c.clavePublica,
      c.contador,
      JSON.stringify(c.transportes),
      c.rpId,
      c.origen,
      c.tipoDispositivo,
      c.respaldada ? 1 : 0,
      c.nombre,
      iso(c.creadaEn),
      ...params,
    );

/**
 * SQL directo sobre D1 (no Drizzle): el reclamo necesita un `batch` con sentencias condicionadas, que es
 * la única forma de transacción que ofrece D1.
 */
export function crearRepositorioAccesoD1(db: D1Database): RepositorioAcceso {
  return {
    async obtener(): Promise<EstadoDelAcceso | null> {
      const fila = await db
        .prepare(
          "SELECT webauthn_user_id, reclamada_en, primer_ingreso_paso, primer_ingreso_completado_en FROM acceso WHERE id = 1",
        )
        .first<FilaAcceso>();
      if (fila === null) return null;
      return {
        webauthnUserId: fila.webauthn_user_id,
        reclamadaEn: new Date(fila.reclamada_en),
        pasoPrimerIngreso: fila.primer_ingreso_paso,
        primerIngresoCompletadoEn: fechaONull(fila.primer_ingreso_completado_en),
      };
    },

    async reclamar(d) {
      const ahora = iso(d.ahora);
      // Todas las sentencias después de la primera solo actúan si la fila de acceso es la de este reclamo
      // (su webauthn_user_id es aleatorio): si otro ganó, el batch no cambia nada más.
      const esEsteReclamo = "EXISTS (SELECT 1 FROM acceso WHERE webauthn_user_id = ?)";
      const resultados = await db.batch([
        db
          .prepare(
            `INSERT INTO acceso (id, webauthn_user_id, reclamada_en, codigo_recuperacion_hash, codigo_recuperacion_creado_en, primer_ingreso_paso)
             SELECT 1, ?, ?, ?, ?, 'acceso' WHERE NOT EXISTS (SELECT 1 FROM acceso)`,
          )
          .bind(d.webauthnUserId, ahora, d.codigoRecuperacionHash, ahora),
        // Plan de emergencia: si se borró la fila de acceso, lo que quedó del dueño anterior no sirve más.
        db.prepare(`DELETE FROM credenciales_passkey WHERE ${esEsteReclamo}`).bind(d.webauthnUserId),
        db.prepare(`DELETE FROM origenes_permitidos WHERE ${esEsteReclamo}`).bind(d.webauthnUserId),
        db.prepare(`DELETE FROM sesiones WHERE ${esEsteReclamo}`).bind(d.webauthnUserId),
        db
          .prepare(
            `INSERT INTO origenes_permitidos (origen, rp_id, principal, agregado_en) SELECT ?, ?, 1, ? WHERE ${esEsteReclamo}`,
          )
          .bind(d.origen.origen, d.origen.rpId, ahora, d.webauthnUserId),
        insertarCredencialSi(db, d.credencial, esEsteReclamo, d.webauthnUserId),
      ]);
      return resultados[0]?.meta.changes === 1;
    },

    async iniciarRecuperacion(hash, sesion) {
      const codigoVigente = "EXISTS (SELECT 1 FROM acceso WHERE id = 1 AND codigo_recuperacion_hash = ?)";
      const resultados = await db.batch([
        db.prepare(`DELETE FROM sesiones WHERE ${codigoVigente}`).bind(hash),
        db
          .prepare(
            `INSERT INTO sesiones (id_hash, tipo, creada_en, expira_en, ultimo_uso_en) SELECT ?, ?, ?, ?, ? WHERE ${codigoVigente}`,
          )
          .bind(
            sesion.idHash,
            sesion.tipo,
            iso(sesion.creadaEn),
            iso(sesion.expiraEn),
            iso(sesion.ultimoUsoEn),
            hash,
          ),
      ]);
      return resultados[1]?.meta.changes === 1;
    },

    async completarRecuperacion(d) {
      const ahora = iso(d.ahora);
      // El primer UPDATE solo actúa si la sesión de recuperación sigue viva; el resto, solo si ese UPDATE
      // puso el hash nuevo (aleatorio). Como el batch borra todas las de recuperación, una segunda no gana.
      const ganoEsta = "EXISTS (SELECT 1 FROM acceso WHERE id = 1 AND codigo_recuperacion_hash = ?)";
      const resultados = await db.batch([
        db
          .prepare(
            `UPDATE acceso SET codigo_recuperacion_hash = ?, codigo_recuperacion_creado_en = ?
             WHERE id = 1 AND EXISTS (SELECT 1 FROM sesiones WHERE id_hash = ? AND tipo = 'recuperacion' AND expira_en > ?)`,
          )
          .bind(d.codigoRecuperacionHash, ahora, d.sesionIdHash, ahora),
        insertarCredencialSi(db, d.credencial, ganoEsta, d.codigoRecuperacionHash),
        db
          .prepare(`DELETE FROM sesiones WHERE tipo = 'recuperacion' AND ${ganoEsta}`)
          .bind(d.codigoRecuperacionHash),
      ]);
      return resultados[0]?.meta.changes === 1;
    },

    async reemplazarCodigoDeRecuperacion(hash, ahora) {
      await db
        .prepare(
          "UPDATE acceso SET codigo_recuperacion_hash = ?, codigo_recuperacion_creado_en = ? WHERE id = 1",
        )
        .bind(hash, iso(ahora))
        .run();
    },

    async guardarPrimerIngreso(paso, completadoEn) {
      await db
        .prepare("UPDATE acceso SET primer_ingreso_paso = ?, primer_ingreso_completado_en = ? WHERE id = 1")
        .bind(paso, completadoEn === null ? null : iso(completadoEn))
        .run();
    },

    async origenesPermitidos(): Promise<OrigenPermitido[]> {
      const { results } = await db
        // Sin fila de acceso (plan de emergencia) la tabla no cuenta: el próximo reclamo la reemplaza.
        .prepare(
          "SELECT origen, rp_id, principal FROM origenes_permitidos WHERE EXISTS (SELECT 1 FROM acceso) ORDER BY principal DESC, origen",
        )
        .all<FilaOrigen>();
      return results.map((f) => ({ origen: f.origen, rpId: f.rp_id, principal: f.principal === 1 }));
    },
  };
}
