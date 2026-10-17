import type { Store } from "./store";

/** A store announces itself to tutiendita.ar at most once a day. */
export const HEARTBEAT_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** True when the store is opted in and the last announcement is at least a day old (or never happened). */
export function shouldSendHeartbeat(
  store: Pick<Store, "heartbeatEnabled" | "heartbeatSentAt">,
  now: Date,
): boolean {
  if (!store.heartbeatEnabled) return false;
  if (store.heartbeatSentAt === null) return true;
  return now.getTime() - new Date(store.heartbeatSentAt).getTime() >= HEARTBEAT_INTERVAL_MS;
}
