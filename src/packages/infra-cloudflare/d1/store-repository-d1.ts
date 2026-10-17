import type { Store, StoreRepository } from "../../core/index";
import { asc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { stores } from "./schema";

const toStore = (row: typeof stores.$inferSelect): Store =>
  Object.freeze({
    id: row.id,
    name: row.name,
    description: row.description,
    logoKey: row.logoKey,
    currency: row.currency,
    language: row.language,
    contact: Object.freeze({ whatsapp: row.contactWhatsapp, email: row.contactEmail }),
    domain: row.domain,
    heartbeatEnabled: row.heartbeatEnabled,
    heartbeatSentAt: row.heartbeatSentAt,
  });

/** One row per deployment; if there were more, the first created wins. Written by onboarding. */
export function createD1StoreRepository(db: D1Database): StoreRepository {
  const orm = drizzle(db);
  return {
    async get() {
      const [row] = await orm.select().from(stores).orderBy(asc(stores.createdAt), asc(stores.id)).limit(1);
      return row ? toStore(row) : null;
    },

    async save(s, now) {
      const columns = {
        name: s.name,
        description: s.description,
        logoKey: s.logoKey,
        currency: s.currency,
        language: s.language,
        contactWhatsapp: s.contact.whatsapp,
        contactEmail: s.contact.email,
        domain: s.domain,
        updatedAt: now.toISOString(),
      };
      // The heartbeat columns have their own writers below: an update never overwrites them with a stale copy
      // (e.g. an opt-out saved while a slow domain check was holding an older Store).
      const heartbeat = { heartbeatEnabled: s.heartbeatEnabled, heartbeatSentAt: s.heartbeatSentAt };
      await orm
        .insert(stores)
        .values({ id: s.id, ...columns, ...heartbeat, createdAt: now.toISOString() })
        .onConflictDoUpdate({ target: stores.id, set: columns });
    },

    // Both update the single row, so no `where`: only that column changes.
    async markHeartbeat(sentAt) {
      await orm.update(stores).set({ heartbeatSentAt: sentAt.toISOString() });
    },

    async setHeartbeat(enabled, now) {
      await orm.update(stores).set({ heartbeatEnabled: enabled, updatedAt: now.toISOString() });
    },
  };
}
