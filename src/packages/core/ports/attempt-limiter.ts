/**
 * Attempts per key (`reclamo:<ip>`, `recuperacion:<ip>`, `ingreso:<ip>`; stored prefixes stay in Spanish)
 * in fixed 15-minute windows.
 * shortcut: checking and adding are two statements (a burst lets a few extra attempts through) and the key is
 * the IP (many IPs add up quota; behind a CGNAT it is shared), move to a Durable Object or the Workers Rate
 * Limiting binding if real abuse shows up.
 */
export interface AttemptLimiter {
  recordFailure(key: string, now: Date): Promise<void>;
  /** `max` per window; MAX_ATTEMPTS by default. */
  isBlocked(key: string, now: Date, max?: number): Promise<boolean>;
}

export const MAX_ATTEMPTS = 10;
export const ATTEMPT_WINDOW = 15 * 60_000;

/** Start of the window containing `now` (windows start at multiples of 15 minutes). */
export const windowStartOf = (now: Date): Date =>
  new Date(Math.floor(now.getTime() / ATTEMPT_WINDOW) * ATTEMPT_WINDOW);

export const secondsUntilNextWindow = (now: Date): number =>
  Math.ceil((windowStartOf(now).getTime() + ATTEMPT_WINDOW - now.getTime()) / 1000);
