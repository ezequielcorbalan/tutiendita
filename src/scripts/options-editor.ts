// Variants editor of the panel (product form and category form). Builds the rows from the <template>s of
// options-editor.astro and reads them back as the API's JSON. Option and value ids travel in data-id, so an
// edit that doesn't touch a value keeps its id (and the buyers' carts stay valid).
import type { PhotoRef } from "../packages/core/index";
import type { GalleryEditor } from "./gallery-editor";

/** `image_ref` only when the owner changed the value's photo: without it the server keeps the saved one. */
export type EditorValue = { id?: string; label: string; price_delta: number; image_ref?: PhotoRef | null };
export type EditorOption = { id?: string; name: string; values: EditorValue[] };

/** Input shape: product options (with ids) or category templates (without). */
export type InitialOption = {
  readonly id?: string;
  readonly name: string;
  readonly values: readonly {
    readonly id?: string;
    readonly label: string;
    readonly priceDelta: number;
    readonly imageKey?: string | null;
  }[];
};

export class OptionsEditorError extends Error {}

/** A value row's photo: its URL (as in gallery.photos()) and whether the owner changed it. */
export type RowPhoto = { url: string; touched: boolean };

/** What a value row sends: nothing when untouched (the server keeps its photo), else its photo's ref or null. */
export function imageRefOf(
  row: RowPhoto,
  photos: readonly { url: string; ref: PhotoRef }[],
): { image_ref?: PhotoRef | null } {
  if (!row.touched) return {};
  return { image_ref: photos.find((p) => p.url === row.url)?.ref ?? null };
}

/** After a gallery change: a row whose photo is gone has none, and that counts as a change (sent as null). */
export function afterGalleryChange(row: RowPhoto, urls: ReadonlySet<string>): RowPhoto {
  return row.url && !urls.has(row.url) ? { url: "", touched: true } : row;
}

/** "500", "-200", "1.500,50" → minor units with sign; empty → 0; anything else → null. */
export function parseDelta(text: string): number | null {
  const clean = text.trim().replace(/\s/g, "").replace(/^\+/, "");
  if (clean === "") return 0;
  const negative = clean.startsWith("-") || clean.startsWith("−");
  const digits = negative ? clean.slice(1) : clean;
  if (!/^[\d.,]+$/.test(digits)) return null;
  const normalized = /,\d{1,2}$/.test(digits)
    ? digits.replace(/\./g, "").replace(",", ".")
    : digits.replace(/,/g, "");
  const value = Number(normalized);
  if (!Number.isFinite(value)) return null;
  const cents = Math.round(value * 100);
  return negative ? -cents : cents;
}

/** Minor units → what the field shows: "", "500", "-200", "12.50". */
export function formatDelta(cents: number): string {
  if (cents === 0) return "";
  const abs = Math.abs(cents);
  const text = abs % 100 === 0 ? String(abs / 100) : (abs / 100).toFixed(2);
  return cents < 0 ? `-${text}` : text;
}

/** `gallery` (product form, PRO): each value row picks one of its photos. */
export function mountOptionsEditor(root: HTMLElement, gallery?: Pick<GalleryEditor, "photos" | "onChange">) {
  const list = root.querySelector<HTMLElement>("[data-option-list]");
  const optionTemplate = root.querySelector<HTMLTemplateElement>("template[data-option-template]");
  const valueTemplate = root.querySelector<HTMLTemplateElement>("template[data-value-template]");
  if (!list || !optionTemplate || !valueTemplate) throw new Error("Incomplete options editor");
  const max = { options: Number(root.dataset.maxOptions), values: Number(root.dataset.maxValues) };
  const addOptionButton = root.querySelector<HTMLButtonElement>("[data-add-option]");
  let counter = 0;
  const uid = () => {
    counter += 1;
    return `${root.id || "opt"}-${counter}`;
  };

  const clone = (t: HTMLTemplateElement) =>
    (t.content.firstElementChild as HTMLElement).cloneNode(true) as HTMLElement;

  /** Connects each label with its input through fresh ids (several rows on the same page). */
  function wire(el: HTMLElement): void {
    for (const label of el.querySelectorAll<HTMLLabelElement>("label[data-for]")) {
      const input = el.querySelector<HTMLElement>(`[data-field="${label.dataset.for}"]`);
      if (!input) continue;
      input.id = uid();
      label.htmlFor = input.id;
    }
  }

  function refresh(): void {
    const options = list?.querySelectorAll("[data-option]") ?? [];
    if (addOptionButton) addOptionButton.hidden = options.length >= max.options;
    for (const option of options) {
      const values = option.querySelectorAll("[data-value]");
      const addValue = option.querySelector<HTMLButtonElement>("[data-add-value]");
      if (addValue) addValue.hidden = values.length >= max.values;
    }
  }

  /** The value's photo is kept by its URL (/img/<key> or the preview's blob:), the same as gallery.photos(). */
  const rowPhoto = (row: HTMLElement): RowPhoto => ({
    url: row.dataset.photoUrl ?? "",
    touched: row.dataset.photoTouched !== undefined,
  });
  function setRowPhoto(row: HTMLElement, photo: RowPhoto): void {
    row.dataset.photoUrl = photo.url;
    if (photo.touched) row.dataset.photoTouched = "";
  }

  /** "Foto de Rojo" for screen readers, following the value's label. */
  function renderLegend(row: HTMLElement): void {
    const legend = row.querySelector<HTMLElement>("[data-photo-legend]");
    const label = row.querySelector<HTMLInputElement>('[data-field="label"]')?.value.trim() ?? "";
    if (legend)
      legend.textContent = label
        ? (root.dataset.photoOf ?? "").replace("{label}", () => label)
        : (root.dataset.photo ?? "");
  }

  function renderPicker(row: HTMLElement): void {
    const picker = row.querySelector<HTMLElement>("[data-photo-picker]");
    const choices = row.querySelector<HTMLElement>("[data-photo-choices]");
    if (!gallery || !picker || !choices) return;
    const photos = gallery.photos();
    const current = photos.find((p) => p.url === row.dataset.photoUrl);
    picker.hidden = photos.length === 0;
    const name = uid();
    const choice = (url: string, text: string) => {
      const label = document.createElement("label");
      const radio = document.createElement("input");
      radio.type = "radio";
      radio.name = name;
      radio.value = url;
      radio.checked = url === (current?.url ?? "");
      radio.addEventListener("change", () => {
        setRowPhoto(row, { url, touched: true });
        renderSummary(
          row,
          photos.find((p) => p.url === url),
        );
      });
      label.appendChild(radio);
      if (url) {
        const img = document.createElement("img");
        img.src = url;
        img.className = "photo-choices__img";
        img.alt = "";
        img.width = 48;
        img.height = 48;
        label.appendChild(img);
      }
      label.appendChild(document.createTextNode(text));
      return label;
    };
    choices.replaceChildren(
      choice("", root.dataset.noPhoto ?? ""),
      ...photos.map((p) => choice(p.url, p.label)),
    );
    renderSummary(row, current);
    renderLegend(row);
  }

  function renderSummary(row: HTMLElement, photo?: { url: string; label: string }): void {
    const text = row.querySelector<HTMLElement>("[data-photo-current]");
    const img = row.querySelector<HTMLImageElement>("[data-photo-current-img]");
    if (text) text.textContent = photo?.label ?? root.dataset.noPhoto ?? "";
    if (img) {
      img.hidden = !photo;
      if (photo) img.src = photo.url;
    }
  }

  // A photo removed from the gallery leaves its values without photo (sent as null: the owner changed it).
  gallery?.onChange(() => {
    const urls = new Set(gallery.photos().map((p) => p.url));
    for (const row of list?.querySelectorAll<HTMLElement>("[data-value]") ?? []) {
      setRowPhoto(row, afterGalleryChange(rowPhoto(row), urls));
      renderPicker(row);
    }
  });

  function addValue(option: HTMLElement, value?: InitialOption["values"][number], focus = false): void {
    const row = clone(valueTemplate as HTMLTemplateElement);
    wire(row);
    if (value?.id) row.dataset.id = value.id;
    row.dataset.photoUrl = value?.imageKey ? `/img/${value.imageKey}` : "";
    renderPicker(row);
    const label = row.querySelector<HTMLInputElement>('[data-field="label"]');
    const delta = row.querySelector<HTMLInputElement>('[data-field="delta"]');
    if (label) label.value = value?.label ?? "";
    if (gallery) {
      renderLegend(row);
      label?.addEventListener("input", () => renderLegend(row));
    }
    if (delta) delta.value = formatDelta(value?.priceDelta ?? 0);
    row.querySelector("[data-remove-value]")?.addEventListener("click", () => {
      const values = option.querySelector<HTMLElement>("[data-values]");
      row.remove();
      refresh();
      values?.querySelector<HTMLInputElement>('[data-value]:last-child [data-field="label"]')?.focus();
    });
    option.querySelector("[data-values]")?.appendChild(row);
    refresh();
    if (focus) label?.focus();
  }

  function addOption(option?: InitialOption, focus = false): void {
    const card = clone(optionTemplate as HTMLTemplateElement);
    wire(card);
    if (option?.id) card.dataset.id = option.id;
    const name = card.querySelector<HTMLInputElement>('[data-field="name"]');
    if (name) name.value = option?.name ?? "";
    card.querySelector("[data-add-value]")?.addEventListener("click", () => addValue(card, undefined, true));
    card.querySelector("[data-remove-option]")?.addEventListener("click", () => {
      card.remove();
      refresh();
      addOptionButton?.focus();
    });
    list?.appendChild(card);
    const values = option?.values.length ? option.values : [undefined, undefined];
    for (const v of values) addValue(card, v);
    if (focus) name?.focus();
  }

  addOptionButton?.addEventListener("click", () => addOption(undefined, true));

  function set(options: readonly InitialOption[], keepIds = true): void {
    list?.replaceChildren();
    for (const o of options) {
      addOption(
        keepIds
          ? o
          : { name: o.name, values: o.values.map((v) => ({ label: v.label, priceDelta: v.priceDelta })) },
      );
    }
    refresh();
  }

  /**
   * The options as the API wants them. Rows with an empty name and no values are skipped; a value without a
   * label is skipped. A bad price difference throws OptionsEditorError (with the field focused).
   */
  function read(): EditorOption[] {
    const out: EditorOption[] = [];
    for (const card of list?.querySelectorAll<HTMLElement>("[data-option]") ?? []) {
      const name = card.querySelector<HTMLInputElement>('[data-field="name"]')?.value.trim() ?? "";
      const values: EditorValue[] = [];
      for (const row of card.querySelectorAll<HTMLElement>("[data-value]")) {
        const label = row.querySelector<HTMLInputElement>('[data-field="label"]')?.value.trim() ?? "";
        const deltaInput = row.querySelector<HTMLInputElement>('[data-field="delta"]');
        if (label === "") continue;
        const delta = parseDelta(deltaInput?.value ?? "");
        if (delta === null) {
          deltaInput?.focus();
          throw new OptionsEditorError(root.dataset.invalidDelta ?? "");
        }
        const photo = gallery ? imageRefOf(rowPhoto(row), gallery.photos()) : {};
        values.push({
          ...(row.dataset.id ? { id: row.dataset.id } : {}),
          label,
          price_delta: delta,
          ...photo,
        });
      }
      if (name === "" && values.length === 0) continue;
      out.push({ ...(card.dataset.id ? { id: card.dataset.id } : {}), name, values });
    }
    return out;
  }

  const isEmpty = () => read().length === 0;

  set(JSON.parse(root.dataset.initial ?? "[]") as InitialOption[]);
  return { set, read, isEmpty };
}
