import type { GithubConnection, ReadyConnection } from "../domain/update";

/** Talks to the GitHub API on behalf of the store's own app. Network or GitHub errors are thrown. */
export interface GithubClient {
  /** Exchanges the `code` GitHub returns when the app is created from the manifest. */
  exchangeManifest(code: string): Promise<{ appId: number; slug: string; privateKeyPem: string }>;
  /** `owner/repo` of each repository the installation can access (checks that the installation belongs to the app). */
  installationRepositories(c: GithubConnection & { installationId: number }): Promise<string[]>;
  /** Version (`package.json`) on the official repo's `main`. */
  officialVersion(c: ReadyConnection, officialRepo: string): Promise<string>;
  /**
   * Opens a pull request in the store's repo with the official repo's changed files, without touching
   * `preserve`. Returns `null` if there is nothing to change.
   */
  prepareUpdate(
    c: ReadyConnection,
    p: { officialRepo: string; version: string; preserve: readonly string[] },
  ): Promise<{ number: number; url: string; files: number } | null>;
  /** Merges the pull request (squash): Cloudflare redeploys on its own with the push to the main branch. */
  applyUpdate(c: ReadyConnection, number: number): Promise<void>;
}

/** A single connection per store. */
export interface GithubConnectionRepository {
  get(): Promise<GithubConnection | null>;
  save(c: GithubConnection, now: Date): Promise<void>;
}
