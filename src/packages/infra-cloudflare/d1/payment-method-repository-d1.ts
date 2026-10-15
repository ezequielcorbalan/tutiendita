import type { ConfiguredPaymentMethod, PaymentMethodRepository, PaymentMethodType } from "../../core/index";
import { iso } from "./dates";

type PaymentMethodRow = {
  tipo: PaymentMethodType;
  activo: number;
  configuracion: string;
  actualizado_en: string;
};

// Existing stores already have `configuracion` JSON with Spanish keys: keep them in D1 and map both ways.
type StoredConfig = Record<string, string>;

const toStored = (m: ConfiguredPaymentMethod): StoredConfig =>
  m.type === "whatsapp"
    ? { numero: m.config.number, plantilla: m.config.template }
    : { tipoDeCuenta: m.config.accountType, cuenta: m.config.account, titular: m.config.holder };

const fromStored = (type: PaymentMethodType, c: StoredConfig) =>
  type === "whatsapp"
    ? { number: c.numero, template: c.plantilla }
    : { accountType: c.tipoDeCuenta, account: c.cuenta, holder: c.titular };

export function createD1PaymentMethodRepository(db: D1Database): PaymentMethodRepository {
  return {
    async get<T extends PaymentMethodType>(type: T) {
      const row = await db
        .prepare("SELECT * FROM medios_de_pago WHERE tipo = ?")
        .bind(type)
        .first<PaymentMethodRow>();
      if (row === null) return null;
      // Core validated the config when it was saved.
      return {
        type: row.tipo,
        active: row.activo === 1,
        config: fromStored(row.tipo, JSON.parse(row.configuracion)),
        updatedAt: new Date(row.actualizado_en),
      } as Extract<ConfiguredPaymentMethod, { type: T }>;
    },

    async save(m) {
      await db
        .prepare(
          `INSERT INTO medios_de_pago (tipo, activo, configuracion, actualizado_en) VALUES (?, ?, ?, ?)
           ON CONFLICT (tipo) DO UPDATE SET activo = excluded.activo, configuracion = excluded.configuracion, actualizado_en = excluded.actualizado_en`,
        )
        .bind(m.type, m.active ? 1 : 0, JSON.stringify(toStored(m)), iso(m.updatedAt))
        .run();
    },
  };
}
