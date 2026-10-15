export type ArchivoDelTar = {
  readonly ruta: string;
  readonly modo: "100644" | "100755";
  readonly contenido: Uint8Array;
};

const BLOQUE = 512;
const decodificar = (b: Uint8Array) => new TextDecoder().decode(b).replace(/\0.*$/s, "");
const octal = (b: Uint8Array) => Number.parseInt(decodificar(b).trim() || "0", 8);

async function leerTodo(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const partes: Uint8Array[] = [];
  let largo = 0;
  const lector = stream.getReader();
  for (;;) {
    const { done, value } = await lector.read();
    if (done) break;
    partes.push(value);
    largo += value.length;
  }
  const todo = new Uint8Array(largo);
  let i = 0;
  for (const p of partes) {
    todo.set(p, i);
    i += p.length;
  }
  return todo;
}

/** `path=` de un encabezado PAX (registros `<largo> clave=valor\n`). */
function rutaPax(datos: Uint8Array): string | null {
  for (const linea of new TextDecoder().decode(datos).split("\n")) {
    const m = /^\d+ path=(.*)$/.exec(linea);
    if (m?.[1] !== undefined) return m[1];
  }
  return null;
}

/**
 * Archivos de un tarball de GitHub (ya descomprimido), sin la carpeta raíz `dueño-repo-sha/`. Entiende ustar
 * y los encabezados PAX que usa GitHub para rutas largas; ignora carpetas, enlaces y el encabezado global.
 */
export async function archivosDelTarball(stream: ReadableStream<Uint8Array>): Promise<ArchivoDelTar[]> {
  const tar = await leerTodo(stream);
  const archivos: ArchivoDelTar[] = [];
  let rutaLarga: string | null = null;
  for (let i = 0; i + BLOQUE <= tar.length; ) {
    const h = tar.subarray(i, i + BLOQUE);
    if (h.every((b) => b === 0)) break;
    const tamano = octal(h.subarray(124, 136));
    const tipo = String.fromCharCode(h[156] ?? 0);
    const datos = tar.subarray(i + BLOQUE, i + BLOQUE + tamano);
    i += BLOQUE + Math.ceil(tamano / BLOQUE) * BLOQUE;
    if (tipo === "x") {
      rutaLarga = rutaPax(datos);
      continue;
    }
    if (tipo !== "0" && tipo !== "\0") {
      rutaLarga = null;
      continue;
    }
    const prefijo = decodificar(h.subarray(345, 500));
    const nombre = decodificar(h.subarray(0, 100));
    const completa = rutaLarga ?? (prefijo ? `${prefijo}/${nombre}` : nombre);
    rutaLarga = null;
    const ruta = completa.split("/").slice(1).join("/");
    if (!ruta) continue;
    const modo = octal(h.subarray(100, 108)) & 0o111 ? "100755" : "100644";
    archivos.push({ ruta, modo, contenido: datos.slice() });
  }
  return archivos;
}
