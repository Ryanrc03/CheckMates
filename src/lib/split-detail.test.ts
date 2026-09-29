import { describe, expect, it } from "vitest";
import type { Bill } from "@/types/bill";
import { allocateCents, allocateCentsDetailed, explainSplitBill, splitBill } from "./split";

const bill: Bill = {
  people: [{ id: "a", name: "Same" }, { id: "b", name: "Same" }],
  items: [
    { id: "shared", name: "Shared", priceCents: 1001, personIds: ["b", "a"] },
    { id: "side", name: "Side", priceCents: 500, personIds: ["b"] },
  ],
  taxCents: 151,
  tipCents: 302,
};

describe("exact split explanation", () => {
  it("keeps exact shared-item and fee remainders", () => {
    const before = structuredClone(bill);
    const detail = explainSplitBill(bill);
    expect(detail.items[0].personIds).toEqual(["a", "b"]);
    expect(detail.items[0].allocation.parts.map(p => [p.baseCents, p.extraCent, p.cents])).toEqual([[500, true, 501], [500, false, 500]]);
    expect(detail.tax.parts.map(p => [p.baseCents, p.extraCent, p.cents])).toEqual([[50, false, 50], [100, true, 101]]);
    expect(detail.tip.parts.map(p => [p.baseCents, p.extraCent, p.cents])).toEqual([[100, true, 101], [201, false, 201]]);
    expect(detail.result.people.map(p => [p.itemsCents, p.taxCents, p.tipCents, p.totalCents])).toEqual([[501, 50, 101, 652], [1000, 101, 201, 1302]]);
    expect(detail.result.totalCents).toBe(1954);
    expect(detail.result).toEqual(splitBill(bill));
    expect(bill).toEqual(before);
  });

  it("handles zero amounts, zero weights, and stable ties", () => {
    expect(allocateCentsDetailed(2, [1, 1, 1]).parts.map(p => p.cents)).toEqual([1, 1, 0]);
    expect(allocateCentsDetailed(5, [0, 1, 1]).parts.map(p => p.cents)).toEqual([0, 3, 2]);
    expect(allocateCentsDetailed(0, [0, 0]).weightSum).toBe("0");
    const zero = explainSplitBill({ ...bill, items: [{ ...bill.items[0], priceCents: 0 }], taxCents: 0, tipCents: 0 });
    expect(zero.tax.weightSum).toBe("0");
    expect(zero.result.people.map(p => p.totalCents)).toEqual([0, 0]);
    expect(allocateCents(Number.MAX_SAFE_INTEGER, [1, 1])).toEqual(allocateCentsDetailed(Number.MAX_SAFE_INTEGER, [1, 1]).parts.map(p => p.cents));
  });

  it("retains validation for invalid assignments and unsafe values", () => {
    expect(() => explainSplitBill({ ...bill, people: [...bill.people, bill.people[0]] })).toThrow();
    expect(() => explainSplitBill({ ...bill, items: [{ ...bill.items[0], personIds: ["a", "a"] }] })).toThrow();
    expect(() => explainSplitBill({ ...bill, items: [{ ...bill.items[0], personIds: ["unknown"] }] })).toThrow();
    expect(() => explainSplitBill({ ...bill, taxCents: Number.MAX_SAFE_INTEGER })).toThrow();
    expect(() => allocateCentsDetailed(1, [0])).toThrow();
  });
});
