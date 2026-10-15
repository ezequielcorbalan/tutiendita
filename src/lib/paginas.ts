import { decimalesDeMoneda, IDIOMA_POR_DEFECTO, type Idioma } from "../paquetes/core/index";
import { armar } from "../container";
import { LOCALES } from "../i18n";
import { jsonLdLista, jsonLdProducto, montoDecimal, serializarJsonLd } from "./json-ld";
import { aProductoJson, type ProductoJson } from "./producto-json";

/** Lógica de las páginas, fuera de los .astro para poder testearla sin el build de Astro. */
export type ProductoVista = ProductoJson & { precioTexto: string };

/** El precio en la moneda de la tienda, con el formato del idioma (es-AR, en-US o pt-BR). */
export function precioTexto(p: ProductoJson, idioma: Idioma = IDIOMA_POR_DEFECTO): string {
  const valor = Number(montoDecimal(p.precio.monto, p.precio.moneda));
  // Los decimales salen de ISO 4217 (core), no de CLDR: Intl redondearía, por ejemplo, IQD a 0 decimales.
  const decimales = decimalesDeMoneda(p.precio.moneda);
  return new Intl.NumberFormat(LOCALES[idioma], {
    style: "currency",
    currency: p.precio.moneda,
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  }).format(valor);
}

const aVista =
  (idioma: Idioma) =>
  (p: ProductoJson): ProductoVista => ({ ...p, precioTexto: precioTexto(p, idioma) });

export type DatosInicio =
  | { estado: "sin-reclamar" }
  | { estado: "configurando" }
  | {
      estado: "lista";
      nombre: string;
      productos: ProductoVista[];
      jsonLd: string;
      /** Las categorías con al menos un producto publicado (vacío si no hay: la portada queda como siempre). */
      categorias: CategoriaVista[];
      /** La de /c/<slug>, o null en la portada y si el slug no corresponde a ninguna de `categorias`. */
      categoriaActual: CategoriaVista | null;
    };

export type CategoriaVista = { nombre: string; slug: string };

/**
 * Portada según el estado de la tienda: sin dueño muestra el primer arranque con el
 * botón para reclamarla; con el primer ingreso a medias, "Estamos preparando la tienda"; lista, el catálogo
 * (con `slugCategoria`, solo los productos de esa categoría).
 */
export async function datosInicio(
  env: Env,
  baseUrl: string,
  idioma: Idioma = IDIOMA_POR_DEFECTO,
  slugCategoria?: string,
): Promise<DatosInicio> {
  const contenedor = armar(env);
  const { estado } = await contenedor.estadoDeLaTienda();
  if (estado !== "lista") return { estado };
  const [tienda, publicados, todas] = await Promise.all([
    contenedor.obtenerTienda(),
    contenedor.listarProductos(),
    contenedor.listarCategorias(),
  ]);
  const categorias = todas.filter((c) => publicados.some((p) => p.categoriaId === c.id));
  const actual = slugCategoria === undefined ? undefined : categorias.find((c) => c.slug === slugCategoria);
  const productos = publicados.filter((p) => !actual || p.categoriaId === actual.id).map(aProductoJson);
  return {
    estado: "lista",
    nombre: tienda?.nombre ?? "tiendita",
    productos: productos.map(aVista(idioma)),
    jsonLd: serializarJsonLd(jsonLdLista(productos, baseUrl)),
    categorias: categorias.map(({ nombre, slug }) => ({ nombre, slug })),
    categoriaActual: actual ? { nombre: actual.nombre, slug: actual.slug } : null,
  };
}

/** Panel del dueño: todos los productos (también borradores y pausados), con el precio ya formateado. */
export async function datosProductosDelPanel(
  env: Env,
  idioma: Idioma = IDIOMA_POR_DEFECTO,
): Promise<ProductoVista[]> {
  const productos = await armar(env).listarTodosLosProductos();
  return productos.map(aProductoJson).map(aVista(idioma));
}

export async function datosProducto(
  env: Env,
  slug: string,
  baseUrl: string,
  idioma: Idioma = IDIOMA_POR_DEFECTO,
): Promise<{ encontrado: false } | { encontrado: true; producto: ProductoVista; jsonLd: string }> {
  const r = await armar(env).obtenerProducto(slug);
  if (!r.ok) return { encontrado: false };
  const producto = aProductoJson(r.valor);
  return {
    encontrado: true,
    producto: aVista(idioma)(producto),
    jsonLd: serializarJsonLd(jsonLdProducto(producto, baseUrl)),
  };
}
