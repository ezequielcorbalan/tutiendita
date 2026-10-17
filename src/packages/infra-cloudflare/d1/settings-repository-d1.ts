import type { SettingsRepository } from "../../core/index";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { iso } from "./dates";
import { settings } from "./schema";

export function createD1SettingsRepository(db: D1Database): SettingsRepository {
  const orm = drizzle(db);
  return {
    async get(key) {
      const [row] = await orm.select().from(settings).where(eq(settings.key, key));
      return row?.value ?? null;
    },

    async set(key, value, now) {
      const updatedAt = iso(now);
      await orm
        .insert(settings)
        .values({ key, value, updatedAt })
        .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt } });
    },
  };
}
