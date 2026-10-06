import type { Bill, SplitResult } from "@/types/bill";
import { allocateCents } from "./allocation";
import { allocateItemCents } from "./item-allocation";
export { allocateCents } from "./allocation";

function assertCents(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label} must be a nonnegative safe integer of cents.`);
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
  const itemShares: NonNullable<SplitResult["itemShares"]> = [];

  for (const item of bill.items) {
    assertCents(item.priceCents, "Item price");
    subtotalCents += item.priceCents;
    assertCents(subtotalCents, "Subtotal");
    const shares=allocateItemCents(item,bill.people);
    itemShares.push({itemId:item.id,itemName:item.name,mode:item.allocation.mode,unitLabel:item.allocation.mode==="quantity"?item.allocation.unitLabel:"",shares});
    for (const share of shares) itemTotals[ids.indexOf(share.personId)] += share.cents;
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
    itemShares,
    people: bill.people.map((person, index) => ({
      ...person,
      itemsCents: itemTotals[index],
      taxCents: taxShares[index],
      tipCents: tipShares[index],
      totalCents: itemTotals[index] + taxShares[index] + tipShares[index],
    })),
  };
}
