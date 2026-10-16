/**
 * The markdown subset GitHub release notes use, as data the panel renders as text (never as HTML): headings,
 * bullet lists and paragraphs, with **bold**, *italics* and `code`. Links keep only their text.
 */
export type Inline = {
  readonly text: string;
  readonly strong?: true;
  readonly em?: true;
  readonly code?: true;
};
export type NotesBlock =
  | { readonly type: "heading" | "paragraph"; readonly parts: Inline[] }
  | { readonly type: "list"; readonly items: Inline[][] };

const INLINE = /\*\*(.+?)\*\*|\*([^*\s](?:[^*]*[^*\s])?)\*|`([^`]+)`|\[([^\]]+)\]\([^)\s]+\)/g;

export function inline(text: string): Inline[] {
  const parts: Inline[] = [];
  let last = 0;
  for (const m of text.matchAll(INLINE)) {
    if (m.index > last) parts.push({ text: text.slice(last, m.index) });
    // Bold can hold code or italics: its pieces keep them and are all bold.
    if (m[1] !== undefined) parts.push(...inline(m[1]).map((p) => ({ ...p, strong: true as const })));
    else if (m[2] !== undefined) parts.push({ text: m[2], em: true });
    else if (m[3] !== undefined) parts.push({ text: m[3], code: true });
    else parts.push({ text: m[4] ?? "" });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}

export function parseNotes(markdown: string): NotesBlock[] {
  const blocks: NotesBlock[] = [];
  let paragraph: string[] = [];
  const flush = () => {
    if (paragraph.length > 0) blocks.push({ type: "paragraph", parts: inline(paragraph.join(" ")) });
    paragraph = [];
  };
  for (const raw of markdown.split(/\r?\n/)) {
    const line = raw.trim();
    const heading = /^#{1,6}\s+(.+)$/.exec(line);
    const item = /^[-*+]\s+(.+)$/.exec(line);
    if (heading?.[1]) {
      flush();
      blocks.push({ type: "heading", parts: inline(heading[1]) });
    } else if (item?.[1]) {
      flush();
      const previous = blocks.at(-1);
      if (previous?.type === "list") previous.items.push(inline(item[1]));
      else blocks.push({ type: "list", items: [inline(item[1])] });
    } else if (line === "") flush();
    else paragraph.push(line);
  }
  flush();
  return blocks;
}
