import type { Bill, SplitResult } from "@/types/bill";
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

export function allocateCents(total: number, weights: number[]): number[] {
  return allocateCentsDetailed(total, weights).parts.map(part => part.cents);
}

/**
 * Divides an amount equally. The first extra cent goes to `start`, then continues through the list,
 * so successive pools keep rotating and nobody collects every leftover cent.
 */
export function allocateEvenlyFrom(total: number, count: number, start: number): { trace: AllocationTrace; next: number } {
  assertCents(total, "Amount");
  if (!Number.isSafeInteger(count) || count <= 0) throw new Error("Add at least one person.");
  const baseCents = Number(BigInt(total) / BigInt(count));
  const leftover = total - baseCents * count;
  const parts = Array.from({ length: count }, (_, index) => {
    const extraCent = (index - start + count) % count < leftover;
    return { weight: 1, baseCents, extraCent, cents: baseCents + (extraCent ? 1 : 0) };
  });
  return { trace: { poolCents: total, weightSum: String(count), parts }, next: (start + leftover) % count };
}

function explainEvenSplit(bill: Bill, ids: string[]): BillBreakdown {
  let subtotalCents = 0;
  for (const item of bill.items) {
    assertCents(item.priceCents, "Item price");
    if (item.personIds.some((id) => !ids.includes(id))) throw new Error("An item refers to an unknown person.");
    subtotalCents += item.priceCents;
    assertCents(subtotalCents, "Subtotal");
  }
  if (subtotalCents === 0 && bill.taxCents + bill.tipCents > 0) throw new Error("Tax and tip require a nonzero item subtotal.");
  const totalCents = subtotalCents + bill.taxCents + bill.tipCents;
  assertCents(totalCents, "Total");
  const subtotal = allocateEvenlyFrom(subtotalCents, ids.length, 0);
  const tax = allocateEvenlyFrom(bill.taxCents, ids.length, subtotal.next);
  const tip = allocateEvenlyFrom(bill.tipCents, ids.length, tax.next);
  const result: SplitResult = {
    subtotalCents,
    taxCents: bill.taxCents,
    tipCents: bill.tipCents,
    totalCents,
    people: bill.people.map((person, index) => {
      const itemsCents = subtotal.trace.parts[index].cents; const taxCents = tax.trace.parts[index].cents; const tipCents = tip.trace.parts[index].cents;
      return { ...person, itemsCents, taxCents, tipCents, totalCents: itemsCents + taxCents + tipCents };
    }),
  };
  return { result, items: [], tax: tax.trace, tip: tip.trace, subtotal: subtotal.trace };
}

export function explainSplitBill(bill: Bill): BillBreakdown {
  assertCents(bill.taxCents, "Tax");
  assertCents(bill.tipCents, "Tip");
  if (bill.people.length === 0) throw new Error("Add at least one person.");
  if (bill.items.length === 0) throw new Error("Add at least one item.");
  const ids = bill.people.map((person) => person.id);
  if (new Set(ids).size !== ids.length) throw new Error("Person IDs must be unique.");
  if (bill.splitMode === "even") return explainEvenSplit(bill, ids);
  const itemTotals = ids.map(() => 0);
  const items: ItemAllocation[] = [];
  let subtotalCents = 0;

  for (const item of bill.items) {
    assertCents(item.priceCents, "Item price");
    if (item.personIds.length === 0) throw new Error(`Assign ${item.name || "every item"} to someone.`);
    if (new Set(item.personIds).size !== item.personIds.length) throw new Error("An item cannot assign a person twice.");
    const selectedIndexes = item.personIds.map((id) => ids.indexOf(id));
    if (selectedIndexes.some((index) => index < 0)) throw new Error("An item refers to an unknown person.");
    selectedIndexes.sort((a, b) => a - b);
    subtotalCents += item.priceCents;
    assertCents(subtotalCents, "Subtotal");
    const allocation = allocateCentsDetailed(item.priceCents, selectedIndexes.map(() => 1));
    selectedIndexes.forEach((index, selectedIndex) => { itemTotals[index] += allocation.parts[selectedIndex].cents; });
    items.push({ itemId: item.id, itemName: item.name, priceCents: item.priceCents, quantity: item.quantity ?? 1, personIds: selectedIndexes.map(index => ids[index]), allocation });
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
