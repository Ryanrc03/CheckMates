export type OcrBox = { text: string; score?: number; poly?: [number, number][]; bbox?: { x0: number; y0: number; x1: number; y1: number } };
export type SpatialLine = { text: string; bbox: { x0: number; y0: number; x1: number; y1: number }; confidence: number };
export type SpatialRows = { lines: SpatialLine[]; text: string; estimatedAngleDeg: number; meanScore: number };
const corners = (box: OcrBox): [number, number][] => box.poly && box.poly.length >= 4 ? box.poly : box.bbox ? [[box.bbox.x0, box.bbox.y0], [box.bbox.x1, box.bbox.y0], [box.bbox.x1, box.bbox.y1], [box.bbox.x0, box.bbox.y1]] : [];
/** Rebuild receipt lines from OCR text boxes: estimate the page tilt from wide word polygons, rotate everything upright, cluster by vertical centre, then read each row left to right. */
export function spatialRows(boxes: OcrBox[]): SpatialRows {
  const usable = boxes.filter(b => b.text.trim() && corners(b).length >= 4); if (!usable.length) return { lines: [], text: "", estimatedAngleDeg: 0, meanScore: 0 };
  const angles = usable.filter(b => b.poly && /[a-z]/i.test(b.text)).map(b => { const [p0, p1] = b.poly!; return { angle: Math.atan2(p1[1] - p0[1], p1[0] - p0[0]), width: Math.hypot(p1[0] - p0[0], p1[1] - p0[1]), height: Math.hypot(b.poly![3][0] - p0[0], b.poly![3][1] - p0[1]) }; }).filter(a => a.width > 3 * a.height).map(a => a.angle).sort((a, b) => a - b);
  const angle = angles.length ? angles[Math.floor(angles.length / 2)] : 0; const co = Math.cos(angle); const si = Math.sin(angle);
  const transformed = usable.map(b => { const pts = corners(b).map(([x, y]) => [x * co + y * si, -x * si + y * co] as [number, number]); const xs = pts.map(p => p[0]); const ys = pts.map(p => p[1]); const bbox = { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) }; return { box: b, bbox, cy: (bbox.y0 + bbox.y1) / 2, height: bbox.y1 - bbox.y0 }; }).sort((a, b) => a.cy - b.cy);
  const groups: { cy: number; height: number; members: typeof transformed }[] = [];
  for (const item of transformed) {
    const candidates = groups.filter(g => Math.abs(g.cy - item.cy) < 0.55 * Math.max(g.height, item.height)).sort((a, b) => Math.abs(a.cy - item.cy) - Math.abs(b.cy - item.cy));
    let group = candidates[0]; if (!group) { group = { cy: item.cy, height: item.height, members: [] }; groups.push(group); }
    group.members.push(item); group.cy = group.members.reduce((s, m) => s + m.cy, 0) / group.members.length; group.height = Math.max(group.height, item.height);
  }
  const minX = Math.min(0, ...transformed.map(t => t.bbox.x0)); const minY = Math.min(0, ...transformed.map(t => t.bbox.y0));
  const lines = groups.sort((a, b) => a.cy - b.cy).map(g => { g.members.sort((a, b) => a.bbox.x0 - b.bbox.x0); const scores = g.members.map(m => m.box.score ?? 0); return { text: g.members.map(m => m.box.text.trim()).join(" "), bbox: { x0: Math.min(...g.members.map(m => m.bbox.x0)) - minX, y0: Math.min(...g.members.map(m => m.bbox.y0)) - minY, x1: Math.max(...g.members.map(m => m.bbox.x1)) - minX, y1: Math.max(...g.members.map(m => m.bbox.y1)) - minY }, confidence: scores.reduce((s, v) => s + v, 0) / scores.length }; });
  const meanScore = usable.reduce((s, b) => s + (b.score ?? 0), 0) / usable.length;
  return { lines, text: lines.map(l => l.text).join("\n"), estimatedAngleDeg: angle * 180 / Math.PI, meanScore };
}
