import { describe, expect, it } from "vitest";
import { allocateItemCents, validateItemAllocation } from "./item-allocation";
import { splitBill } from "./split";
import type { ItemAllocation, ReceiptItem } from "@/types/bill";
const people = ["a", "b", "c", "d"].map(id => ({ id, name: id === "a" || id === "b" ? "Same name" : id }));
const shares = people.map((p, i) => ({ personId: p.id, units: i < 2 ? 2 : 1 }));
const dish = (priceCents = 1200, allocation: ItemAllocation = { mode: "quantity", totalUnits: 6, unitLabel: "pieces", shares }): ReceiptItem => ({ id: "wings", name: "Wings", priceCents, allocation });
describe("weighted item allocation", () => {
  it("splits six wings by consumption, not purchased servings", () => {
    expect(allocateItemCents(dish(), people).map(s => s.cents)).toEqual([400,400,200,200]);
    expect(allocateItemCents(dish(1200, {mode:"ratio", shares}), people).map(s => s.cents)).toEqual([400,400,200,200]);
  });
  it("allocates pennies by remainder and stable person order", () => {
    const item = dish(1001, {mode:"ratio",shares:[...shares].reverse()}); const before = structuredClone(item);
    expect(allocateItemCents(item,people).map(s=>s.cents)).toEqual([334,333,167,167]);
    expect(allocateItemCents(dish(1),people).map(s=>s.cents)).toEqual([1,0,0,0]);
    expect(item).toEqual(before);
  });
  it("conserves item tax and tip pools", () => {
    const r = splitBill({items:[dish()],people,taxCents:120,tipCents:240});
    expect(r.people.map(s=>s.totalCents)).toEqual([520,520,260,260]); expect(r.totalCents).toBe(1560);
  });
  it("accepts an arbitrary ratio but requires quantities to be fully allocated", () => {
    const partial = shares.slice(0,3);
    expect(validateItemAllocation({mode:"ratio",shares:partial},people).valid).toBe(true);
    expect(validateItemAllocation({mode:"quantity",totalUnits:6,unitLabel:"pieces",shares:partial},people).valid).toBe(false);
    expect(validateItemAllocation({mode:"quantity",totalUnits:5,unitLabel:"pieces",shares},people).valid).toBe(false);
  });
  it("rejects invalid units identities and unsafe totals", () => {
    for (const units of [-1,0,0.5,NaN,Infinity,Number.MAX_SAFE_INTEGER+1]) expect(validateItemAllocation({mode:"ratio",shares:[{personId:"a",units}]},people).valid).toBe(false);
    for (const entries of [[],[{personId:"unknown",units:1}],[{personId:"a",units:1},{personId:"a",units:2}]]) expect(validateItemAllocation({mode:"ratio",shares:entries},people).valid).toBe(false);
    expect(()=>allocateItemCents(dish(-1),people)).toThrow();
  });
});
