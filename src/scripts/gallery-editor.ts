// Photo gallery of the panel's product form (PRO). Keeps the photos in order (saved ones by key, new ones as
// shrunk files with a preview) and reads them back as the API's `gallery` plus the files image_0 … image_n.
import { ALLOWED_MIMES, MAX_IMAGE_SIZE, type PhotoRef } from "../packages/core/index";
import { shrinkImage } from "../lib/shrink-image";

export type GalleryItem = { key?: string; file?: File; url: string };

/** Saved photos keep their key; new files get `{ upload: n }` in the order they appear. */
export function toRefs(items: readonly GalleryItem[]): { gallery: PhotoRef[]; files: File[] } {
  const files: File[] = [];
  const gallery = items.map((item): PhotoRef => {
    if (!item.file) return { key: item.key ?? "" };
    files.push(item.file);
    return { upload: files.length - 1 };
  });
  return { gallery, files };
}

/** What the server takes: jpeg, png or webp up to the professional size (shrinking falls back to the original). */
export const isAcceptable = (file: File): boolean =>
  (ALLOWED_MIMES as readonly string[]).includes(file.type) && file.size <= MAX_IMAGE_SIZE;

/** Swaps the photo at `index` with its neighbour (`step` -1 or 1); out of range leaves the list as is. */
export function move<T>(items: readonly T[], index: number, step: number): T[] {
  const to = index + step;
  const out = [...items];
  if (to < 0 || to >= out.length) return out;
  [out[index], out[to]] = [out[to] as T, out[index] as T];
  return out;
}

export type GalleryEditor = ReturnType<typeof mountGalleryEditor>;

export function mountGalleryEditor(root: HTMLElement, initial: { key: string; url: string }[], max: number) {
  const list = root.querySelector<HTMLElement>("[data-gallery-list]");
  const template = root.querySelector<HTMLTemplateElement>("template[data-gallery-template]");
  const input = root.querySelector<HTMLInputElement>("[data-gallery-input]");
  const full = root.querySelector<HTMLElement>("[data-gallery-full]");
  const error = root.querySelector<HTMLElement>("[data-gallery-error]");
  if (!list || !template || !input || !full || !error) throw new Error("Incomplete gallery editor");
  // Texts with "{n}" for the photo number (i18n in product-form.astro).
  const label = (name: string, n: number) => (root.dataset[name] ?? "").replace("{n}", String(n));
  const listeners: (() => void)[] = [];
  let items: GalleryItem[] = initial.map((i) => ({ key: i.key, url: i.url }));

  /** Redraws the list; `focus` puts the keyboard back on the moved or next photo. */
  function render(focus?: { index: number; selector: string }): void {
    const rows = items.map((item, i) => {
      const row = (template as HTMLTemplateElement).content.firstElementChild?.cloneNode(true) as HTMLElement;
      const img = row.querySelector<HTMLImageElement>("img");
      if (img) {
        img.src = item.url;
        img.alt = label("labelPhoto", i + 1);
      }
      const main = row.querySelector<HTMLElement>("[data-main]");
      if (main) main.hidden = i !== 0;
      for (const button of row.querySelectorAll<HTMLButtonElement>("[data-move]")) {
        const step = Number(button.dataset.move);
        button.setAttribute("aria-label", label(step < 0 ? "labelBefore" : "labelAfter", i + 1));
        button.disabled = i + step < 0 || i + step >= items.length;
        button.addEventListener("click", () => {
          items = move(items, i, step);
          changed({ index: i + step, selector: `[data-move="${step}"]` });
        });
      }
      const remove = row.querySelector<HTMLButtonElement>("[data-remove]");
      remove?.setAttribute("aria-label", label("labelRemove", i + 1));
      remove?.addEventListener("click", () => {
        const [gone] = items.splice(i, 1);
        if (gone?.file) URL.revokeObjectURL(gone.url);
        changed({ index: Math.min(i, items.length - 1), selector: "[data-remove]" });
      });
      return row;
    });
    list?.replaceChildren(...rows);
    const atMax = items.length >= max;
    if (input) input.disabled = atMax;
    if (full) full.hidden = !atMax;
    if (!focus) return;
    const row = rows[focus.index];
    // At the edge the moved button is disabled: the other move button (or the add field) takes the focus.
    const target = [
      row?.querySelector<HTMLButtonElement>(focus.selector),
      ...(row?.querySelectorAll<HTMLButtonElement>("button") ?? []),
    ].find((b) => b && !b.disabled);
    (target ?? input)?.focus();
  }

  function changed(focus?: { index: number; selector: string }): void {
    render(focus);
    for (const cb of listeners) cb();
  }

  /** Shrinks and adds the picked files one by one; the cap is checked as each one lands (picks can overlap). */
  async function add(picked: File[]): Promise<void> {
    let failed = false;
    for (const original of picked) {
      if (items.length >= max) break; // The rest is over the limit: the "máximo" note shows why.
      try {
        const file = await shrinkImage(original, "professional");
        if (!isAcceptable(file)) {
          failed = true;
          continue;
        }
        if (items.length >= max) break;
        items.push({ file, url: URL.createObjectURL(file) });
      } catch {
        failed = true;
      }
    }
    if (error) error.textContent = failed ? (root.dataset.addFailed ?? "") : "";
    changed();
  }

  // Additions run one after the other; the form awaits `ready()` so a save never leaves a photo behind.
  let pending = Promise.resolve();
  input.addEventListener("change", () => {
    const picked = [...(input.files ?? [])];
    input.value = "";
    pending = pending.then(() => add(picked));
  });

  render();
  return {
    ready: () => pending,
    read: () => toRefs(items),
    photos: () => {
      const { gallery } = toRefs(items);
      return items.map((item, i) => ({
        ref: gallery[i] as PhotoRef,
        url: item.url,
        label: label("labelPhoto", i + 1),
      }));
    },
    onChange: (cb: () => void) => {
      listeners.push(cb);
    },
  };
}
