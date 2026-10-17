/** Shrinks a photo in the browser before upload so it fits the storage limits. */
export type PhotoMode = "basic" | "professional";

export const SHRINK: Record<PhotoMode, { maxSide: number; quality: number }> = {
  basic: { maxSide: 1200, quality: 0.8 },
  professional: { maxSide: 2000, quality: 0.9 },
};

/** Fits the long side into `maxSide`, keeping the ratio. Never upscales. */
export function targetSize(
  width: number,
  height: number,
  maxSide: number,
): { width: number; height: number } {
  const scale = Math.min(1, maxSide / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/** WebP first; Safari silently returns PNG for it, so retry with JPEG. Returns the original on any failure. */
export async function shrinkImage(file: File, mode: PhotoMode): Promise<File> {
  try {
    if (typeof createImageBitmap !== "function" || typeof document === "undefined") return file;
    const { maxSide, quality } = SHRINK[mode];
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const canvas = document.createElement("canvas");
    let blob: Blob | null;
    let name = "photo.webp";
    try {
      const { width, height } = targetSize(bitmap.width, bitmap.height, maxSide);
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) return file;
      context.drawImage(bitmap, 0, 0, width, height);
      const toBlob = (type: string, q: number) =>
        new Promise<Blob | null>((done) => canvas.toBlob(done, type, q));
      blob = await toBlob("image/webp", quality);
      if (blob?.type !== "image/webp") {
        // JPEG has no alpha: paint white behind the photo so transparent PNGs don't turn black.
        context.globalCompositeOperation = "destination-over";
        context.fillStyle = "#fff";
        context.fillRect(0, 0, width, height);
        blob = await toBlob("image/jpeg", quality + 0.05);
        name = "photo.jpg";
      }
    } finally {
      bitmap.close();
      // Frees the pixel memory right away (iOS Safari caps total canvas memory).
      canvas.width = canvas.height = 0;
    }
    if (!blob) return file;
    // 1.5 MiB = core's MAX_BASIC_IMAGE_SIZE (not imported: keeps core out of the browser bundle).
    // The original is already smaller (e.g. a tiny PNG) and within the basic limit: keep it.
    if (blob.size >= file.size && file.size <= 1.5 * 1024 * 1024) return file;
    return new File([blob], name, { type: blob.type });
  } catch {
    return file;
  }
}
