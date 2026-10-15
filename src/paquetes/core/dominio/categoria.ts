import { type ErrorDeDominio, errorDeDominio } from "./errores";
import { err, ok, type Result } from "./result";
import { esSlugValido } from "./slug";

export type Categoria = {
  readonly id: string;
  readonly nombre: string;
  readonly slug: string;
  readonly padreId: string | null;
};

export type EntradaCategoria = { nombre: string; padreId?: string | null };
export type ContextoCategoria = { id: string; slug: string };

export function crearCategoria(
  e: EntradaCategoria,
  ctx: ContextoCategoria,
): Result<Categoria, ErrorDeDominio> {
  const nombre = e.nombre.trim();
  if (nombre === "") {
    return err(errorDeDominio("NOMBRE_VACIO", "La categoría necesita un nombre"));
  }
  if (!esSlugValido(ctx.slug)) {
    return err(errorDeDominio("SLUG_INVALIDO", "El slug no tiene un formato válido", { slug: ctx.slug }));
  }
  return ok(Object.freeze({ id: ctx.id, nombre, slug: ctx.slug, padreId: e.padreId ?? null }));
}
