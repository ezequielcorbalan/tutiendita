import type { Credential, CredentialRepository } from "../../core/index";
import { dateOrNull, iso } from "./dates";

type CredentialRow = {
  id: string;
  clave_publica: ArrayBuffer | number[];
  contador: number;
  transportes: string;
  rp_id: string;
  origen: string;
  tipo_dispositivo: string;
  respaldada: number;
  nombre: string;
  creada_en: string;
  ultimo_uso_en: string | null;
};

const toCredential = (r: CredentialRow): Credential => ({
  id: r.id,
  // D1 returns BLOBs as a number array (or an ArrayBuffer, depending on the runtime).
  publicKeyBytes: Uint8Array.from(
    r.clave_publica instanceof ArrayBuffer ? new Uint8Array(r.clave_publica) : r.clave_publica,
  ),
  counter: r.contador,
  transports: JSON.parse(r.transportes) as string[],
  rpId: r.rp_id,
  origin: r.origen,
  deviceType: r.tipo_dispositivo,
  backedUp: r.respaldada === 1,
  name: r.nombre,
  createdAt: new Date(r.creada_en),
  lastUsedAt: dateOrNull(r.ultimo_uso_en),
});

export function createD1CredentialRepository(db: D1Database): CredentialRepository {
  return {
    async list() {
      const { results } = await db
        .prepare("SELECT * FROM credenciales_passkey ORDER BY creada_en, id")
        .all<CredentialRow>();
      return results.map(toCredential);
    },

    async findById(id) {
      const row = await db
        .prepare("SELECT * FROM credenciales_passkey WHERE id = ?")
        .bind(id)
        .first<CredentialRow>();
      return row === null ? null : toCredential(row);
    },

    async save(c) {
      // Never overwrites an existing credential (its public key and counter): a conflict returns `false`.
      const r = await db
        .prepare(
          `INSERT INTO credenciales_passkey (id, clave_publica, contador, transportes, rp_id, origen, tipo_dispositivo, respaldada, nombre, creada_en, ultimo_uso_en)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (id) DO NOTHING`,
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
          c.lastUsedAt === null ? null : iso(c.lastUsedAt),
        )
        .run();
      return r.meta.changes === 1;
    },

    async updateUsage(id, counter, now) {
      await db
        .prepare("UPDATE credenciales_passkey SET contador = ?, ultimo_uso_en = ? WHERE id = ?")
        .bind(counter, iso(now), id)
        .run();
    },

    async deleteUnlessLast(id) {
      const r = await db
        .prepare(
          "DELETE FROM credenciales_passkey WHERE id = ? AND (SELECT count(*) FROM credenciales_passkey) > 1",
        )
        .bind(id)
        .run();
      return r.meta.changes === 1;
    },

    async count() {
      return (await db.prepare("SELECT count(*) AS n FROM credenciales_passkey").first<number>("n")) ?? 0;
    },
  };
}
