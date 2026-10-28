import { type DomainError, domainError } from "../domain/errors";
import { err, ok, type Result } from "../domain/result";
import { isNewer, type UpdateKind } from "../domain/update";
import type { HostingClient } from "../ports/hosting";

export type HostedUpdatesDeps = { readonly hosting: HostingClient };

export type HostedUpdateStatus =
  | { readonly status: "up-to-date"; readonly current: string }
  | {
      readonly status: "update-available";
      readonly current: string;
      readonly newVersion: string;
      readonly kind: UpdateKind;
    };

const notResponding = (cause: unknown) =>
  err(
    domainError("HOSTING_NOT_RESPONDING", "The hosting service did not answer; try again in a while", {
      cause: String(cause),
    }),
  );

/** Hosted plan: is there a newer version than `current`? A hosted store has no GitHub repository to ask. */
export const hostedUpdateStatus =
  (deps: HostedUpdatesDeps) =>
  async (current: string): Promise<Result<HostedUpdateStatus, DomainError>> => {
    try {
      const latest = await deps.hosting.latestVersion();
      return ok(
        isNewer(latest.version, current)
          ? { status: "update-available", current, newVersion: latest.version, kind: latest.kind }
          : { status: "up-to-date", current },
      );
    } catch (cause) {
      return notResponding(cause);
    }
  };

/** Hosted plan: the owner pressed Update; the service redeploys the store (and migrates its database). */
export const requestHostedUpdate =
  (deps: HostedUpdatesDeps) => async (): Promise<Result<void, DomainError>> => {
    try {
      await deps.hosting.requestUpdate();
      return ok(undefined);
    } catch (cause) {
      return notResponding(cause);
    }
  };
