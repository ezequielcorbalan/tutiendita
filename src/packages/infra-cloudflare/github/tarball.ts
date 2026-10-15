export type TarEntry = {
  readonly path: string;
  readonly mode: "100644" | "100755";
  readonly content: Uint8Array;
};

const BLOCK = 512;
const decode = (b: Uint8Array) => new TextDecoder().decode(b).replace(/\0.*$/s, "");
const octal = (b: Uint8Array) => Number.parseInt(decode(b).trim() || "0", 8);

async function readAll(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const parts: Uint8Array[] = [];
  let length = 0;
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
    length += value.length;
  }
  const all = new Uint8Array(length);
  let i = 0;
  for (const p of parts) {
    all.set(p, i);
    i += p.length;
  }
  return all;
}

/** `path=` of a PAX header (records `<length> key=value\n`). */
function paxPath(data: Uint8Array): string | null {
  for (const line of new TextDecoder().decode(data).split("\n")) {
    const m = /^\d+ path=(.*)$/.exec(line);
    if (m?.[1] !== undefined) return m[1];
  }
  return null;
}

/**
 * Files of a GitHub tarball (already decompressed), without the root folder `owner-repo-sha/`. Understands
 * ustar and the PAX headers GitHub uses for long paths; ignores folders, links and the global header.
 */
export async function tarballFiles(stream: ReadableStream<Uint8Array>): Promise<TarEntry[]> {
  const tar = await readAll(stream);
  const files: TarEntry[] = [];
  let longPath: string | null = null;
  for (let i = 0; i + BLOCK <= tar.length; ) {
    const h = tar.subarray(i, i + BLOCK);
    if (h.every((b) => b === 0)) break;
    const size = octal(h.subarray(124, 136));
    const type = String.fromCharCode(h[156] ?? 0);
    const data = tar.subarray(i + BLOCK, i + BLOCK + size);
    i += BLOCK + Math.ceil(size / BLOCK) * BLOCK;
    if (type === "x") {
      longPath = paxPath(data);
      continue;
    }
    if (type !== "0" && type !== "\0") {
      longPath = null;
      continue;
    }
    const prefix = decode(h.subarray(345, 500));
    const name = decode(h.subarray(0, 100));
    const fullPath = longPath ?? (prefix ? `${prefix}/${name}` : name);
    longPath = null;
    const path = fullPath.split("/").slice(1).join("/");
    if (!path) continue;
    const mode = octal(h.subarray(100, 108)) & 0o111 ? "100755" : "100644";
    files.push({ path, mode, content: data.slice() });
  }
  return files;
}
