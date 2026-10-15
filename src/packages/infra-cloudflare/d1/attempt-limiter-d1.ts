import { type AttemptLimiter, MAX_ATTEMPTS, windowStartOf } from "../../core/index";
import { iso } from "./dates";

export function createD1AttemptLimiter(db: D1Database): AttemptLimiter {
  return {
    async recordFailure(key, now) {
      const windowStart = iso(windowStartOf(now));
      await db.batch([
        db.prepare("DELETE FROM intentos_fallidos WHERE ventana < ?").bind(windowStart),
        db
          .prepare(
            `INSERT INTO intentos_fallidos (clave, ventana, cantidad) VALUES (?, ?, 1)
             ON CONFLICT (clave, ventana) DO UPDATE SET cantidad = cantidad + 1`,
          )
          .bind(key, windowStart),
      ]);
    },

    async isBlocked(key, now, max = MAX_ATTEMPTS) {
      const quantity = await db
        .prepare("SELECT cantidad FROM intentos_fallidos WHERE clave = ? AND ventana = ?")
        .bind(key, iso(windowStartOf(now)))
        .first<number>("cantidad");
      return (quantity ?? 0) >= max;
    },
  };
}
