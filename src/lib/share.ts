import type { SplitResult } from "@/types/bill";
import { formatMoney } from "./money";
export function formatShareText(r: SplitResult): string {
  const basis=(r.itemShares??[]).filter(i=>i.mode!=="equal").map(i=>`${i.itemName}: ${i.shares.map(s=>`${r.people.find(p=>p.id===s.personId)?.name} ${s.units}/${s.weightSum}${i.unitLabel?" "+i.unitLabel:""} ${formatMoney(s.cents)}`).join("; ")}`);
  return ["CheckMates — our meal, fairly shared", "", ...r.people.map(p => `${p.name}: ${formatMoney(p.totalCents)} (items ${formatMoney(p.itemsCents)}, tax ${formatMoney(p.taxCents)}, tip ${formatMoney(p.tipCents)})`), ...basis, "", `Subtotal: ${formatMoney(r.subtotalCents)}`, `Tax: ${formatMoney(r.taxCents)}`, `Tip: ${formatMoney(r.tipCents)}`, `Total: ${formatMoney(r.totalCents)}`, "USD · Amounts owed; no payments processed."].join("\n");
}
