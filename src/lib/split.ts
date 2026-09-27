import type { Bill, SplitResult } from "@/types/bill";

function assertCents(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label} must be a nonnegative safe integer of cents.`);
}

/** Largest remainder allocation; ties follow the input order. */
export function allocateCents(total: number, weights: number[]): number[] {
  assertCents(total, "Amount");
  weights.forEach((weight) => assertCents(weight, "Weight"));
  const weightSum = weights.reduce((sum, weight) => sum + BigInt(weight), 0n);
  if (weightSum === 0n) {
    if (total === 0) return weights.map(() => 0);
    throw new Error("Cannot allocate an amount with zero weights.");
  }
  const parts = weights.map((weight, index) => {
    const numerator = BigInt(total) * BigInt(weight);
    return { index, cents: Number(numerator / weightSum), remainder: numerator % weightSum };
  });
  let leftover = total - parts.reduce((sum, part) => sum + part.cents, 0);
  const ranked = [...parts].sort((a, b) =>
    a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1,
  );
  for (const part of ranked) {
    if (leftover-- <= 0) break;
    parts[part.index].cents += 1;
  }
  return parts.map((part) => part.cents);
}

export function splitBill(bill: Bill): SplitResult {
  assertCents(bill.taxCents, "Tax");
  assertCents(bill.tipCents, "Tip");
  if (bill.people.length === 0) throw new Error("Add at least one person.");
  if (bill.items.length === 0) throw new Error("Add at least one item.");
  const ids = bill.people.map((person) => person.id);
  if (new Set(ids).size !== ids.length) throw new Error("Person IDs must be unique.");
  const itemTotals = ids.map(() => 0);
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
    const portions = allocateCents(item.priceCents, selectedIndexes.map(() => 1));
    selectedIndexes.forEach((index, selectedIndex) => { itemTotals[index] += portions[selectedIndex]; });
  }

  assertCents(subtotalCents, "Subtotal");
  const totalCents = subtotalCents + bill.taxCents + bill.tipCents;
  assertCents(totalCents, "Total");
  const taxShares = allocateCents(bill.taxCents, itemTotals);
  const tipShares = allocateCents(bill.tipCents, itemTotals);

  return {
    subtotalCents,
    taxCents: bill.taxCents,
    tipCents: bill.tipCents,
    totalCents,
    people: bill.people.map((person, index) => ({
      ...person,
      itemsCents: itemTotals[index],
      taxCents: taxShares[index],
      tipCents: tipShares[index],
      totalCents: itemTotals[index] + taxShares[index] + tipShares[index],
    })),
  };
}
