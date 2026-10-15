import type { Credencial, RepositorioCredenciales } from "../../core/index";
import { fechaONull, iso } from "./fechas";

type FilaCredencial = {
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

const aCredencial = (f: FilaCredencial): Credencial => ({
  id: f.id,
  // D1 devuelve los BLOB como arreglo de números (o ArrayBuffer según el runtime).
  clavePublica: Uint8Array.from(
    f.clave_publica instanceof ArrayBuffer ? new Uint8Array(f.clave_publica) : f.clave_publica,
  ),
  contador: f.contador,
  transportes: JSON.parse(f.transportes) as string[],
  rpId: f.rp_id,
  origen: f.origen,
  tipoDispositivo: f.tipo_dispositivo,
  respaldada: f.respaldada === 1,
  nombre: f.nombre,
  creadaEn: new Date(f.creada_en),
  ultimoUsoEn: fechaONull(f.ultimo_uso_en),
});

export function crearRepositorioCredencialesD1(db: D1Database): RepositorioCredenciales {
  return {
    async listar() {
      const { results } = await db
        .prepare("SELECT * FROM credenciales_passkey ORDER BY creada_en, id")
        .all<FilaCredencial>();
      return results.map(aCredencial);
    },

    async buscarPorId(id) {
      const fila = await db
        .prepare("SELECT * FROM credenciales_passkey WHERE id = ?")
        .bind(id)
        .first<FilaCredencial>();
      return fila === null ? null : aCredencial(fila);
    },

    async guardar(c) {
      // Nunca pisa una credencial existente (su clave pública y contador): el conflicto vuelve como `false`.
      const r = await db
        .prepare(
          `INSERT INTO credenciales_passkey (id, clave_publica, contador, transportes, rp_id, origen, tipo_dispositivo, respaldada, nombre, creada_en, ultimo_uso_en)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (id) DO NOTHING`,
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
          c.ultimoUsoEn === null ? null : iso(c.ultimoUsoEn),
        )
        .run();
      return r.meta.changes === 1;
    },

    async actualizarUso(id, contador, ahora) {
      await db
        .prepare("UPDATE credenciales_passkey SET contador = ?, ultimo_uso_en = ? WHERE id = ?")
        .bind(contador, iso(ahora), id)
        .run();
    },

    async borrarSiNoEsLaUltima(id) {
      const r = await db
        .prepare(
          "DELETE FROM credenciales_passkey WHERE id = ? AND (SELECT count(*) FROM credenciales_passkey) > 1",
        )
        .bind(id)
        .run();
      return r.meta.changes === 1;
    },

    async contar() {
      return (await db.prepare("SELECT count(*) AS n FROM credenciales_passkey").first<number>("n")) ?? 0;
    },
  };
}
