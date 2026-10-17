import { type DomainError, domainError } from "../domain/errors";
import { err, ok, type Result } from "../domain/result";
import { isReady, OFFICIAL_REPO, type ReadyConnection } from "../domain/update";
import type { GithubConnectionRepository } from "../ports/github";

/** The store's own repository, if the GitHub app is connected and it isn't the official one. */
export async function readyConnection(deps: {
  readonly connection: GithubConnectionRepository;
}): Promise<ReadyConnection | null> {
  const c = await deps.connection.get();
  return c && isReady(c) && c.repository.toLowerCase() !== OFFICIAL_REPO.toLowerCase() ? c : null;
}

/** Runs `f`; if the outside world throws, it becomes a domain error instead of a crash. */
export async function attempt<T>(code: "GITHUB_NOT_RESPONDING" | "DNS_NOT_RESPONDING", f: () => Promise<T>) {
  try {
    return ok(await f()) as Result<T, DomainError>;
  } catch (cause) {
    const what = code === "DNS_NOT_RESPONDING" ? "DNS" : "GitHub";
    return err(
      domainError(code, `${what} did not respond as expected; try again in a while`, {
        cause: String(cause),
      }),
    );
  }
}
