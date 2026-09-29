import { ALLOWED_IMAGE_TYPES, MAX_STORED_PHOTO_BYTES, MAX_UPLOAD_BYTES } from "@/lib/validation/schemas";

/**
 * Prépare une photo pour stockage :
 * - liste blanche MIME + taille maximale (upload dangereux refusé),
 * - ré-encodage via canvas en JPEG (supprime métadonnées EXIF/GPS et tout contenu non-image),
 * - redimensionnement (1600 px max) pour tenir en mode local.
 */
export async function prepareImage(file: File): Promise<{ url: string; mime_type: "image/jpeg"; size_bytes: number }> {
  if (!(ALLOWED_IMAGE_TYPES as readonly string[]).includes(file.type)) throw new Error("Format non autorisé (JPEG, PNG ou WebP uniquement)");
  if (file.size > MAX_UPLOAD_BYTES) throw new Error("Image trop volumineuse (10 Mo maximum)");
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error("Fichier image illisible");
  });
  const max = 1600;
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Traitement d'image indisponible");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  let quality = 0.78;
  let url = canvas.toDataURL("image/jpeg", quality);
  while (url.length * 0.75 > MAX_STORED_PHOTO_BYTES && quality > 0.3) {
    quality -= 0.15;
    url = canvas.toDataURL("image/jpeg", quality);
  }
  const size_bytes = Math.round((url.length - "data:image/jpeg;base64,".length) * 0.75);
  if (size_bytes > MAX_STORED_PHOTO_BYTES) throw new Error("Image trop lourde après compression");
  return { url, mime_type: "image/jpeg", size_bytes };
}
