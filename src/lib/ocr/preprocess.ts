export async function prepareReceiptImage(file: File, rotation: 0 | 90 | 180 | 270): Promise<Blob> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("Choose a JPEG, PNG, or WebP photo. HEIC and PDF are not supported.");
  if (file.size > 15 * 1024 * 1024) throw new Error("This photo exceeds 15 MiB. Resize it or choose a smaller photo.");
  let image: ImageBitmap;
  try { image = await createImageBitmap(file, { imageOrientation: "from-image" }); }
  catch { throw new Error("This image could not be opened. Export it as JPEG or PNG and try again."); }
  try {
    if (!image.width || !image.height) throw new Error("The image has no visible pixels.");
    const scale = Math.min(1, Math.sqrt(6000000 / (image.width * image.height)));
    const width = Math.max(1, Math.floor(image.width * scale)); const height = Math.max(1, Math.floor(image.height * scale));
    const canvas = document.createElement("canvas"); const sideways = rotation === 90 || rotation === 270;
    canvas.width = sideways ? height : width; canvas.height = sideways ? width : height;
    const context = canvas.getContext("2d"); if (!context) throw new Error("Image preparation is unavailable. Try another browser.");
    context.fillStyle = "white"; context.fillRect(0, 0, canvas.width, canvas.height);
    context.translate(canvas.width / 2, canvas.height / 2); context.rotate(rotation * Math.PI / 180);
    context.drawImage(image, -width / 2, -height / 2, width, height);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("Could not prepare the image. Try a smaller photo.")), "image/png"));
  } finally { image.close(); }
}
