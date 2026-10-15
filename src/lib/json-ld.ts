import { decimalesDeMoneda } from "../paquetes/core/index";
import type { ProductoJson } from "./producto-json";

/** Monto entero en unidad mínima → string decimal sin floats: (4500, "ARS") → "45.00". */
export function montoDecimal(monto: number, moneda: string): string {
  const decimales = decimalesDeMoneda(moneda);
  if (decimales === 0) return String(monto);
  const digitos = String(monto).padStart(decimales + 1, "0");
  return `${digitos.slice(0, -decimales)}.${digitos.slice(-decimales)}`;
}

const DISPONIBLE = "https://schema.org/InStock";
const AGOTADO = "https://schema.org/OutOfStock";

const absoluta = (ruta: string, baseUrl: string): string => new URL(ruta, baseUrl).href;
export const urlProducto = (slug: string, baseUrl: string): string => absoluta(`/p/${slug}`, baseUrl);

/** schema.org Product con Offer, para la ficha del producto. */
export function jsonLdProducto(p: ProductoJson, baseUrl: string) {
  const url = urlProducto(p.slug, baseUrl);
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    "@id": url,
    name: p.nombre,
    ...(p.descripcion !== "" ? { description: p.descripcion } : {}),
    sku: p.id,
    url,
    image: p.imagenes.map((img) => absoluta(img.url, baseUrl)),
    offers: {
      "@type": "Offer",
      url,
      price: montoDecimal(p.precio.monto, p.precio.moneda),
      priceCurrency: p.precio.moneda,
      availability: p.stock === null || p.stock > 0 ? DISPONIBLE : AGOTADO,
    },
  };
}

/** schema.org ItemList con los productos de la portada. */
export function jsonLdLista(ps: readonly ProductoJson[], baseUrl: string) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    numberOfItems: ps.length,
    itemListElement: ps.map((p, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: urlProducto(p.slug, baseUrl),
      name: p.nombre,
    })),
  };
}

/** JSON apto para incrustar en <script>: escapa `<` para que un nombre con "</script>" no cierre la etiqueta. */
export const serializarJsonLd = (dato: unknown): string => JSON.stringify(dato).replace(/</g, "\\u003c");
