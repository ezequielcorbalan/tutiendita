import { describe, expect, it } from "vitest";
import {
  hasSurcharges,
  minimumPrice,
  type OptionTemplate,
  optionsFromTemplates,
  type ProductOption,
  resolveSelection,
  selectionLabel,
  validateOptions,
  validateTemplates,
  withIds,
} from "../../../src/packages/core/domain/options";
import { isOk } from "../../../src/packages/core/domain/result";

const ars = (amount: number) => ({ amount, currency: "ARS" });
const filling: ProductOption = {
  id: "o1",
  name: "Relleno",
  values: [
    { id: "v1", label: "Dulce de leche", priceDelta: 0, imageKey: null },
    { id: "v2", label: "Chocolate", priceDelta: 50000, imageKey: null },
  ],
};
const size: ProductOption = {
  id: "o2",
  name: "Tamaño",
  values: [
    { id: "v3", label: "Chica", priceDelta: -200000, imageKey: null },
    { id: "v4", label: "Grande", priceDelta: 0, imageKey: null },
  ],
};
const codeOf = (r: { ok: boolean; error?: { code: string } }) => (r.ok ? null : r.error?.code);

describe("validateOptions", () => {
  it("trims names and labels and keeps the ids", () => {
    const r = validateOptions([
      {
        ...filling,
        name: "  Relleno ",
        values: [{ id: "v1", label: " Crema ", priceDelta: 0, imageKey: null }],
      },
    ]);
    expect(isOk(r) && r.value[0]).toMatchObject({
      id: "o1",
      name: "Relleno",
      values: [{ id: "v1", label: "Crema" }],
    });
  });

  it("rejects empty names, duplicates (ignoring case), too many values, decimals and missing ids", () => {
    const bad: ProductOption[][] = [
      [{ ...filling, name: " " }],
      [filling, { ...size, name: "relleno" }],
      [
        {
          ...filling,
          values: [
            { id: "a", label: "Chica", priceDelta: 0, imageKey: null },
            { id: "b", label: "chica", priceDelta: 0, imageKey: null },
          ],
        },
      ],
      [{ ...filling, values: [] }],
      [
        {
          ...filling,
          values: Array.from({ length: 31 }, (_, i) => ({
            id: `v${i}`,
            label: `V${i}`,
            priceDelta: 0,
            imageKey: null,
          })),
        },
      ],
      [{ ...filling, values: [{ id: "a", label: "Chica", priceDelta: 1.5, imageKey: null }] }],
      [{ ...filling, id: "" }],
      Array.from({ length: 6 }, (_, i) => ({ ...filling, id: `o${i}`, name: `Opción ${i}` })),
    ];
    for (const options of bad) expect(codeOf(validateOptions(options))).toBe("INVALID_OPTIONS");
  });
});

describe("value photos", () => {
  it("validateOptions keeps imageKey", () => {
    const r = validateOptions([
      { ...filling, values: [{ id: "v1", label: "Crema", priceDelta: 0, imageKey: "k.png" }] },
    ]);
    expect(isOk(r) && r.value[0]?.values[0]?.imageKey).toBe("k.png");
  });

  it("withIds keeps imageKey", () => {
    const r = withIds(
      [{ ...filling, values: [{ id: "", label: "Crema", priceDelta: 0, imageKey: "k.png" }] }],
      () => "n",
    );
    expect(r[0]?.values[0]).toMatchObject({ id: "n", imageKey: "k.png" });
  });
});

describe("templates", () => {
  const templates: OptionTemplate[] = [
    {
      name: "Talle",
      values: [
        { label: "S", priceDelta: 0 },
        { label: "XL", priceDelta: 30000 },
      ],
    },
  ];

  it("optionsFromTemplates creates values without photo", () => {
    const options = optionsFromTemplates(templates, () => "x");
    expect(options.every((o) => o.values.every((v) => v.imageKey === null))).toBe(true);
  });

  it("validates like options (without ids) and copies into product options with fresh ids", () => {
    expect(isOk(validateTemplates(templates))).toBe(true);
    expect(codeOf(validateTemplates([{ name: "Talle", values: [] }]))).toBe("INVALID_OPTIONS");
    let n = 0;
    const options = optionsFromTemplates(templates, () => `id-${++n}`);
    expect(options).toEqual([
      {
        id: "id-1",
        name: "Talle",
        values: [
          { id: "id-2", label: "S", priceDelta: 0, imageKey: null },
          { id: "id-3", label: "XL", priceDelta: 30000, imageKey: null },
        ],
      },
    ]);
  });
});

describe("prices and selection", () => {
  it("minimum price takes the cheapest value of each option; surcharges are detected", () => {
    expect(minimumPrice(ars(2800000), [filling, size])).toEqual(ars(2600000));
    expect(hasSurcharges([filling])).toBe(true);
    expect(hasSurcharges([size])).toBe(false);
  });

  it("resolves a full selection with its price and label", () => {
    const r = resolveSelection({ options: [filling, size], price: ars(2800000) }, { o1: "v2", o2: "v3" });
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;
    expect(r.value.price).toEqual(ars(2650000));
    expect(selectionLabel(r.value)).toBe("Relleno: Chocolate · Tamaño: Chica");
  });

  it("rejects a missing option, an unknown value and an option the product doesn't have", () => {
    const product = { options: [filling], price: ars(100) };
    expect(codeOf(resolveSelection(product, {}))).toBe("INVALID_SELECTION");
    expect(codeOf(resolveSelection(product, { o1: "nope" }))).toBe("INVALID_SELECTION");
    expect(codeOf(resolveSelection(product, { o1: "v1", o9: "v1" }))).toBe("INVALID_SELECTION");
    expect(isOk(resolveSelection({ options: [], price: ars(100) }, {}))).toBe(true);
  });
});
