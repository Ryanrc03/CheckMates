import { describe, expect, it } from "vitest";
import { analyzeReceiptImage } from "./analyze";

function raster(width: number, height: number, sample: (x: number, y: number) => number): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const v = sample(x, y); const offset = (y * width + x) * 4;
    data[offset] = v; data[offset + 1] = v; data[offset + 2] = v; data[offset + 3] = 255;
  }
  return { width, height, data } as ImageData;
}

function textRows(angle: number): ImageData {
  const radians = angle * Math.PI / 180, co = Math.cos(radians), si = Math.sin(radians);
  return raster(360, 360, (x, y) => {
    const u = (x - 180) * co + (y - 180) * si;
    const v = -(x - 180) * si + (y - 180) * co;
    if (Math.abs(u) > 110) return 255;
    for (const row of [-85, -45, -5, 35, 75]) {
      if (Math.abs(v - row) < 3 && Math.floor((u + 110) / 23) % 5 !== 4) return 15;
    }
    return 255;
  });
}

describe("per-photo analysis", () => {
  it.each([-30, -15, -7, 0, 7, 15, 30, 13.4])("estimates the current photo's %s° text angle", degrees => {
    const result = analyzeReceiptImage(textRows(degrees));
    expect(result.angleReliable).toBe(true);
    expect(result.angle).toBeCloseTo(degrees, 0);
    expect(result.boundaryReliable).toBe(false);
  });

  it("finds a dark-background receipt quadrilateral conservatively", () => {
    const image = raster(320, 400, (x, y) => {
      if (y < 35 || y > 365) return 20;
      const t = (y - 35) / 330;
      const left = 75 - 40 * t, right = 240 + 48 * t;
      return x >= left && x <= right ? 245 : 20;
    });
    const result = analyzeReceiptImage(image);
    expect(result.boundaryReliable).toBe(true);
    expect(result.corners).not.toBeNull();
    expect(result.corners![0].x).toBeCloseTo(75 / 320, 1);
    expect(result.corners![3].x).toBeCloseTo(35 / 320, 1);
    expect(result.corners![2].y).toBeGreaterThan(0.91);
  });

  it("does not crop an all-white image with no visible page boundary", () => {
    const result = analyzeReceiptImage(raster(240, 320, () => 255));
    expect(result.boundaryReliable).toBe(false);
    expect(result.corners).toBeNull();
    expect(result.angleReliable).toBe(false);
  });

  it("keeps a strongly rotated page whole when horizontal edge fitting would cut its corners", () => {
    const angle = 20 * Math.PI / 180, co = Math.cos(angle), si = Math.sin(angle);
    const image = raster(400, 440, (x, y) => {
      const u = (x - 200) * co + (y - 220) * si;
      const v = -(x - 200) * si + (y - 220) * co;
      return Math.abs(u) < 90 && Math.abs(v) < 150 ? 245 : 20;
    });
    expect(analyzeReceiptImage(image).boundaryReliable).toBe(false);
  });
});
