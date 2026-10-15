import { type ErrorDeDominio, errorDeDominio } from "../dominio/errores";
import type { Producto } from "../dominio/producto";
import { err, ok, type Result } from "../dominio/result";
import type { RepositorioProductos } from "../puertos/repositorio-productos";

/** Para el público: solo existe lo publicado. Borradores y pausados responden como no encontrados. */
export const obtenerProducto =
  (deps: { repo: RepositorioProductos }) =>
  async (slug: string): Promise<Result<Producto, ErrorDeDominio>> => {
    const p = await deps.repo.buscarPorSlug(slug);
    if (p === null || p.estado !== "publicado") {
      return err(
        errorDeDominio("PRODUCTO_NO_ENCONTRADO", "No existe un producto publicado con ese slug", { slug }),
      );
    }
    return ok(p);
  };
