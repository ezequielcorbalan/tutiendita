import type { Session } from "../packages/core/index";

/** Hono environment: Worker bindings and the session loaded by `loadSession`. */
export type ApiEnv = {
  Bindings: Env;
  Variables: {
    session: Session | null;
    /** The cookie's plain token (only to renew it). */
    sessionToken: string | null;
  };
};
