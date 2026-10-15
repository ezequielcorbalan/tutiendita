import { crearCategoria } from "../dominio/categoria";
import {
  CATALOGO_DE_EJEMPLO,
  descripcionDeEjemplo,
  idDeCategoriaDeEjemplo,
  idDeProductoDeEjemplo,
  MONEDA_DE_EJEMPLO,
  RUBROS_DE_EJEMPLO,
  type RubroDeEjemplo,
  rutaDeFotoDeEjemplo,
} from "../dominio/ejemplos";
import type { ErrorDeDominio } from "../dominio/errores";
import { ok, type Result } from "../dominio/result";
import { generarSlug } from "../dominio/slug";
import { IDIOMA_POR_DEFECTO } from "../dominio/tienda";
import type { RepositorioTienda } from "../puertos/repositorio-tienda";
import { crearProducto, type DepsCrearProducto } from "./crear-producto";

export type DepsProductosDeEjemplo = DepsCrearProducto & {
  tienda: RepositorioTienda;
  /** Bytes de la foto de ejemplo en `ruta` (un asset estático de la app). */
  leerFoto: (ruta: string) => Promise<Uint8Array>;
};

/**
 * Crea las categorías y los productos de ejemplo del rubro, publicados y en el idioma de la tienda. Los ids
 * son fijos: lo que ya existe no se vuelve a crear (cargar dos veces no duplica). Si el dueño ya tiene una
 * categoría con el mismo slug, los productos van a esa. Los slugs de productos se resuelven como en un alta
 * normal (con sufijo si el nombre ya está usado).
 * shortcut: dos cargas simultáneas del mismo rubro pueden dejar una foto huérfana en R2, si molesta, lock en D1.
 */
export const cargarProductosDeEjemplo =
  (deps: DepsProductosDeEjemplo) =>
  async (rubro: RubroDeEjemplo): Promise<Result<{ creados: number }, ErrorDeDominio>> => {
    const idioma = (await deps.tienda.obtener())?.idioma ?? IDIOMA_POR_DEFECTO;
    const existentes = await deps.categorias.listar();
    let creados = 0;
    for (const cat of CATALOGO_DE_EJEMPLO[rubro].categorias) {
      const id = idDeCategoriaDeEjemplo(rubro, cat.clave);
      const slug = generarSlug(cat.nombre[idioma]);
      let categoriaId = (existentes.find((c) => c.id === id) ?? existentes.find((c) => c.slug === slug))?.id;
      if (categoriaId === undefined) {
        const nueva = crearCategoria({ nombre: cat.nombre[idioma] }, { id, slug });
        if (!nueva.ok) return nueva;
        await deps.categorias.guardar(nueva.valor);
        categoriaId = id;
      }
      for (const p of cat.productos) {
        const idProducto = idDeProductoDeEjemplo(rubro, p.clave);
        if ((await deps.repo.buscarPorId(idProducto)) !== null) continue;
        const bytes = await deps.leerFoto(rutaDeFotoDeEjemplo(rubro, p.clave));
        const r = await crearProducto({ ...deps, ids: { nuevoId: () => idProducto } })({
          nombre: p.nombre[idioma],
          descripcion: descripcionDeEjemplo(p, idioma),
          precio: { monto: p.precio, moneda: MONEDA_DE_EJEMPLO },
          imagen: { bytes, tipoMime: "image/webp" },
          categoriaId,
          publicar: true,
        });
        if (!r.ok) return r;
        creados += 1;
      }
    }
    return ok({ creados });
  };

/**
 * Borra todos los productos de ejemplo (de cualquier rubro) con sus fotos, y las categorías de ejemplo que
 * quedaron sin productos (si el dueño les sumó productos propios, se quedan).
 */
export const borrarProductosDeEjemplo =
  (deps: Pick<DepsCrearProducto, "repo" | "categorias" | "imagenes">) =>
  async (): Promise<{ borrados: number }> => {
    let borrados = 0;
    for (const rubro of RUBROS_DE_EJEMPLO) {
      for (const cat of CATALOGO_DE_EJEMPLO[rubro].categorias) {
        for (const p of cat.productos) {
          const producto = await deps.repo.buscarPorId(idDeProductoDeEjemplo(rubro, p.clave));
          if (producto === null) continue;
          await deps.repo.borrar(producto.id);
          for (const img of producto.imagenes) {
            try {
              await deps.imagenes.borrar(img.key);
            } catch {
              // best-effort: el producto ya no está; una foto huérfana en R2 no rompe nada
            }
          }
          borrados += 1;
        }
        await deps.categorias.borrarSiNoTieneProductos(idDeCategoriaDeEjemplo(rubro, cat.clave));
      }
    }
    return { borrados };
  };
