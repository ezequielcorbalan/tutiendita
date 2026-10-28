import type { UpdateKind } from "../domain/update";

/** The hosting service that runs stores of the hosted plan (tutiendita.ar). It only knows its own store. */
export interface HostingClient {
  /**
   * Newest version published for hosted stores and the most serious kind among the ones this store lacks;
   * rejects if the service does not answer.
   */
  latestVersion(): Promise<{ version: string; kind: UpdateKind }>;
  /** Asks the service to redeploy this store with the newest version; rejects if it does not accept. */
  requestUpdate(): Promise<void>;
}
