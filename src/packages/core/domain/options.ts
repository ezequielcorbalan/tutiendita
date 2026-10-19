import { type DomainError, domainError } from "./errors";
import type { Money } from "./money";
import { err, ok, type Result } from "./result";

/**
 * Variants: a product offers options ("Relleno", "Talle"), each with ordered values ("Dulce de leche") that
 * may adjust the price. The buyer picks exactly one value per option. Categories keep templates with the
 * same shape, copied into a product when it's created there (or when the owner asks for them).
 */
export const MAX_OPTIONS = 5;
export const MAX_OPTION_VALUES = 30;
export const MAX_OPTION_LABEL_LENGTH = 40;

export type OptionValue = {
  readonly id: string;
  readonly label: string;
  /** Added to the product's base price, in the currency's minor unit; may be negative. */
  readonly priceDelta: number;
  /** Key of one of the product's gallery photos shown when this value is picked; null for none. */
  readonly imageKey: string | null;
};

export type ProductOption = {
  readonly id: string;
  readonly name: string;
  readonly values: readonly OptionValue[];
};

export type TemplateValue = { readonly label: string; readonly priceDelta: number };
export type OptionTemplate = { readonly name: string; readonly values: readonly TemplateValue[] };

/** The buyer's choice: option id → value id. */
export type Selection = Readonly<Record<string, string>>;

const invalid = (message: string, details?: Record<string, unknown>) =>
  err(domainError("INVALID_OPTIONS", message, details));

function validateLabel(label: string, what: string): Result<string, DomainError> {
  const clean = label.trim();
  if (clean === "") return invalid(`${what} needs a name`);
  if (clean.length > MAX_OPTION_LABEL_LENGTH) {
    return invalid(`${what} is longer than ${MAX_OPTION_LABEL_LENGTH} characters`, { label: clean });
  }
  return ok(clean);
}

const duplicated = (labels: readonly string[]): string | undefined => {
  const seen = new Set<string>();
  for (const l of labels) {
    const key = l.toLocaleLowerCase();
    if (seen.has(key)) return l;
    seen.add(key);
  }
  return undefined;
};

function validateValues<T extends TemplateValue>(
  name: string,
  values: readonly T[],
): Result<{ label: string; priceDelta: number; raw: T }[], DomainError> {
  if (values.length === 0 || values.length > MAX_OPTION_VALUES) {
    return invalid(`"${name}" needs between 1 and ${MAX_OPTION_VALUES} values`, { option: name });
  }
  const out: { label: string; priceDelta: number; raw: T }[] = [];
  for (const v of values) {
    const label = validateLabel(v.label, `A value of "${name}"`);
    if (!label.ok) return label;
    if (!Number.isSafeInteger(v.priceDelta)) {
      return invalid(`The price adjustment of "${label.value}" must be a whole number`, { option: name });
    }
    out.push({ label: label.value, priceDelta: v.priceDelta, raw: v });
  }
  const dup = duplicated(out.map((v) => v.label));
  if (dup !== undefined) return invalid(`"${name}" has the value "${dup}" twice`, { option: name });
  return ok(out);
}

function validateList<T extends OptionTemplate>(
  options: readonly T[],
): Result<
  { name: string; values: { label: string; priceDelta: number; raw: T["values"][number] }[]; raw: T }[],
  DomainError
> {
  if (options.length > MAX_OPTIONS) return invalid(`At most ${MAX_OPTIONS} options per product`);
  const out = [];
  for (const o of options) {
    const name = validateLabel(o.name, "An option");
    if (!name.ok) return name;
    const values = validateValues(name.value, o.values);
    if (!values.ok) return values;
    out.push({ name: name.value, values: values.value, raw: o });
  }
  const dup = duplicated(out.map((o) => o.name));
  if (dup !== undefined) return invalid(`The option "${dup}" is repeated`);
  return ok(out);
}

/** Trims names and labels, checks limits, duplicates and whole-number adjustments. Ids are kept as given. */
export function validateOptions(options: readonly ProductOption[]): Result<ProductOption[], DomainError> {
  const v = validateList(options);
  if (!v.ok) return v;
  for (const o of v.value) {
    if (o.raw.id.trim() === "" || o.values.some((x) => x.raw.id.trim() === "")) {
      return invalid("Every option and value needs an id", { option: o.name });
    }
  }
  return ok(
    v.value.map((o) =>
      Object.freeze({
        id: o.raw.id,
        name: o.name,
        values: o.values.map((x) =>
          Object.freeze({ id: x.raw.id, label: x.label, priceDelta: x.priceDelta, imageKey: x.raw.imageKey }),
        ),
      }),
    ),
  );
}

export function validateTemplates(
  templates: readonly OptionTemplate[],
): Result<OptionTemplate[], DomainError> {
  const v = validateList(templates);
  if (!v.ok) return v;
  return ok(
    v.value.map((o) =>
      Object.freeze({
        name: o.name,
        values: o.values.map((x) => Object.freeze({ label: x.label, priceDelta: x.priceDelta })),
      }),
    ),
  );
}

/** Product options copied from a category's templates, with fresh ids. */
export const optionsFromTemplates = (
  templates: readonly OptionTemplate[],
  newId: () => string,
): ProductOption[] =>
  templates.map((t) =>
    Object.freeze({
      id: newId(),
      name: t.name,
      values: t.values.map((v) =>
        Object.freeze({ id: newId(), label: v.label, priceDelta: v.priceDelta, imageKey: null }),
      ),
    }),
  );

/** Options as they come from a form: anything without an id (new) gets a fresh one. */
export const withIds = (options: readonly ProductOption[], newId: () => string): ProductOption[] =>
  options.map((o) => ({
    id: o.id.trim() || newId(),
    name: o.name,
    values: o.values.map((v) => ({
      id: v.id.trim() || newId(),
      label: v.label,
      priceDelta: v.priceDelta,
      imageKey: v.imageKey,
    })),
  }));

/** The cheapest combination: base price plus the smallest adjustment of each option. */
export const minimumPrice = (base: Money, options: readonly ProductOption[]): Money => ({
  amount: options.reduce((sum, o) => sum + Math.min(...o.values.map((v) => v.priceDelta)), base.amount),
  currency: base.currency,
});

/** Whether any combination costs more than the base price (the catalog then says "from"). */
export const hasSurcharges = (options: readonly ProductOption[]): boolean =>
  options.some((o) => o.values.some((v) => v.priceDelta > 0));

export type ResolvedSelection = {
  readonly chosen: readonly { option: ProductOption; value: OptionValue }[];
  readonly price: Money;
};

/** Exactly one existing value per option, nothing else; and the resulting unit price. */
export function resolveSelection(
  product: { options: readonly ProductOption[]; price: Money },
  selection: Selection,
): Result<ResolvedSelection, DomainError> {
  const chosen: { option: ProductOption; value: OptionValue }[] = [];
  for (const option of product.options) {
    const valueId = selection[option.id];
    const value = option.values.find((v) => v.id === valueId);
    if (value === undefined) {
      return err(
        domainError("INVALID_SELECTION", `Choose a value for "${option.name}"`, { optionId: option.id }),
      );
    }
    chosen.push({ option, value });
  }
  const known = new Set(product.options.map((o) => o.id));
  const unknown = Object.keys(selection).find((k) => !known.has(k));
  if (unknown !== undefined) {
    return err(
      domainError("INVALID_SELECTION", "The selection has an option this product doesn't have", {
        optionId: unknown,
      }),
    );
  }
  const amount = chosen.reduce((sum, c) => sum + c.value.priceDelta, product.price.amount);
  return ok({ chosen, price: { amount, currency: product.price.currency } });
}

/** "Relleno: Dulce de leche · Talle: M", or "" without options. */
export const selectionLabel = (r: ResolvedSelection): string =>
  r.chosen.map((c) => `${c.option.name}: ${c.value.label}`).join(" · ");
