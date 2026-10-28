import type { HostingClient, UpdateKind } from "../../core/index";

/** Asking for the version runs while the Updates page renders: a slow service must not hold the page. */
const STATUS_TIMEOUT_MS = 5000;
/** Asking for an update queues a redeploy: it may take the service longer to accept. */
const UPDATE_TIMEOUT_MS = 15000;
const KINDS: readonly UpdateKind[] = ["security", "bugfix", "feature"];

/**
 * Talks to the hosting service at `baseUrl`, identifying the store with its own bearer `token`
 * (the service only ever answers about the store that owns the token).
 * Contract: GET /api/self/version → `{ latest, kind }`; POST /api/self/update → 2xx once the redeploy is accepted.
 */
export function createHostingClient(
  baseUrl: string,
  token: string,
  fetchFn: typeof fetch = fetch,
): HostingClient {
  const headers = { authorization: `Bearer ${token}` };
  const url = (path: string) => new URL(path, baseUrl).toString();
  return {
    async latestVersion() {
      const res = await fetchFn(url("/api/self/version"), {
        headers,
        signal: AbortSignal.timeout(STATUS_TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`hosting answered ${res.status}`);
      const body = (await res.json()) as { latest?: unknown; kind?: unknown };
      if (typeof body.latest !== "string") throw new Error("hosting sent no version");
      const kind = KINDS.find((k) => k === body.kind) ?? "feature";
      return { version: body.latest, kind };
    },
    async requestUpdate() {
      const res = await fetchFn(url("/api/self/update"), {
        method: "POST",
        headers,
        signal: AbortSignal.timeout(UPDATE_TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`hosting answered ${res.status}`);
    },
  };
}
