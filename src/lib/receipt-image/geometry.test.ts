import { describe, expect, it } from "vitest";
import { isValidQuad, mapDestinationToSource, type Quad } from "./geometry";

const rectangle: Quad = [{ x: 0.1, y: 0.2 }, { x: 0.9, y: 0.2 }, { x: 0.9, y: 0.8 }, { x: 0.1, y: 0.8 }];

describe("receipt correction geometry", () => {
  it("accepts an ordered page and rejects crossed, collapsed or out-of-bounds corners", () => {
    expect(isValidQuad(rectangle)).toBe(true);
    expect(isValidQuad([rectangle[0], rectangle[2], rectangle[1], rectangle[3]])).toBe(false);
    expect(isValidQuad([{ x: -0.01, y: 0 }, ...rectangle.slice(1)] as Quad)).toBe(false);
    expect(isValidQuad([{ x: 0.4, y: 0.5 }, { x: 0.41, y: 0.5 }, { x: 0.41, y: 0.51 }, { x: 0.4, y: 0.51 }])).toBe(false);
  });

  it("maps the rectified image corners back to their original locations", () => {
    const source: Quad = [{ x: 0.25, y: 0.1 }, { x: 0.7, y: 0.2 }, { x: 0.9, y: 0.85 }, { x: 0.1, y: 0.9 }];
    for (const [index, coordinate] of [[0, 0], [1, 0], [1, 1], [0, 1]].entries()) {
      const [x, y] = coordinate;
      const actual = mapDestinationToSource(source, x, y);
      expect(actual.x).toBeCloseTo(source[index].x, 8);
      expect(actual.y).toBeCloseTo(source[index].y, 8);
    }
    const center = mapDestinationToSource(source, 0.5, 0.5);
    expect(center.x).toBeGreaterThan(0.35);
    expect(center.x).toBeLessThan(0.65);
    expect(center.y).toBeGreaterThan(0.35);
    expect(center.y).toBeLessThan(0.65);
  });
});
