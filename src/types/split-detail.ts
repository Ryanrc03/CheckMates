import type { SplitResult } from "./bill";

export type AllocationPart = { weight: number; baseCents: number; extraCent: boolean; cents: number };
export type AllocationTrace = { poolCents: number; weightSum: string; parts: AllocationPart[] };
export type ItemAllocation = {
  itemId: string;
  itemName: string;
  priceCents: number;
  quantity: number;
  personIds: string[];
  allocation: AllocationTrace;
};
/** In even mode, `items` is empty and `subtotal` divides the item subtotal equally. */
export type BillBreakdown = { result: SplitResult; items: ItemAllocation[]; tax: AllocationTrace; tip: AllocationTrace; subtotal?: AllocationTrace };
