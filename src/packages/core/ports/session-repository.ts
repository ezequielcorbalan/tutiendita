import type { Session } from "../domain/access";

export interface SessionRepository {
  create(s: Session): Promise<void>;
  findByHash(idHash: string): Promise<Session | null>;
  renew(idHash: string, expiresAt: Date, lastUsedAt: Date): Promise<void>;
  remove(idHash: string): Promise<void>;
  /** Deletes all sessions except `idHash` (or all of them, with `null`). */
  deleteAllExcept(idHash: string | null): Promise<void>;
  deleteExpired(now: Date): Promise<void>;
}
