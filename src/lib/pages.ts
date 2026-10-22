import { currencyDecimals, DEFAULT_LANGUAGE, type Language } from "../packages/core/index";
import { build } from "../container";
import { LOCALES, texts } from "../i18n";
import { decimalAmount, jsonLdList, jsonLdProduct, productUrl, serializeJsonLd } from "./json-ld";
import { type ProductJson, priceRange, toProductJson } from "./product-json";

/** Page logic, outside the .astro files so it can be tested without the Astro build. */
export type ProductView = ProductJson & {
  /** The price, or "Desde $X" (the cheapest variant) when the variants change it. */
  priceText: string;
  /** The same amount without the "Desde" prefix: the cards show it as a label of its own. */
  priceLabel: string;
  priceFrom: boolean;
};

/** An amount in the store's currency, formatted for the language (es-AR, en-US or pt-BR). */
export function formatPrice(amount: number, currency: string, language: Language = DEFAULT_LANGUAGE): string {
  const value = Number(decimalAmount(amount, currency));
  // Decimals come from ISO 4217 (core), not CLDR: Intl would round, for example, IQD to 0 decimals.
  const decimals = currencyDecimals(currency);
  return new Intl.NumberFormat(LOCALES[language], {
    style: "currency",
    currency,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

/** The product's price; with variants that change it, "Desde" the cheapest one. */
export function priceText(p: ProductJson, language: Language = DEFAULT_LANGUAGE): string {
  const { min, max } = priceRange(p);
  const text = formatPrice(min, p.price.currency, language);
  return min === max ? text : texts(language).store.priceFrom(text);
}

const toView =
  (language: Language) =>
  (p: ProductJson): ProductView => {
    const { min, max } = priceRange(p);
    return {
      ...p,
      priceText: priceText(p, language),
      priceLabel: formatPrice(min, p.price.currency, language),
      priceFrom: min !== max,
    };
  };

export type HomeData =
  | { status: "unclaimed" }
  | { status: "setting-up" }
  | {
      status: "ready";
      name: string;
      /** The store's tagline (empty until the owner writes one). */
      description: string;
      products: ProductView[];
      jsonLd: string;
      /** Categories with at least one published product (empty if none: the home page stays as always). */
      categories: CategoryView[];
      /** The one of /c/<slug>, or null on the home page and when the slug matches none of `categories`. */
      currentCategory: CategoryView | null;
      /**
       * Home page with categories: the newest products, then a few per category with a link to it, then the
       * ones without a category. Null (one plain grid of `products`) on /c/<slug> and without categories.
       */
      sections: Section[] | null;
    };

export type CategoryView = { name: string; slug: string; imageUrl: string | null };
export type Section = { title: string; href: string | null; products: ProductView[] };

const LATEST = 8;
const PER_CATEGORY = 4;
/** A store with many small categories keeps a short home page: the rest are reachable from their tiles. */
const MAX_CATEGORY_SECTIONS = 4;

function sections(
  products: ProductView[],
  categories: (CategoryView & { id: string })[],
  language: Language,
): Section[] {
  const t = texts(language).store;
  const others = products.filter((p) => p.categoryId === null);
  const ofCategory = (c: { id: string }) => products.filter((p) => p.categoryId === c.id);
  // The biggest categories first; equal sizes keep the alphabetical order.
  const biggest = [...categories]
    .sort((a, b) => ofCategory(b).length - ofCategory(a).length)
    .slice(0, MAX_CATEGORY_SECTIONS);
  return [
    { title: t.latest, href: null, products: products.slice(0, LATEST) },
    ...biggest.map((c) => ({
      title: c.name,
      href: `/c/${c.slug}`,
      products: ofCategory(c).slice(0, PER_CATEGORY),
    })),
    ...(others.length > 0 ? [{ title: t.others, href: null, products: others }] : []),
  ];
}

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
  const everything = published.map(toProductJson);
  // Each category's tile shows the photo of its newest product that has one.
  const categories = all
    .filter((c) => published.some((p) => p.categoryId === c.id))
    .map(({ id, name, slug }) => ({
      id,
      name,
      slug,
      imageUrl: everything.find((p) => p.categoryId === id && p.images.length > 0)?.images[0]?.url ?? null,
    }));
  const current = categorySlug === undefined ? undefined : categories.find((c) => c.slug === categorySlug);
  const products = everything.filter((p) => !current || p.categoryId === current.id);
  const views = products.map(toView(language));
  const view = ({ name, slug, imageUrl }: CategoryView) => ({ name, slug, imageUrl });
  return {
    status: "ready",
    name: store?.name ?? "tiendita",
    description: store?.description ?? "",
    products: views,
    jsonLd: serializeJsonLd(jsonLdList(products, baseUrl)),
    categories: categories.map(view),
    currentCategory: current ? view(current) : null,
    sections: current === undefined && categories.length > 0 ? sections(views, categories, language) : null,
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

export type ProductPageData =
  | { found: false }
  | {
      found: true;
      product: ProductView;
      jsonLd: string;
      /** The product's category (breadcrumb and label), or null. */
      category: { name: string; slug: string } | null;
      /** "También te puede gustar": the newest of its category, filled up with the newest other products. */
      related: ProductView[];
      /** The store's WhatsApp number (digits only) for "Consultar", or null when it has no WhatsApp method. */
      whatsapp: string | null;
    };

const RELATED = 4;

export async function productData(
  env: Env,
  slug: string,
  baseUrl: string,
  language: Language = DEFAULT_LANGUAGE,
): Promise<ProductPageData> {
  const container = build(env);
  const r = await container.getProduct(slug);
  if (!r.ok) return { found: false };
  const [published, categories, method] = await Promise.all([
    container.listProducts(),
    container.listCategories(),
    container.getPaymentMethod("whatsapp"),
  ]);
  const product = toProductJson(r.value);
  const others = published.filter((p) => p.id !== product.id).map(toProductJson);
  const siblings = others.filter((p) => p.categoryId !== null && p.categoryId === product.categoryId);
  const category = categories.find((c) => c.id === product.categoryId);
  return {
    found: true,
    product: toView(language)(product),
    jsonLd: serializeJsonLd(jsonLdProduct(product, baseUrl)),
    category: category ? { name: category.name, slug: category.slug } : null,
    related: [...siblings, ...others.filter((p) => !siblings.includes(p))]
      .slice(0, RELATED)
      .map(toView(language)),
    whatsapp: method?.type === "whatsapp" && method.active ? method.config.number.replace(/\D/g, "") : null,
  };
}

/** What the sitemap lists: the home page, the categories and the published products (nothing until it's ready). */
export async function sitemapUrls(env: Env, baseUrl: string): Promise<string[]> {
  const data = await homeData(env, baseUrl);
  if (data.status !== "ready") return [];
  return [
    new URL("/", baseUrl).href,
    ...data.categories.map((c) => new URL(`/c/${c.slug}`, baseUrl).href),
    ...data.products.map((p) => productUrl(p.slug, baseUrl)),
  ];
}
