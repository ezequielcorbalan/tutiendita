import { type DomainError, domainError } from "../domain/errors";
import { err, ok, type Result } from "../domain/result";
import {
  isNewer,
  isReady,
  OFFICIAL_REPO,
  PRESERVED_FILES,
  type ReadyConnection,
  type UpdateStatus,
} from "../domain/update";
import type { Clock } from "../ports/clock";
import type { GithubClient, GithubConnectionRepository } from "../ports/github";

export type UpdatesDeps = {
  readonly connection: GithubConnectionRepository;
  readonly github: GithubClient;
  readonly clock: Clock;
};

const notConnected = () =>
  err(domainError("GITHUB_NOT_CONNECTED", "Connect the store to its GitHub repository first"));

/** Any GitHub call can fail due to network, permissions or limits: the panel shows the notice, not a 500 error. */
async function withGithub<T>(f: () => Promise<T>): Promise<Result<T, DomainError>> {
  try {
    return ok(await f());
  } catch (cause) {
    return err(
      domainError("GITHUB_NOT_RESPONDING", "GitHub did not respond as expected; try again in a while", {
        cause: String(cause),
      }),
    );
  }
}

async function readyConnection(deps: UpdatesDeps): Promise<ReadyConnection | null> {
  const c = await deps.connection.get();
  return c && isReady(c) ? c : null;
}

export const updateStatus =
  (deps: UpdatesDeps) =>
  async (current: string): Promise<Result<UpdateStatus, DomainError>> => {
    const c = await deps.connection.get();
    if (c === null) return ok({ status: "not-connected" });
    if (!isReady(c)) return ok({ status: "not-installed", slug: c.slug });
    const newVersion = await withGithub(() => deps.github.officialVersion(c, OFFICIAL_REPO));
    if (!newVersion.ok) return newVersion;
    return ok(
      isNewer(newVersion.value, current)
        ? { status: "update-available", current, newVersion: newVersion.value }
        : { status: "up-to-date", current },
    );
  };

/** Step 1: GitHub created the app from the manifest and returned a single-use `code`. */
export const connectGithub =
  (deps: UpdatesDeps) =>
  async (code: string): Promise<Result<{ slug: string }, DomainError>> => {
    const app = await withGithub(() => deps.github.exchangeManifest(code));
    if (!app.ok) return app;
    await deps.connection.save({ ...app.value, installationId: null, repository: null }, deps.clock.now());
    return ok({ slug: app.value.slug });
  };

/** Step 2: the app is installed; it must see a single repo, the store's. */
export const registerInstallation =
  (deps: UpdatesDeps) =>
  async (installationId: number): Promise<Result<{ repository: string }, DomainError>> => {
    const c = await deps.connection.get();
    if (c === null) return notConnected();
    const repos = await withGithub(() => deps.github.installationRepositories({ ...c, installationId }));
    if (!repos.ok) return repos;
    const [repository, ...others] = repos.value;
    if (repository === undefined || others.length > 0) {
      return err(
        domainError("GITHUB_MULTIPLE_REPOSITORIES", "Give the app access only to the store's repository", {
          repositories: repos.value,
        }),
      );
    }
    await deps.connection.save({ ...c, installationId, repository }, deps.clock.now());
    return ok({ repository });
  };

/** Opens the pull request with the new version. The person reviews it and decides whether to apply it. */
export const prepareUpdate =
  (deps: UpdatesDeps) =>
  async (
    current: string,
  ): Promise<Result<{ number: number; url: string; files: number; version: string }, DomainError>> => {
    const c = await readyConnection(deps);
    if (c === null) return notConnected();
    const version = await withGithub(() => deps.github.officialVersion(c, OFFICIAL_REPO));
    if (!version.ok) return version;
    const alreadyThere = () =>
      err(domainError("ALREADY_UP_TO_DATE", "The store already has the latest version"));
    if (!isNewer(version.value, current)) return alreadyThere();
    const pr = await withGithub(() =>
      deps.github.prepareUpdate(c, {
        officialRepo: OFFICIAL_REPO,
        version: version.value,
        preserve: PRESERVED_FILES,
      }),
    );
    if (!pr.ok) return pr;
    if (pr.value === null) return alreadyThere();
    return ok({ ...pr.value, version: version.value });
  };

/** Merges the pull request; the push to the main branch makes Cloudflare redeploy and migrate. */
export const applyUpdate =
  (deps: UpdatesDeps) =>
  async (number: number): Promise<Result<{ number: number }, DomainError>> => {
    const c = await readyConnection(deps);
    if (c === null) return notConnected();
    const r = await withGithub(() => deps.github.applyUpdate(c, number));
    return r.ok ? ok({ number }) : r;
  };
