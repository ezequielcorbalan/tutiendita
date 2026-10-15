import type { Credential } from "../domain/access";

export interface CredentialRepository {
  list(): Promise<Credential[]>;
  findById(id: string): Promise<Credential | null>;
  /** Inserts; `false` if a credential with that id already exists (never overwrites it). */
  save(c: Credential): Promise<boolean>;
  updateUsage(id: string, counter: number, now: Date): Promise<void>;
  /** Deletes in a single statement and only if another one remains (two racing deletes do not leave zero). */
  deleteUnlessLast(id: string): Promise<boolean>;
  count(): Promise<number>;
}
