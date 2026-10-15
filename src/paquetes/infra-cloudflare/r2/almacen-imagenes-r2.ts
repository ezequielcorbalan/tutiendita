import type { AlmacenImagenes, GeneradorIds, MimePermitido } from "../../core/index";

const EXTENSIONES: Record<MimePermitido, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const esMimePermitido = (mime: string): mime is MimePermitido => Object.hasOwn(EXTENSIONES, mime);

/** Guarda imágenes en R2 con key `${ulid}.${ext}`; el dominio ya validó MIME y tamaño. */
export function crearAlmacenImagenesR2(bucket: R2Bucket, ids: GeneradorIds): AlmacenImagenes {
  return {
    async guardar(bytes, tipoMime) {
      if (!esMimePermitido(tipoMime)) {
        throw new Error(`AlmacenImagenesR2: MIME no permitido ${tipoMime}`);
      }
      const key = `${ids.nuevoId()}.${EXTENSIONES[tipoMime]}`;
      await bucket.put(key, bytes, { httpMetadata: { contentType: tipoMime } });
      return { key };
    },

    async borrar(key) {
      await bucket.delete(key);
    },
  };
}
