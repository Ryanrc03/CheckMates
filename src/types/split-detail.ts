import type { SplitResult } from "./bill";

export type AllocationPart = { weight: number; baseCents: number; extraCent: boolean; cents: number };
export type AllocationTrace = { poolCents: number; weightSum: string; parts: AllocationPart[] };
export type ItemAllocation = {
  itemId: string;
  itemName: string;
  priceCents: number;
  personIds: string[];
  allocation: AllocationTrace;
  mode: "equal" | "ratio" | "quantity";
  unitLabel: string;
};
export type BillBreakdown = { result: SplitResult; items: ItemAllocation[]; tax: AllocationTrace; tip: AllocationTrace };
