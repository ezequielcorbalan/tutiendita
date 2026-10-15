import { currencyDecimals, DEFAULT_LANGUAGE, type Language } from "../packages/core/index";
import { build } from "../container";
import { LOCALES } from "../i18n";
import { decimalAmount, jsonLdList, jsonLdProduct, serializeJsonLd } from "./json-ld";
import { type ProductJson, toProductJson } from "./product-json";

/** Page logic, outside the .astro files so it can be tested without the Astro build. */
export type ProductView = ProductJson & { priceText: string };

/** The price in the store's currency, formatted for the language (es-AR, en-US or pt-BR). */
export function priceText(p: ProductJson, language: Language = DEFAULT_LANGUAGE): string {
  const value = Number(decimalAmount(p.price.amount, p.price.currency));
  // Decimals come from ISO 4217 (core), not CLDR: Intl would round, for example, IQD to 0 decimals.
  const decimals = currencyDecimals(p.price.currency);
  return new Intl.NumberFormat(LOCALES[language], {
    style: "currency",
    currency: p.price.currency,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

const toView =
  (language: Language) =>
  (p: ProductJson): ProductView => ({ ...p, priceText: priceText(p, language) });

export type HomeData =
  | { status: "unclaimed" }
  | { status: "setting-up" }
  | {
      status: "ready";
      name: string;
      products: ProductView[];
      jsonLd: string;
      /** Categories with at least one published product (empty if none: the home page stays as always). */
      categories: CategoryView[];
      /** The one of /c/<slug>, or null on the home page and when the slug matches none of `categories`. */
      currentCategory: CategoryView | null;
    };

export type CategoryView = { name: string; slug: string };

/**
 * Home page by store status: without an owner it shows the first boot with the button to claim it;
 * with onboarding half done, "Estamos preparando la tienda"; when ready, the catalog (with `categorySlug`,
 * only that category's products).
 */
export async function homeData(
  env: Env,
  baseUrl: string,
  language: Language = DEFAULT_LANGUAGE,
  categorySlug?: string,
): Promise<HomeData> {
  const container = build(env);
  const { status } = await container.storeStatus();
  if (status !== "ready") return { status };
  const [store, published, all] = await Promise.all([
    container.getStore(),
    container.listProducts(),
    container.listCategories(),
  ]);
  const categories = all.filter((c) => published.some((p) => p.categoryId === c.id));
  const current = categorySlug === undefined ? undefined : categories.find((c) => c.slug === categorySlug);
  const products = published.filter((p) => !current || p.categoryId === current.id).map(toProductJson);
  return {
    status: "ready",
    name: store?.name ?? "tiendita",
    products: products.map(toView(language)),
    jsonLd: serializeJsonLd(jsonLdList(products, baseUrl)),
    categories: categories.map(({ name, slug }) => ({ name, slug })),
    currentCategory: current ? { name: current.name, slug: current.slug } : null,
  };
}

/** Owner's panel: all products (drafts and paused too), with the price already formatted. */
export async function panelProductsData(
  env: Env,
  language: Language = DEFAULT_LANGUAGE,
): Promise<ProductView[]> {
  const products = await build(env).listAllProducts();
  return products.map(toProductJson).map(toView(language));
}

export async function productData(
  env: Env,
  slug: string,
  baseUrl: string,
  language: Language = DEFAULT_LANGUAGE,
): Promise<{ found: false } | { found: true; product: ProductView; jsonLd: string }> {
  const r = await build(env).getProduct(slug);
  if (!r.ok) return { found: false };
  const product = toProductJson(r.value);
  return {
    found: true,
    product: toView(language)(product),
    jsonLd: serializeJsonLd(jsonLdProduct(product, baseUrl)),
  };
}
