import { describe, expect, it } from "vitest";
import { residualTextAngle } from "./suggest";
import type { Analysis } from "./analyze";

const rectangle: Analysis = { angle: 13, angleReliable: true, boundaryReliable: true, corners: [{ x: 0.2, y: 0.1 }, { x: 0.8, y: 0.1 }, { x: 0.8, y: 0.9 }, { x: 0.2, y: 0.9 }] };

describe("combined border and text correction", () => {
  it("keeps a reliable text angle when page borders are level", () => {
    expect(residualTextAngle(rectangle, 400, 500)).toBeCloseTo(13);
  });

  it("subtracts the angle already removed by straightening a sloped top border", () => {
    const slope = Math.tan(10 * Math.PI / 180) * 0.6 * 400 / 500;
    const analysis: Analysis = { ...rectangle, corners: [{ x: 0.2, y: 0.1 }, { x: 0.8, y: 0.1 + slope }, { x: 0.8, y: 0.9 }, { x: 0.2, y: 0.9 }] };
    expect(residualTextAngle(analysis, 400, 500)).toBeCloseTo(3, 0);
  });

  it("uses no text correction when the text angle is unreliable", () => {
    expect(residualTextAngle({ ...rectangle, angleReliable: false }, 400, 500)).toBe(0);
  });
});
