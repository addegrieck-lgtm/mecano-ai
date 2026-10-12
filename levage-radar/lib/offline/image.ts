/** Ré-encodage d'une photo côté navigateur : redimensionnement (2000 px max) et suppression des métadonnées EXIF (GPS…). */
export async function reencodeImage(file: Blob, max = 2000, quality = 0.85): Promise<Blob> {
  if (!file.type.startsWith("image/")) return file;
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * scale);
    const h = Math.round(bmp.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, w, h);
    bmp.close();
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("encodage"))), "image/jpeg", quality));
  } catch {
    return file; // format non décodable par le navigateur : envoyé tel quel (le serveur vérifie le type réel)
  }
}
