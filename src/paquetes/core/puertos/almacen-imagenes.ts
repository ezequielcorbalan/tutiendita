export const MIME_PERMITIDOS = ["image/jpeg", "image/png", "image/webp"] as const;
export type MimePermitido = (typeof MIME_PERMITIDOS)[number];
export const TAMANO_MAXIMO_IMAGEN = 5 * 1024 * 1024;

export interface AlmacenImagenes {
  guardar(bytes: Uint8Array, tipoMime: string): Promise<{ key: string }>;
  borrar(key: string): Promise<void>;
}
