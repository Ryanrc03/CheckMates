import type { ItemAllocation, Person, ReceiptItem } from "@/types/bill";
import { allocateCents } from "./allocation";

export type ItemShare = { personId: string; units: number; weightSum: string; cents: number };
export type AllocationCheck = { valid: true } | { valid: false; code: string; message: string };
const positive = (n: number) => Number.isSafeInteger(n) && n > 0;
export function allocationPersonIds(allocation: ItemAllocation): string[] {
  return allocation.mode === "equal" ? allocation.personIds : allocation.shares.map(s => s.personId);
}
export function validateItemAllocation(allocation: ItemAllocation, people: Person[]): AllocationCheck {
  const fail = (code: string, message: string): AllocationCheck => ({ valid: false, code, message });
  const ids = allocationPersonIds(allocation);
  if (!ids.length) return fail("unassigned", "Assign every item to at least one friend.");
  if (new Set(ids).size !== ids.length) return fail("duplicate", "A friend cannot be assigned twice.");
  if (ids.some(id => !people.some(p => p.id === id))) return fail("unknown", "An item refers to an unknown person.");
  if (allocation.mode !== "equal" && allocation.shares.some(s => !positive(s.units))) return fail("units", "Use positive whole numbers for shares.");
  if (allocation.mode === "quantity") {
    if (!positive(allocation.totalUnits)) return fail("total", "Enter a positive whole number of units.");
    const sum = allocation.shares.reduce((n,s) => n+BigInt(s.units),0n);
    if (sum !== BigInt(allocation.totalUnits)) return fail("incomplete", `Assigned ${sum} of ${allocation.totalUnits} ${allocation.unitLabel || "units"}. Assign exactly the total.`);
  }
  return { valid: true };
}
export function allocateItemCents(item: ReceiptItem, people: Person[]): ItemShare[] {
  const check = validateItemAllocation(item.allocation, people);
  if (!check.valid) throw new Error(check.message);
  const participants = people.flatMap(p => {
    const units = item.allocation.mode === "equal" ? (item.allocation.personIds.includes(p.id) ? 1 : 0) : (item.allocation.shares.find(s => s.personId === p.id)?.units ?? 0);
    return units > 0 ? [{personId:p.id,units}] : [];
  });
  const weights=participants.map(p=>p.units); const cents=allocateCents(item.priceCents,weights);
  const weightSum=weights.reduce((s,n)=>s+BigInt(n),0n).toString();
  return participants.map((p,i)=>({...p,weightSum,cents:cents[i]}));
}
