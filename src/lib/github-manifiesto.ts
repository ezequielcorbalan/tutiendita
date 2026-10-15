/** Cookie con el `state` del manifiesto: protege la vuelta desde GitHub contra CSRF (el flujo dura una hora). */
export const COOKIE_ESTADO_GITHUB = "tiendita_github";
export const VIGENCIA_DEL_ESTADO_SEGUNDOS = 3600;

const aSlug = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/**
 * Manifiesto de la GitHub App propia de la tienda. El nombre tiene que ser único en todo GitHub y de hasta
 * 34 caracteres: `tiendita-<nombre>-<sufijo>`. Solo puede leer y escribir el código y abrir pull requests.
 */
export function manifiestoDeLaApp(p: { origen: string; nombreDeLaTienda: string; sufijo: string }) {
  const nombre = `${`tiendita-${aSlug(p.nombreDeLaTienda)}`.slice(0, 28).replace(/-+$/, "")}-${p.sufijo}`;
  return {
    name: nombre,
    url: p.origen,
    description: `Actualiza ${p.origen} con las versiones nuevas de tutiendita.`,
    hook_attributes: { url: p.origen, active: false },
    redirect_url: `${p.origen}/panel/actualizaciones/github`,
    setup_url: `${p.origen}/panel/actualizaciones/instalada`,
    public: false,
    default_permissions: { contents: "write", pull_requests: "write", metadata: "read" },
    default_events: [],
  };
}

export const aleatorio = (bytes: number): string =>
  [...crypto.getRandomValues(new Uint8Array(bytes))].map((b) => b.toString(16).padStart(2, "0")).join("");
