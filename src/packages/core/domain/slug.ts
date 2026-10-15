const SLUG_FORMAT = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const MAX_SLUG_LENGTH = 80;

/** Converts free text to ASCII kebab-case. May return empty if nothing usable is left. */
export function generateSlug(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/g, "");
}

export const isValidSlug = (slug: string): boolean =>
  slug.length > 0 && slug.length <= MAX_SLUG_LENGTH && SLUG_FORMAT.test(slug);
