import { claimCodeHash } from "virtual:tiendita/claim";

/**
 * SHA-256 of the last build's claim code (integrations/claim-code.mjs). Only server code imports it:
 * the plugin fails the build if a client script asked for it.
 */
export const codeHash = (): string | null => claimCodeHash || null;
