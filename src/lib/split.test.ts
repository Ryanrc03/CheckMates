import { describe, expect, it } from "vitest";
import { allocateCents, splitBill } from "./split";
import type { Bill } from "@/types/bill";

const bill: Bill = {
  items: [
    { id: "a", name: "Burger", priceCents: 1001, personIds: ["a", "b"] },
    { id: "b", name: "Fries", priceCents: 500, personIds: ["b"] },
  ],
  people: [{ id: "a", name: "A" }, { id: "b", name: "B" }],
  taxCents: 151,
  tipCents: 302,
};

describe("splitBill", () => {
  it("uses participant order, never click order, for odd cents", () => {
    const reversed = structuredClone(bill);
    reversed.items[0].personIds.reverse();
    const before = structuredClone(reversed);
    expect(splitBill(reversed)).toEqual(splitBill(bill));
    expect(reversed).toEqual(before);
    const result = splitBill(reversed);
    expect(result.people.map(p => [p.itemsCents, p.taxCents, p.tipCents, p.totalCents])).toEqual([[501, 50, 101, 652], [1000, 101, 201, 1302]]);
  });

  it("allocates remainders stably without charging zero weights", () => {
    expect(allocateCents(2, [1, 1, 1])).toEqual([1, 1, 0]);
    expect(allocateCents(5, [0, 1, 1])).toEqual([0, 3, 2]);
  });

  it("rejects invalid bills and unsafe sums", () => {
    for (const value of [-1, 0.1, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => splitBill({ ...bill, taxCents: value })).toThrow();
      expect(() => allocateCents(1, [value])).toThrow();
    }
    expect(() => splitBill({ ...bill, people: [] })).toThrow();
    expect(() => splitBill({ ...bill, items: [] })).toThrow();
    expect(() => splitBill({ ...bill, items: [{ ...bill.items[0], personIds: ["a", "a"] }] })).toThrow();
    expect(() => splitBill({ ...bill, items: bill.items.map(i => ({ ...i, priceCents: Number.MAX_SAFE_INTEGER })) })).toThrow();
    expect(() => splitBill({ ...bill, taxCents: Number.MAX_SAFE_INTEGER })).toThrow();
    expect(() => splitBill({ ...bill, items: [{ ...bill.items[0], priceCents: 0 }] })).toThrow();
  });

  it("conserves each amount over fixed multi-person bills", () => {
    for (const prices of [[1, 2, 3], [1001, 500, 99], [0, 7, 9000]]) {
      const input: Bill = { people: [{ id: "a", name: "A" }, { id: "b", name: "B" }, { id: "c", name: "C" }], items: prices.map((priceCents, i) => ({ id: String(i), name: "Dish", priceCents, personIds: i === 0 ? ["c", "a"] : ["b", "a", "c"] })), taxCents: 17, tipCents: 43 };
      const output = splitBill(input);
      expect(output.people.reduce((s, p) => s + p.itemsCents, 0)).toBe(prices.reduce((a, b) => a + b, 0));
      expect(output.people.reduce((s, p) => s + p.taxCents, 0)).toBe(17);
      expect(output.people.reduce((s, p) => s + p.tipCents, 0)).toBe(43);
      expect(output.people.reduce((s, p) => s + p.totalCents, 0)).toBe(output.totalCents);
    }
  });
  it("splits odd cents consistently and reconciles every total", () => {
    const result = splitBill(bill);
    expect(result.people.map((person) => person.itemsCents)).toEqual([501, 1000]);
    expect(result.people.reduce((sum, person) => sum + person.taxCents, 0)).toBe(151);
    expect(result.people.reduce((sum, person) => sum + person.tipCents, 0)).toBe(302);
    expect(result.people.reduce((sum, person) => sum + person.totalCents, 0)).toBe(1954);
    expect(splitBill(bill)).toEqual(result);
  });

  it("rejects an item with nobody assigned", () => {
    expect(() => splitBill({ ...bill, items: [{ ...bill.items[0], personIds: [] }] })).toThrow(/assign/i);
  });

  it("rejects unknown people and invalid cents", () => {
    expect(() => splitBill({ ...bill, items: [{ ...bill.items[0], personIds: ["missing"] }] })).toThrow(/unknown/i);
    expect(() => splitBill({ ...bill, taxCents: 0.5 })).toThrow(/integer/i);
  });

  it("handles a zero subtotal with zero extras", () => {
    const result = splitBill({ ...bill, items: [{ ...bill.items[0], priceCents: 0, personIds: ["a"] }], taxCents: 0, tipCents: 0 });
    expect(result.totalCents).toBe(0);
  });
});
