import { WRANGLER_FILE } from "../domain/custom-domain";
import { type DomainError, domainError } from "../domain/errors";
import { bucketNameFor, withProfessionalPhotos } from "../domain/photo-storage";
import { err, ok, type Result } from "../domain/result";
import { PHOTOS_MODE, PHOTOS_REQUESTED_AT } from "../domain/settings";
import type { ReadyConnection } from "../domain/update";
import type { AccessRepository } from "../ports/access-repository";
import type { Clock } from "../ports/clock";
import type { GithubClient, GithubConnectionRepository } from "../ports/github";
import { type ImageStorage, MAX_BASIC_PHOTOS } from "../ports/image-storage";
import type { SettingsRepository } from "../ports/settings-repository";
import { attempt, readyConnection } from "./github-connection";

export type PhotoStorageDeps = {
  readonly settings: SettingsRepository;
  readonly images: ImageStorage;
  readonly connection: GithubConnectionRepository;
  readonly github: GithubClient;
  readonly access: Pick<AccessRepository, "allowedOrigins">;
  readonly clock: Clock;
  /** The Worker has the IMAGENES binding (the redeploy with the bucket already happened). */
  readonly hasBucket: boolean;
};

export type PhotoStorageStatus =
  | { readonly mode: "professional" }
  | {
      readonly mode: "basic";
      readonly used: number;
      readonly max: number;
      readonly github: boolean;
      readonly bucketName: string;
    }
  | {
      readonly mode: "activating";
      readonly since: string;
      /** No binding after the timeout: the deploy failed (R2 not enabled, bucket missing). */
      readonly failed: boolean;
      readonly bucketName: string;
    };

export const ACTIVATION_TIMEOUT_MS = 5 * 60 * 1000;

// shortcut: the worker name is the first label of the primary origin; before the store is claimed, "tiendita".
async function bucketName(deps: PhotoStorageDeps): Promise<string> {
  const primary = (await deps.access.allowedOrigins()).find((o) => o.primary);
  const worker = primary ? new URL(primary.origin).hostname.split(".")[0] : undefined;
  return bucketNameFor(worker || "tiendita");
}

export const photoStorageStatus = (deps: PhotoStorageDeps) => async (): Promise<PhotoStorageStatus> => {
  const mode = await deps.settings.get(PHOTOS_MODE);
  if (deps.hasBucket) {
    if (mode !== "profesional") await deps.settings.set(PHOTOS_MODE, "profesional", deps.clock.now());
    return { mode: "professional" };
  }
  const name = await bucketName(deps);
  if (mode === "activando") {
    const since = (await deps.settings.get(PHOTOS_REQUESTED_AT)) ?? deps.clock.now().toISOString();
    const failed = deps.clock.now().getTime() - new Date(since).getTime() > ACTIVATION_TIMEOUT_MS;
    return { mode: "activating", since, failed, bucketName: name };
  }
  return {
    mode: "basic",
    used: await deps.images.count(),
    max: MAX_BASIC_PHOTOS,
    github: (await readyConnection(deps)) !== null,
    bucketName: name,
  };
};

/** Commits the repo's wrangler.jsonc with professional photos on or off; no commit if nothing changes. */
async function writeBlock(
  deps: PhotoStorageDeps,
  c: ReadyConnection,
  enabled: boolean,
): Promise<Result<void, DomainError>> {
  const file = await attempt("GITHUB_NOT_RESPONDING", () => deps.github.readFile(c, WRANGLER_FILE));
  if (!file.ok) return file;
  if (file.value === null) {
    return err(domainError("R2_ALREADY_SET", `The repository has no ${WRANGLER_FILE}`));
  }
  const text = withProfessionalPhotos(file.value.text, enabled);
  if (!text.ok) return text;
  if (text.value === file.value.text) return ok(undefined);
  // The commit message is for the merchant: it stays in Spanish.
  const message = enabled ? "Activar fotos profesionales y sin límite" : "Volver a fotos básicas";
  const sha = file.value.sha;
  return attempt("GITHUB_NOT_RESPONDING", () =>
    deps.github.writeFile(c, { path: WRANGLER_FILE, text: text.value, sha, message }),
  );
}

/** Asks the repo for the R2 bucket; Cloudflare redeploys and the binding shows up on its own. */
export const enableProfessionalPhotos =
  (deps: PhotoStorageDeps) => async (): Promise<Result<{ bucketName: string }, DomainError>> => {
    const name = await bucketName(deps);
    if (deps.hasBucket) return ok({ bucketName: name });
    const c = await readyConnection(deps);
    if (c === null) {
      return err(domainError("GITHUB_NOT_CONNECTED", "Connect the store to its GitHub repository first"));
    }
    const written = await writeBlock(deps, c, true);
    if (!written.ok) return written;
    const now = deps.clock.now();
    await deps.settings.set(PHOTOS_MODE, "activando", now);
    await deps.settings.set(PHOTOS_REQUESTED_AT, now.toISOString(), now);
    return ok({ bucketName: name });
  };

/** Gives up an activation that didn't finish: takes the block out of the repo and goes back to basic. */
export const revertProfessionalPhotos =
  (deps: PhotoStorageDeps) => async (): Promise<Result<void, DomainError>> => {
    if ((await deps.settings.get(PHOTOS_MODE)) !== "activando") return ok(undefined);
    // The deploy already finished: undoing it would break a working bucket.
    if (deps.hasBucket) {
      await deps.settings.set(PHOTOS_MODE, "profesional", deps.clock.now());
      return ok(undefined);
    }
    const c = await readyConnection(deps);
    if (c === null) {
      return err(domainError("GITHUB_NOT_CONNECTED", "Connect the store to its GitHub repository first"));
    }
    const written = await writeBlock(deps, c, false);
    if (!written.ok) return written;
    await deps.settings.set(PHOTOS_MODE, "basica", deps.clock.now());
    return ok(undefined);
  };
