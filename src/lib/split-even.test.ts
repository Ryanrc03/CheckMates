import { describe, expect, it } from "vitest";
import type { Bill } from "@/types/bill";
import { allocateEvenlyFrom, explainSplitBill, splitBill } from "./split";

const people = [{ id: "a", name: "Alice" }, { id: "b", name: "Bob" }, { id: "c", name: "Carol" }];
const items: Bill["items"] = [
  { id: "1", name: "Burger", priceCents: 1495, personIds: [] },
  { id: "2", name: "Fries", priceCents: 595, personIds: ["b"] },
  { id: "3", name: "Salad", priceCents: 1250, personIds: [] },
];

describe("even split mode", () => {
  it("ignores assignments and keeps every share within one cent", () => {
    const result = splitBill({ people, items, taxCents: 304, tipCents: 664, splitMode: "even" });
    expect(result.totalCents).toBe(4308);
    expect(result.people.map(p => p.totalCents)).toEqual([1436, 1436, 1436]);
    const odd = splitBill({ people, items: [{ ...items[0], priceCents: 1001 }], taxCents: 1, tipCents: 1, splitMode: "even" });
    const totals = odd.people.map(p => p.totalCents);
    expect(totals.reduce((a, b) => a + b, 0)).toBe(1003);
    expect(Math.max(...totals) - Math.min(...totals)).toBeLessThanOrEqual(1);
    expect(odd.people.reduce((s, p) => s + p.itemsCents, 0)).toBe(1001);
    expect(odd.people.reduce((s, p) => s + p.taxCents, 0)).toBe(1);
    expect(odd.people.reduce((s, p) => s + p.tipCents, 0)).toBe(1);
  });

  it("rotates leftover cents across pools instead of piling them on the first friend", () => {
    const detail = explainSplitBill({ people, items: [{ ...items[0], priceCents: 1 }], taxCents: 1, tipCents: 1, splitMode: "even" });
    expect(detail.subtotal?.parts.map(p => p.cents)).toEqual([1, 0, 0]);
    expect(detail.tax.parts.map(p => p.cents)).toEqual([0, 1, 0]);
    expect(detail.tip.parts.map(p => p.cents)).toEqual([0, 0, 1]);
    expect(detail.items).toEqual([]);
  });

  it("still validates amounts and people", () => {
    expect(() => splitBill({ people: [], items, taxCents: 0, tipCents: 0, splitMode: "even" })).toThrow();
    expect(() => splitBill({ people, items: [{ ...items[0], priceCents: 0 }], taxCents: 5, tipCents: 0, splitMode: "even" })).toThrow(/subtotal/);
    expect(() => splitBill({ people, items: [{ ...items[0], personIds: ["ghost"] }], taxCents: 0, tipCents: 0, splitMode: "even" })).toThrow(/unknown/);
    const huge = allocateEvenlyFrom(Number.MAX_SAFE_INTEGER, 2, 1).trace.parts.map(p => p.cents);
    expect(huge[0] + huge[1]).toBe(Number.MAX_SAFE_INTEGER);
  });

  it("reports item quantities in the by-dish breakdown", () => {
    const detail = explainSplitBill({ people, items: [{ id: "cola", name: "Cola", priceCents: 500, quantity: 2, personIds: ["a", "b"] }], taxCents: 0, tipCents: 0 });
    expect(detail.items[0].quantity).toBe(2);
    expect(detail.result.people.map(p => p.totalCents)).toEqual([250, 250, 0]);
  });
});
