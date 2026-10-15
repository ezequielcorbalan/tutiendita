import type { Producto } from "../paquetes/core/index";

/** Representación pública (JSON) de un producto; la usan la API y las páginas. */
export type ProductoJson = {
  id: string;
  nombre: string;
  slug: string;
  descripcion: string;
  precio: { monto: number; moneda: string };
  imagenes: { key: string; url: string }[];
  stock: number | null;
  estado: Producto["estado"];
  categoriaId: string | null;
  federar: boolean;
  version: number;
  creadoEn: string;
  actualizadoEn: string;
};

export const urlImagen = (key: string): string => `/img/${key}`;

export function aProductoJson(p: Producto): ProductoJson {
  return {
    id: p.id,
    nombre: p.nombre,
    slug: p.slug,
    descripcion: p.descripcion,
    precio: { monto: p.precio.monto, moneda: p.precio.moneda },
    imagenes: [...p.imagenes]
      .sort((a, b) => a.orden - b.orden)
      .map((img) => ({ key: img.key, url: urlImagen(img.key) })),
    stock: p.stock,
    estado: p.estado,
    categoriaId: p.categoriaId,
    federar: p.federar,
    version: p.version,
    creadoEn: p.creadoEn.toISOString(),
    actualizadoEn: p.actualizadoEn.toISOString(),
  };
}
