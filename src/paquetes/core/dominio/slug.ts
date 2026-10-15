const FORMATO_SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const LARGO_MAXIMO_SLUG = 80;

/** Convierte un texto libre a kebab-case ascii. Puede devolver vacío si no queda nada utilizable. */
export function generarSlug(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, LARGO_MAXIMO_SLUG)
    .replace(/-+$/g, "");
}

export const esSlugValido = (slug: string): boolean =>
  slug.length > 0 && slug.length <= LARGO_MAXIMO_SLUG && FORMATO_SLUG.test(slug);
