import type { StoreRegistry } from "../../core/index";

/** Store POST timeout: the call runs in `waitUntil`, but a hung registry must not keep the Worker busy. */
const TIMEOUT_MS = 5000;

/** Announces the store to the registry at `baseUrl` (tutiendita.ar). The body is only `{ url }`. */
export function createRegistryClient(baseUrl: string, fetchFn: typeof fetch = fetch): StoreRegistry {
  return {
    async announce(origin) {
      const res = await fetchFn(`${baseUrl}/api/heartbeat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: origin }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`registry answered ${res.status}`);
    },
  };
}
