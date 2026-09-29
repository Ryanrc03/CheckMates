import { isValidQuad, type Quad } from "./geometry";

export type Analysis = { angle: number; corners: Quad | null; angleReliable: boolean; boundaryReliable: boolean };

function brightness(data: Uint8ClampedArray, offset: number): number {
  return (data[offset] * 299 + data[offset + 1] * 587 + data[offset + 2] * 114) / 1000;
}

function findBrightPage(image: ImageData): Quad | null {
  const { width, height, data } = image;
  const stride = Math.max(2, Math.floor(Math.min(width, height) / 240));
  let sampled = 0, bright = 0;
  const rows: { y: number; left: number; right: number }[] = [];
  for (let y = 0; y < height; y += stride) {
    let first = -1, last = -1, inRow = 0;
    for (let x = 0; x < width; x += stride) {
      const value = brightness(data, (y * width + x) * 4);
      sampled++;
      if (value > 190) { bright++; inRow++; if (first < 0) first = x; last = x; }
    }
    if (first >= 0 && inRow * stride > width * 0.25 && last - first > width * 0.25) rows.push({ y, left: first, right: last });
  }
  const ratio = bright / sampled;
  if (ratio < 0.08 || ratio > 0.84 || rows.length < 15) return null;
  const middle = rows[Math.floor(rows.length / 2)];
  const midWidth = middle.right - middle.left;
  const columnEdges = (x: number) => {
    let top = -1, bottom = -1, run = 0;
    for (let y = 0; y < height; y += stride) {
      if (brightness(data, (y * width + x) * 4) > 190) { run++; if (run === 4 && top < 0) top = y - stride * 3; if (run >= 4) bottom = y; }
      else run = 0;
    }
    return top >= 0 ? { top, bottom } : null;
  };
  const x1 = Math.round(middle.left + midWidth * 0.35), x2 = Math.round(middle.left + midWidth * 0.65);
  const edge1 = columnEdges(x1), edge2 = columnEdges(x2);
  if (!edge1 || !edge2 || Math.abs(edge1.top - edge2.top) / (x2 - x1) > 0.2 || Math.abs(edge1.bottom - edge2.bottom) / (x2 - x1) > 0.2) return null;
  const topIndex = Math.floor(rows.length * 0.03), bottomIndex = Math.floor(rows.length * 0.97);
  const top = rows[topIndex], bottom = rows[bottomIndex];
  if ((bottom.y - top.y) / height < 0.35) return null;
  const band = Math.max(2, Math.round(rows.length * 0.04));
  const average = (subset: typeof rows) => ({
    y: subset.reduce((sum, row) => sum + row.y, 0) / subset.length,
    left: subset.reduce((sum, row) => sum + row.left, 0) / subset.length,
    right: subset.reduce((sum, row) => sum + row.right, 0) / subset.length,
  });
  const a = average(rows.slice(Math.max(0, topIndex - band), topIndex + band + 1));
  const b = average(rows.slice(bottomIndex - band, Math.min(rows.length, bottomIndex + band + 1)));
  const margin = Math.max(2, Math.round(Math.min(width, height) * 0.008));
  const topY = Math.max(0, rows[0].y - margin), bottomY = Math.min(height, rows[rows.length - 1].y + margin);
  const project = (topX: number, bottomX: number, y: number) => topX + (bottomX - topX) * (y - a.y) / (b.y - a.y);
  const quad: Quad = [
    { x: Math.max(0, project(a.left, b.left, topY) - margin) / width, y: topY / height },
    { x: Math.min(width, project(a.right, b.right, topY) + margin) / width, y: topY / height },
    { x: Math.min(width, project(a.right, b.right, bottomY) + margin) / width, y: bottomY / height },
    { x: Math.max(0, project(a.left, b.left, bottomY) - margin) / width, y: bottomY / height },
  ];
  return isValidQuad(quad) ? quad : null;
}

export function analyzeReceiptImage(image: ImageData): Analysis {
  const { width, height, data } = image;
  const corners = findBrightPage(image);
  const points: [number, number][] = [];
  // Small receipt fonts disappear when sparse pixels are sampled at fixed strides.
  const stride = 1;
  const left = corners ? Math.floor(Math.min(corners[0].x, corners[3].x) * width) : 0;
  const right = corners ? Math.ceil(Math.max(corners[1].x, corners[2].x) * width) : width;
  const top = corners ? Math.floor(corners[0].y * height) : 0;
  const bottom = corners ? Math.ceil(corners[2].y * height) : height;
  for (let y = top; y < bottom; y += stride) for (let x = left; x < right; x += stride) {
    if (corners) {
      const edge = (x - left) / Math.max(1, right - left);
      if (edge < 0.04 || edge > 0.96) continue;
    }
    if (brightness(data, (y * width + x) * 4) < 110) points.push([x, y]);
  }
  if (points.length < 35 || points.length > 60000) return { angle: 0, corners, angleReliable: false, boundaryReliable: !!corners };
  const bins = new Uint32Array(height + width + 4);
  const score = (degrees: number) => {
    bins.fill(0);
    const slope = Math.tan(degrees * Math.PI / 180);
    for (const [x, y] of points) {
      const row = Math.round(y - (x - width / 2) * slope + width / 2);
      if (row >= 0 && row < bins.length) bins[row]++;
    }
    let sum = 0;
    for (const count of bins) sum += count * count;
    return sum;
  };
  let bestAngle = 0, bestScore = -Infinity;
  const coarseScores: number[] = [];
  for (let angle = -45; angle <= 45; angle++) {
    const value = score(angle); coarseScores.push(value);
    if (value > bestScore) { bestScore = value; bestAngle = angle; }
  }
  const coarse = bestAngle;
  for (let index = -9; index <= 9; index++) {
    const candidate = coarse + index * 0.1;
    if (candidate < -45 || candidate > 45) continue;
    const value = score(candidate);
    if (value > bestScore) { bestScore = value; bestAngle = candidate; }
  }
  coarseScores.sort((a, b) => a - b);
  const median = coarseScores[Math.floor(coarseScores.length / 2)];
  const angleReliable = bestScore > median * 1.15 && Math.abs(bestAngle) < 44.5;
  return { angle: angleReliable ? Math.round(bestAngle * 10) / 10 : 0, corners, angleReliable, boundaryReliable: !!corners };
}
