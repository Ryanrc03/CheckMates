import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { spatialRows, type OcrBox } from "./spatial";
import { parseReceiptText } from "../parseReceipt";
const load = (name: string): OcrBox[] => JSON.parse(readFileSync(`tests/fixtures/ocr/${name}.json`, "utf8")).items;
describe("spatialRows", () => {
  it("joins name and price boxes of the diner receipt into lines the parser understands", () => {
    const rows = spatialRows(load("paddle-clear-diner"));
    expect(rows.text.split("\n")).toEqual(["WEEKEND DINER", "Burger 14.95", "Fries 5.95", "Lemonade 3.50", "Subtotal 24.40", "Tax 2.01", "Total 26.41"]);
    const draft = parseReceiptText(rows.text); expect(draft.items.map(i => [i.name, i.priceCents])).toEqual([["Burger", 1495], ["Fries", 595], ["Lemonade", 350]]); expect(draft.taxCents).toBe(201); expect(draft.printedTotalCents).toBe(2641); expect(rows.meanScore).toBeGreaterThan(0.9);
  });
  it("recovers the six Line Thai lines with prices, tax and totals", () => {
    const rows = spatialRows(load("paddle-line-thai")); const lines = rows.text.split("\n");
    for (const expected of ["Pineapple Fried Rice $13.90", "Fried Tofu (12) $7.90", "Milk Tea $4.00", "Pad Thai ×2 $25.80", "Pad Kra Pow $12.90", "Brown Sugar Milk ×2 $8.00", "Subtotal $72.50", "sale tax (8.25%) $5.98", "Total $78.48"]) expect(lines).toContain(expected);
    const draft = parseReceiptText(rows.text); expect(draft.items.map(i => i.priceCents)).toEqual([1390, 790, 400, 2580, 1290, 800]); expect(draft.taxCents).toBe(598); expect(draft.printedSubtotalCents).toBe(7250); expect(draft.printedTotalCents).toBe(7848);
  });
  it("normalises a tilted receipt using polygon angles", () => {
    const upright = load("paddle-clear-diner"); const angle = 7 * Math.PI / 180; const rot = ([x, y]: [number, number]): [number, number] => [Math.round(x * Math.cos(angle) - y * Math.sin(angle)), Math.round(x * Math.sin(angle) + y * Math.cos(angle))];
    const tilted: OcrBox[] = upright.map(b => ({ text: b.text, score: b.score, poly: [rot([b.bbox!.x0, b.bbox!.y0]), rot([b.bbox!.x1, b.bbox!.y0]), rot([b.bbox!.x1, b.bbox!.y1]), rot([b.bbox!.x0, b.bbox!.y1])] }));
    const rows = spatialRows(tilted); expect(Math.abs(rows.estimatedAngleDeg - 7)).toBeLessThan(1.5); expect(rows.text.split("\n")).toContain("Burger 14.95");
  });
  it("returns empty output for no boxes", () => { expect(spatialRows([])).toEqual({ lines: [], text: "", estimatedAngleDeg: 0, meanScore: 0 }); });
});
