import type { Dinero } from "../dominio/dinero";
import { type ErrorDeDominio, errorDeDominio } from "../dominio/errores";
import { bytesCoincidenConMime } from "../dominio/imagen";
import {
  conImagen,
  nuevoProducto as crearProductoDominio,
  type Producto,
  publicar,
  puedePublicarse,
} from "../dominio/producto";
import { err, ok, type Result } from "../dominio/result";
import { esSlugValido, generarSlug, LARGO_MAXIMO_SLUG } from "../dominio/slug";
import { type AlmacenImagenes, MIME_PERMITIDOS, TAMANO_MAXIMO_IMAGEN } from "../puertos/almacen-imagenes";
import type { GeneradorIds } from "../puertos/generador-ids";
import type { Reloj } from "../puertos/reloj";
import type { RepositorioCategorias } from "../puertos/repositorio-categorias";
import { type RepositorioProductos, SlugDuplicadoError } from "../puertos/repositorio-productos";

export type EntradaCrearProducto = {
  nombre: string;
  descripcion?: string;
  precio: Dinero;
  imagen?: { bytes: Uint8Array; tipoMime: string };
  categoriaId?: string | null;
  stock?: number | null;
  publicar?: boolean;
};

export type DepsCrearProducto = {
  repo: RepositorioProductos;
  categorias: RepositorioCategorias;
  imagenes: AlmacenImagenes;
  reloj: Reloj;
  ids: GeneradorIds;
};

const MAX_INTENTOS_SLUG = 50;
/** Intentos de `repo.guardar` ante `SlugDuplicadoError` (carrera entre dos altas con el mismo nombre). */
const MAX_INTENTOS_GUARDAR = 3;

/** MIME permitido, tamaño máximo y que los bytes tengan la firma del MIME declarado. */
function validarImagen(img: { bytes: Uint8Array; tipoMime: string }): Result<true, ErrorDeDominio> {
  if (!(MIME_PERMITIDOS as readonly string[]).includes(img.tipoMime)) {
    return err(
      errorDeDominio("IMAGEN_INVALIDA", "Formato de imagen no permitido", {
        tipoMime: img.tipoMime,
        permitidos: [...MIME_PERMITIDOS],
      }),
    );
  }
  if (img.bytes.byteLength > TAMANO_MAXIMO_IMAGEN) {
    return err(
      errorDeDominio("IMAGEN_INVALIDA", "La imagen supera el tamaño máximo", {
        bytes: img.bytes.byteLength,
        maximo: TAMANO_MAXIMO_IMAGEN,
      }),
    );
  }
  if (!bytesCoincidenConMime(img.bytes, img.tipoMime)) {
    return err(
      errorDeDominio("IMAGEN_INVALIDA", "El contenido del archivo no es una imagen del tipo declarado", {
        tipoMime: img.tipoMime,
      }),
    );
  }
  return ok(true);
}

/** `base` con sufijo `-n` (n > 1), recortando la base para no pasar el largo máximo del slug. */
const candidatoSlug = (base: string, n: number): string => {
  if (n === 1) return base;
  const sufijo = `-${n}`;
  return base.slice(0, LARGO_MAXIMO_SLUG - sufijo.length).replace(/-+$/, "") + sufijo;
};

/** Primer slug libre para `nombre`, probando sufijos desde `desde` (1 = sin sufijo). */
async function resolverSlugUnico(
  nombre: string,
  repo: RepositorioProductos,
  desde = 1,
): Promise<Result<{ slug: string; n: number }, ErrorDeDominio>> {
  const base = generarSlug(nombre);
  if (!esSlugValido(base)) {
    return err(errorDeDominio("SLUG_INVALIDO", "El nombre no produce un slug válido", { nombre }));
  }
  for (let n = desde; n <= MAX_INTENTOS_SLUG; n += 1) {
    const candidato = candidatoSlug(base, n);
    if (!(await repo.existeSlug(candidato))) return ok({ slug: candidato, n });
  }
  return err(errorDeDominio("SLUG_INVALIDO", "No se pudo generar un slug único", { nombre }));
}

/**
 * Orden: validar todo lo que se pueda sin efectos (imagen, categoría, slug, reglas de publicación)
 * y recién entonces subir la imagen y guardar. Si `repo.guardar` lanza, se borra la imagen subida
 * (best-effort: si R2 también falla, puede quedar un objeto huérfano) y se relanza el error original.
 * Si lanza `SlugDuplicadoError` (otra alta ganó la carrera por el slug), se recalcula el slug y se
 * reintenta hasta MAX_INTENTOS_GUARDAR veces, reusando la imagen ya subida.
 */
export const crearProducto =
  (deps: DepsCrearProducto) =>
  async (e: EntradaCrearProducto): Promise<Result<Producto, ErrorDeDominio>> => {
    if (e.imagen !== undefined) {
      const v = validarImagen(e.imagen);
      if (!v.ok) return v;
    }
    if (e.categoriaId !== undefined && e.categoriaId !== null) {
      const cat = await deps.categorias.buscarPorId(e.categoriaId);
      if (cat === null) {
        return err(
          errorDeDominio("CATEGORIA_NO_ENCONTRADA", "La categoría no existe", { categoriaId: e.categoriaId }),
        );
      }
    }
    const slug = await resolverSlugUnico(e.nombre, deps.repo);
    if (!slug.ok) return slug;

    const ahora = deps.reloj.ahora();
    const base = crearProductoDominio(
      {
        nombre: e.nombre,
        precio: e.precio,
        ...(e.descripcion !== undefined ? { descripcion: e.descripcion } : {}),
        ...(e.categoriaId !== undefined ? { categoriaId: e.categoriaId } : {}),
        ...(e.stock !== undefined ? { stock: e.stock } : {}),
      },
      { id: deps.ids.nuevoId(), slug: slug.valor.slug, ahora },
    );
    if (!base.ok) return base;

    if (e.publicar === true) {
      // Chequeo anticipado con una imagen "virtual" para no subir nada si va a fallar por precio.
      const simulado =
        e.imagen === undefined ? base.valor : conImagen(base.valor, { key: "pendiente", orden: 0 }, ahora);
      const chequeo = puedePublicarse(simulado);
      if (!chequeo.ok) return chequeo;
    }

    let producto = base.valor;
    let keySubida: string | null = null;
    if (e.imagen !== undefined) {
      const { key } = await deps.imagenes.guardar(e.imagen.bytes, e.imagen.tipoMime);
      keySubida = key;
      producto = conImagen(producto, { key, orden: 0 }, ahora);
    }
    if (e.publicar === true) {
      const pub = publicar(producto, ahora);
      if (!pub.ok) return pub;
      producto = pub.valor;
    }
    // Las transiciones de dominio incrementan `version`, pero todavía no hubo ningún guardado:
    // el producto nace con la versión y la fecha de creación (la del primer guardado).
    producto = Object.freeze({
      ...producto,
      version: base.valor.version,
      actualizadoEn: base.valor.actualizadoEn,
    });
    try {
      let n = slug.valor.n;
      for (let intento = 1; ; intento += 1) {
        try {
          await deps.repo.guardar(producto);
          return ok(producto);
        } catch (error) {
          if (!(error instanceof SlugDuplicadoError) || intento >= MAX_INTENTOS_GUARDAR) throw error;
          const otro = await resolverSlugUnico(e.nombre, deps.repo, n + 1);
          if (!otro.ok) throw error;
          n = otro.valor.n;
          producto = Object.freeze({ ...producto, slug: otro.valor.slug });
        }
      }
    } catch (error) {
      if (keySubida !== null) {
        try {
          await deps.imagenes.borrar(keySubida);
        } catch {
          // best-effort: se prioriza informar el error original
        }
      }
      throw error;
    }
  };
