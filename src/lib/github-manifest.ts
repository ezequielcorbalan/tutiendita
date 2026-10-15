/** Cookie with the manifest `state`: protects the return from GitHub against CSRF (the flow lasts an hour). */
export const GITHUB_STATE_COOKIE = "tiendita_github";
export const STATE_TTL_SECONDS = 3600;

const toSlug = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/**
 * Manifest of the store's own GitHub App. The name must be unique across GitHub and up to 34
 * characters: `tiendita-<name>-<suffix>`. It can only read and write the code and open pull requests.
 */
export function appManifest(p: { origin: string; storeName: string; suffix: string }) {
  const name = `${`tiendita-${toSlug(p.storeName)}`.slice(0, 28).replace(/-+$/, "")}-${p.suffix}`;
  return {
    name: name,
    url: p.origin,
    // Shown to the merchant on GitHub: user text, stays in Spanish.
    description: `Actualiza ${p.origin} con las versiones nuevas de tutiendita.`,
    hook_attributes: { url: p.origin, active: false },
    redirect_url: `${p.origin}/panel/actualizaciones/github`,
    setup_url: `${p.origin}/panel/actualizaciones/instalada`,
    public: false,
    default_permissions: { contents: "write", pull_requests: "write", metadata: "read" },
    default_events: [],
  };
}

export const random = (bytes: number): string =>
  [...crypto.getRandomValues(new Uint8Array(bytes))].map((b) => b.toString(16).padStart(2, "0")).join("");
