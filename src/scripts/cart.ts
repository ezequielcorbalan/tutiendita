// Browser cart: lives in localStorage (no account, no session). Prices here are only a preview: the
// server prices the cart again (/api/orders/quote) before the order is sent.
import { currencyDecimals } from "../packages/core/index";
import { decimalAmount } from "../lib/json-ld";

export type CartItem = {
  productId: string;
  slug: string;
  name: string;
  /** Minor units (cents), as last seen. */
  amount: number;
  currency: string;
  image: string | null;
  quantity: number;
  /** Variants chosen: option id → value id (absent if the product has none). */
  selection?: Record<string, string>;
  /** What the buyer sees: "Relleno: Chocolate · Tamaño: Grande". */
  variant?: string;
};

/** Same product with another selection is another cart line. */
export const lineKey = (i: Pick<CartItem, "productId" | "selection">): string =>
  `${i.productId}|${Object.entries(i.selection ?? {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([o, v]) => `${o}=${v}`)
    .join(",")}`;

const KEY = "tiendita-cart";
export const MAX_QUANTITY = 99;

export function readCart(): CartItem[] {
  try {
    const items = JSON.parse(localStorage.getItem(KEY) ?? "[]") as CartItem[];
    return Array.isArray(items) ? items.filter((i) => i && typeof i.productId === "string") : [];
  } catch {
    return [];
  }
}

export function writeCart(items: CartItem[]): void {
  try {
    if (items.length === 0) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    // Private mode or storage blocked: the cart only lasts while the page is open.
  }
  updateCartCount();
}

export function addToCart(item: Omit<CartItem, "quantity">, quantity = 1): void {
  const items = readCart();
  const current = items.find((i) => lineKey(i) === lineKey(item));
  if (current) current.quantity = Math.min(MAX_QUANTITY, current.quantity + quantity);
  else items.push({ ...item, quantity: Math.min(MAX_QUANTITY, quantity) });
  writeCart(items);
}

/** Updates every `[data-cart-count]` badge (store header). */
export function updateCartCount(): void {
  const count = readCart().reduce((n, i) => n + i.quantity, 0);
  for (const el of document.querySelectorAll<HTMLElement>("[data-cart-count]")) {
    el.textContent = String(count);
    el.hidden = count === 0;
  }
}

export function formatMoney(amount: number, currency: string, locale: string): string {
  const decimals = currencyDecimals(currency);
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(Number(decimalAmount(amount, currency)));
}
