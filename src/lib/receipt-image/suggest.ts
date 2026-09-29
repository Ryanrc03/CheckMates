import type { Analysis } from "./analyze";

export function residualTextAngle(analysis: Analysis, width: number, height: number): number {
  if (!analysis.angleReliable) return 0;
  if (!analysis.corners) return analysis.angle;
  const [left, right] = analysis.corners;
  const borderAngle = Math.atan2((right.y - left.y) * height, (right.x - left.x) * width) * 180 / Math.PI;
  const residual = Math.max(-45, Math.min(45, analysis.angle - borderAngle));
  return Math.abs(residual) < 0.5 ? 0 : Math.round(residual * 10) / 10;
}
