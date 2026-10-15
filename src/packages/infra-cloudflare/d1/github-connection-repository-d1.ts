import type { GithubConnectionRepository } from "../../core/index";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { githubConnection } from "./schema";

export function createD1GithubConnectionRepository(db: D1Database): GithubConnectionRepository {
  const orm = drizzle(db);
  return {
    async get() {
      const [row] = await orm.select().from(githubConnection).where(eq(githubConnection.id, 1)).limit(1);
      return row
        ? Object.freeze({
            appId: row.appId,
            slug: row.slug,
            privateKeyPem: row.privateKeyPem,
            installationId: row.installationId,
            repository: row.repository,
          })
        : null;
    },

    async save(c, now) {
      const columns = { ...c, updatedAt: now.toISOString() };
      await orm
        .insert(githubConnection)
        .values({ id: 1, ...columns })
        .onConflictDoUpdate({ target: githubConnection.id, set: columns });
    },
  };
}
