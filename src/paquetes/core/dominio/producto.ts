import { type Dinero, esPositivo } from "./dinero";
import { type ErrorDeDominio, errorDeDominio } from "./errores";
import { err, ok, type Result } from "./result";
import { esSlugValido } from "./slug";

export type EstadoProducto = "borrador" | "publicado" | "pausado";

export type ImagenProducto = {
  readonly key: string;
  readonly orden: number;
};

export type Producto = {
  readonly id: string;
  readonly nombre: string;
  readonly slug: string;
  readonly descripcion: string;
  readonly precio: Dinero;
  readonly imagenes: readonly ImagenProducto[];
  readonly stock: number | null;
  readonly estado: EstadoProducto;
  readonly categoriaId: string | null;
  readonly federar: boolean;
  readonly version: number;
  readonly creadoEn: Date;
  readonly actualizadoEn: Date;
};

export type EntradaProducto = {
  nombre: string;
  descripcion?: string;
  precio: Dinero;
  imagenes?: ImagenProducto[];
  stock?: number | null;
  categoriaId?: string | null;
  federar?: boolean;
};

/** Lo que el dominio no decide por sí mismo: identidad, slug ya resuelto como único, y el momento actual. */
export type ContextoCreacion = {
  id: string;
  slug: string;
  ahora: Date;
};

const congelar = (p: Producto): Producto => Object.freeze(p);

export function nuevoProducto(e: EntradaProducto, ctx: ContextoCreacion): Result<Producto, ErrorDeDominio> {
  const nombre = e.nombre.trim();
  if (nombre === "") {
    return err(errorDeDominio("NOMBRE_VACIO", "El producto necesita un nombre"));
  }
  if (!esSlugValido(ctx.slug)) {
    return err(errorDeDominio("SLUG_INVALIDO", "El slug no tiene un formato válido", { slug: ctx.slug }));
  }
  const imagenes = (e.imagenes ?? []).map((img, i) => ({ key: img.key, orden: i }));
  return ok(
    congelar({
      id: ctx.id,
      nombre,
      slug: ctx.slug,
      descripcion: e.descripcion ?? "",
      precio: e.precio,
      imagenes,
      stock: e.stock ?? null,
      estado: "borrador",
      categoriaId: e.categoriaId ?? null,
      federar: e.federar ?? false,
      version: 1,
      creadoEn: ctx.ahora,
      actualizadoEn: ctx.ahora,
    }),
  );
}

/** Un producto publicado tiene precio mayor a cero y al menos una imagen. */
export function puedePublicarse(p: Producto): Result<true, ErrorDeDominio> {
  if (!esPositivo(p.precio)) {
    return err(errorDeDominio("PRECIO_INVALIDO", "Un producto publicado necesita precio mayor a cero"));
  }
  if (p.imagenes.length === 0) {
    return err(errorDeDominio("SIN_IMAGEN", "Un producto publicado necesita al menos una imagen"));
  }
  return ok(true);
}

const siguienteVersion = (p: Producto, cambios: Partial<Producto>, ahora: Date): Producto =>
  congelar({ ...p, ...cambios, version: p.version + 1, actualizadoEn: ahora });

export function publicar(p: Producto, ahora: Date): Result<Producto, ErrorDeDominio> {
  const chequeo = puedePublicarse(p);
  if (!chequeo.ok) return chequeo;
  return ok(siguienteVersion(p, { estado: "publicado" }, ahora));
}

export function pausar(p: Producto, ahora: Date): Result<Producto, ErrorDeDominio> {
  if (p.estado !== "publicado") {
    return err(
      errorDeDominio("ESTADO_INVALIDO", "Solo se puede pausar un producto publicado", { estado: p.estado }),
    );
  }
  return ok(siguienteVersion(p, { estado: "pausado" }, ahora));
}

export function conImagen(p: Producto, img: ImagenProducto, ahora: Date): Producto {
  const imagenes = [...p.imagenes, { key: img.key, orden: p.imagenes.length }];
  return siguienteVersion(p, { imagenes }, ahora);
}
