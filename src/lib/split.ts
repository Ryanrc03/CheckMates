import type { Bill, SplitResult } from "@/types/bill";
import { allocateItemCents } from "./item-allocation";
export { allocateCents } from "./allocation";
import type { AllocationTrace, BillBreakdown, ItemAllocation } from "@/types/split-detail";

function assertCents(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label} must be a nonnegative safe integer of cents.`);
}

/** Largest remainder allocation; ties follow the input order. */
export function allocateCentsDetailed(total: number, weights: number[]): AllocationTrace {
  assertCents(total, "Amount");
  weights.forEach((weight) => assertCents(weight, "Weight"));
  const weightSum = weights.reduce((sum, weight) => sum + BigInt(weight), 0n);
  if (weightSum === 0n) {
    if (total === 0) return { poolCents: total, weightSum: "0", parts: weights.map(weight => ({ weight, baseCents: 0, extraCent: false, cents: 0 })) };
    throw new Error("Cannot allocate an amount with zero weights.");
  }
  const parts = weights.map((weight, index) => {
    const numerator = BigInt(total) * BigInt(weight);
    const baseCents = Number(numerator / weightSum);
    return { index, weight, baseCents, extraCent: false, cents: baseCents, remainder: numerator % weightSum };
  });
  let leftover = total - parts.reduce((sum, part) => sum + part.cents, 0);
  const ranked = [...parts].sort((a, b) =>
    a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1,
  );
  for (const part of ranked) {
    if (leftover-- <= 0) break;
    parts[part.index].cents += 1;
    parts[part.index].extraCent = true;
  }
  return { poolCents: total, weightSum: weightSum.toString(), parts: parts.map(({ weight, baseCents, extraCent, cents }) => ({ weight, baseCents, extraCent, cents })) };
}

export function explainSplitBill(bill: Bill): BillBreakdown {
  assertCents(bill.taxCents, "Tax");
  assertCents(bill.tipCents, "Tip");
  if (bill.people.length === 0) throw new Error("Add at least one person.");
  if (bill.items.length === 0) throw new Error("Add at least one item.");
  const ids = bill.people.map((person) => person.id);
  if (new Set(ids).size !== ids.length) throw new Error("Person IDs must be unique.");
  const itemTotals = ids.map(() => 0);
  const items: ItemAllocation[] = [];
  let subtotalCents = 0;
  const itemShares: NonNullable<SplitResult["itemShares"]> = [];

  for (const item of bill.items) {
    assertCents(item.priceCents, "Item price");
    subtotalCents += item.priceCents;
    assertCents(subtotalCents, "Subtotal");
    const shares=allocateItemCents(item,bill.people);
    itemShares.push({itemId:item.id,itemName:item.name,mode:item.allocation.mode,unitLabel:item.allocation.mode==="quantity"?item.allocation.unitLabel:"",shares});
    for (const share of shares) itemTotals[ids.indexOf(share.personId)] += share.cents;
    const allocation = allocateCentsDetailed(item.priceCents, shares.map(share=>share.units));
    items.push({ itemId: item.id, itemName: item.name, priceCents: item.priceCents, personIds: shares.map(share=>share.personId), allocation, mode:item.allocation.mode, unitLabel:item.allocation.mode==="quantity"?item.allocation.unitLabel:"" });
  }

  assertCents(subtotalCents, "Subtotal");
  const totalCents = subtotalCents + bill.taxCents + bill.tipCents;
  assertCents(totalCents, "Total");
  const tax = allocateCentsDetailed(bill.taxCents, itemTotals);
  const tip = allocateCentsDetailed(bill.tipCents, itemTotals);

  const result: SplitResult = {
    subtotalCents,
    taxCents: bill.taxCents,
    tipCents: bill.tipCents,
    totalCents,
    itemShares,
    people: bill.people.map((person, index) => ({
      ...person,
      itemsCents: itemTotals[index],
      taxCents: tax.parts[index].cents,
      tipCents: tip.parts[index].cents,
      totalCents: itemTotals[index] + tax.parts[index].cents + tip.parts[index].cents,
    })),
  };
  return { result, items, tax, tip };
}

export function splitBill(bill: Bill): SplitResult {
  return explainSplitBill(bill).result;
}
