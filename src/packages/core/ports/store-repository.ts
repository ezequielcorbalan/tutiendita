import type { Store } from "../domain/store";

/** The deployment's store (there is only one). Onboarding writes it. */
export interface StoreRepository {
  /** The configured store, or `null` if the name has not been chosen in onboarding yet. */
  get(): Promise<Store | null>;
  /** Inserts or updates by id; `now` is the update date (and creation date, if new). */
  save(t: Store, now: Date): Promise<void>;
  /** Writes only `heartbeatSentAt`: it must not overwrite a row the owner is saving at the same time. */
  markHeartbeat(sentAt: Date): Promise<void>;
  /** Writes `heartbeatEnabled` (and the update date). */
  setHeartbeat(enabled: boolean, now: Date): Promise<void>;
}
