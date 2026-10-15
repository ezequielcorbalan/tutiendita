import { type LimitadorDeIntentos, MAXIMO_DE_INTENTOS, ventanaDe } from "../../core/index";
import { iso } from "./fechas";

export function crearLimitadorDeIntentosD1(db: D1Database): LimitadorDeIntentos {
  return {
    async registrarFallo(clave, ahora) {
      const ventana = iso(ventanaDe(ahora));
      await db.batch([
        db.prepare("DELETE FROM intentos_fallidos WHERE ventana < ?").bind(ventana),
        db
          .prepare(
            `INSERT INTO intentos_fallidos (clave, ventana, cantidad) VALUES (?, ?, 1)
             ON CONFLICT (clave, ventana) DO UPDATE SET cantidad = cantidad + 1`,
          )
          .bind(clave, ventana),
      ]);
    },

    async estaBloqueado(clave, ahora, maximo = MAXIMO_DE_INTENTOS) {
      const cantidad = await db
        .prepare("SELECT cantidad FROM intentos_fallidos WHERE clave = ? AND ventana = ?")
        .bind(clave, iso(ventanaDe(ahora)))
        .first<number>("cantidad");
      return (cantidad ?? 0) >= maximo;
    },
  };
}
