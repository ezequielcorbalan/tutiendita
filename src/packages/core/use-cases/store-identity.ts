import {
  type BrandColorId,
  brandColorById,
  DEFAULT_BRAND_COLOR,
  validateBrandColor,
} from "../domain/brand-color";
import { type DomainError, domainError } from "../domain/errors";
import { err, ok, type Result } from "../domain/result";
import { BRAND_COLOR } from "../domain/settings";
import { rename, type Store, withDescription, withLogo } from "../domain/store";
import type { Clock } from "../ports/clock";
import type { ImageStorage } from "../ports/image-storage";
import type { SettingsRepository } from "../ports/settings-repository";
import type { StoreRepository } from "../ports/store-repository";
import { type Upload, validateImage } from "./product-gallery";

export type StoreIdentityDeps = {
  readonly store: StoreRepository;
  readonly settings: SettingsRepository;
  readonly images: ImageStorage;
  readonly clock: Clock;
  /** Largest logo accepted, in bytes: the same cap as product photos. Default `MAX_IMAGE_SIZE`. */
  readonly maxImageSize?: number;
};

export type StoreIdentityInput = {
  readonly name: string;
  readonly description: string;
  readonly color: string;
  /** A new logo (replaces the current one). */
  readonly logo?: Upload | undefined;
  /** Take the current logo off (ignored when `logo` is sent). */
  readonly removeLogo?: boolean;
};

export type StoreIdentity = { readonly store: Store; readonly color: BrandColorId };

/** A logo that was replaced or removed; its file may already be gone. */
async function forget(images: ImageStorage, key: string): Promise<void> {
  try {
    await images.remove(key);
  } catch {
    // best-effort: the store no longer points at it
  }
}

/**
 * Name, tagline, brand colour and logo from the panel. Everything is validated before any side effect;
 * the logo goes through the same checks as product photos (format, size, byte signature).
 */
export const updateStoreIdentity =
  (deps: StoreIdentityDeps) =>
  async (e: StoreIdentityInput): Promise<Result<StoreIdentity, DomainError>> => {
    const current = await deps.store.get();
    if (current === null) {
      return err(domainError("INVALID_STEP", "Choose the store name in the first steps before this"));
    }
    const renamed = rename(current, e.name);
    if (!renamed.ok) return renamed;
    const described = withDescription(renamed.value, e.description);
    if (!described.ok) return described;
    const color = validateBrandColor(e.color);
    if (!color.ok) return color;
    if (e.logo !== undefined) {
      const valid = validateImage(e.logo, deps.maxImageSize);
      if (!valid.ok) return valid;
    }

    const previous = current.logoKey;
    const uploaded =
      e.logo !== undefined ? (await deps.images.save(e.logo.bytes, e.logo.mimeType)).key : null;
    const logoKey = uploaded ?? (e.removeLogo === true ? null : previous);
    const store = withLogo(described.value, logoKey);
    const now = deps.clock.now();
    try {
      await deps.store.save(store, now);
    } catch (error) {
      // best-effort: reporting the original error takes priority
      if (uploaded !== null) await forget(deps.images, uploaded);
      throw error;
    }
    if (previous !== null && logoKey !== previous) await forget(deps.images, previous);
    await deps.settings.set(BRAND_COLOR, color.value, now);
    return ok({ store, color: color.value });
  };

/** The stored brand colour; the default when unset or no longer in the palette. */
export const getBrandColor =
  (deps: Pick<StoreIdentityDeps, "settings">) => async (): Promise<BrandColorId> => {
    const stored = await deps.settings.get(BRAND_COLOR);
    return stored === null ? DEFAULT_BRAND_COLOR : (brandColorById(stored)?.id ?? DEFAULT_BRAND_COLOR);
  };
