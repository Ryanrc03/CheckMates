const FAILED = "Could not prepare the photo for cloud recognition. Choose Standard or Precise.";
/** The 2.3 MB corrected PNG took 69 s to read; the same photo as a 260 KB JPEG took 11 s with identical results (2026-10-22). */
export async function toUploadDataUrl(image: Blob, maxEdge = 2048): Promise<string> {
  const bitmap = await createImageBitmap(image).catch(() => { throw new Error(FAILED); });
  let canvas: HTMLCanvasElement | undefined;
  try {
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height)); const width = Math.max(1, Math.round(bitmap.width * scale)); const height = Math.max(1, Math.round(bitmap.height * scale));
    const element = canvas = document.createElement("canvas"); element.width = width; element.height = height;
    const context = element.getContext("2d"); if (!context) throw new Error(FAILED);
    context.imageSmoothingQuality = "high"; context.fillStyle = "#fff"; context.fillRect(0, 0, width, height); context.drawImage(bitmap, 0, 0, width, height); // JPEG has no alpha: paint transparent PNG areas white, not black
    const blob = await new Promise<Blob>((resolve, reject) => element.toBlob(b => b ? resolve(b) : reject(new Error(FAILED)), "image/jpeg", 0.85));
    return await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error(FAILED)); reader.readAsDataURL(blob); });
  } finally { bitmap.close(); if (canvas) canvas.width = canvas.height = 0; } // release the backing store; iOS Safari caps total canvas memory
}
