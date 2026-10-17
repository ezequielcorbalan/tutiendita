import { type DomainError, domainError } from "../domain/errors";
import { err, ok, type Result } from "../domain/result";
import { type Store, withHeartbeat } from "../domain/store";
import type { StoreRegistry } from "../ports/store-registry";
import type { StoreRepository } from "../ports/store-repository";

export type HeartbeatDeps = {
  readonly store: StoreRepository;
  readonly registry: StoreRegistry;
};

/**
 * Marks the store first, then announces: if the registry fails, the next try is tomorrow, not on the next
 * visit. The caller decides when (see `shouldSendHeartbeat`) and runs it off the request's hot path.
 */
export async function sendHeartbeat(deps: HeartbeatDeps, origin: string, now: Date): Promise<void> {
  await deps.store.markHeartbeat(now);
  await deps.registry.announce(origin);
}

export async function setHeartbeatEnabled(
  deps: { readonly store: StoreRepository },
  enabled: boolean,
  now: Date,
): Promise<Result<Store, DomainError>> {
  const current = await deps.store.get();
  if (current === null) return err(domainError("INVALID_STEP", "Choose the store name first"));
  await deps.store.setHeartbeat(enabled, now);
  return ok(withHeartbeat(current, enabled));
}
