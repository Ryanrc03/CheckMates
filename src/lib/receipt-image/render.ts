import { destinationToSourceTransform, isValidQuad, type Quad } from "./geometry";

export type Adjustment = { corners: Quad | null; angle: number; quarterTurns: number };

function canvas(width: number, height: number): HTMLCanvasElement {
  const result = document.createElement("canvas");
  result.width = Math.max(1, Math.round(width)); result.height = Math.max(1, Math.round(height));
  return result;
}

function fit(width: number, height: number, maxPixels: number): [number, number] {
  const scale = Math.min(1, Math.sqrt(maxPixels / (width * height)));
  return [Math.max(1, Math.floor(width * scale)), Math.max(1, Math.floor(height * scale))];
}

function context(source: HTMLCanvasElement): CanvasRenderingContext2D {
  const result = source.getContext("2d", { willReadFrequently: true });
  if (!result) throw new Error("Image preparation is unavailable. Try another browser.");
  return result;
}

export function renderCorrection(image: ImageBitmap, adjustment: Adjustment, maxPixels = 6000000): HTMLCanvasElement {
  const turns = ((adjustment.quarterTurns % 4) + 4) % 4;
  const sideways = turns % 2 === 1;
  const [orientedWidth, orientedHeight] = fit(sideways ? image.height : image.width, sideways ? image.width : image.height, maxPixels);
  const oriented = canvas(orientedWidth, orientedHeight);
  const first = context(oriented);
  first.fillStyle = "white"; first.fillRect(0, 0, oriented.width, oriented.height);
  first.translate(oriented.width / 2, oriented.height / 2);
  first.rotate(turns * Math.PI / 2);
  first.drawImage(image, -(sideways ? oriented.height : oriented.width) / 2, -(sideways ? oriented.width : oriented.height) / 2, sideways ? oriented.height : oriented.width, sideways ? oriented.width : oriented.height);

  let aligned = oriented;
  if (adjustment.corners) {
    const corners = adjustment.corners;
    if (!isValidQuad(corners)) throw new Error("Receipt corners overlap or fall outside the photo.");
    const distance = (a: number, b: number) => Math.hypot((corners[a].x - corners[b].x) * oriented.width, (corners[a].y - corners[b].y) * oriented.height);
    // Rectification compresses the narrow side; retaining extra samples keeps small price digits readable.
    const rawWidth = Math.max(distance(0, 1), distance(3, 2)) * 1.4;
    const rawHeight = Math.max(distance(0, 3), distance(1, 2)) * 1.4;
    const [width, height] = fit(rawWidth, rawHeight, maxPixels);
    const output = canvas(width, height);
    const target = context(output).createImageData(width, height);
    const pixels = first.getImageData(0, 0, oriented.width, oriented.height).data;
    const map = destinationToSourceTransform(corners);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const point = map((x + 0.5) / width, (y + 0.5) / height);
      const sx = Math.max(0, Math.min(oriented.width - 1.001, point.x * oriented.width));
      const sy = Math.max(0, Math.min(oriented.height - 1.001, point.y * oriented.height));
      const left = Math.floor(sx), top = Math.floor(sy), fx = sx - left, fy = sy - top;
      const a = (top * oriented.width + left) * 4;
      const b = a + 4, c = a + oriented.width * 4, d = c + 4;
      const offset = (y * width + x) * 4;
      for (let channel = 0; channel < 3; channel++) target.data[offset + channel] = pixels[a + channel] * (1 - fx) * (1 - fy) + pixels[b + channel] * fx * (1 - fy) + pixels[c + channel] * (1 - fx) * fy + pixels[d + channel] * fx * fy;
      target.data[offset + 3] = 255;
    }
    context(output).putImageData(target, 0, 0);
    aligned = output;
  }

  const angle = Number.isFinite(adjustment.angle) ? Math.max(-45, Math.min(45, adjustment.angle)) : 0;
  if (Math.abs(angle) < 0.05) return aligned;
  const radians = -angle * Math.PI / 180;
  const width = Math.abs(aligned.width * Math.cos(radians)) + Math.abs(aligned.height * Math.sin(radians));
  const height = Math.abs(aligned.width * Math.sin(radians)) + Math.abs(aligned.height * Math.cos(radians));
  const [finalWidth, finalHeight] = fit(width, height, maxPixels);
  const output = canvas(finalWidth, finalHeight);
  const target = context(output);
  target.fillStyle = "white"; target.fillRect(0, 0, finalWidth, finalHeight);
  target.translate(finalWidth / 2, finalHeight / 2);
  target.rotate(radians);
  const scale = Math.min(finalWidth / width, finalHeight / height);
  target.drawImage(aligned, -aligned.width * scale / 2, -aligned.height * scale / 2, aligned.width * scale, aligned.height * scale);
  return output;
}

export async function correctionBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("Could not prepare the image. Try a smaller photo.")), "image/png"));
}
