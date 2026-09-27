import type { SplitResult } from "@/types/bill";
import { formatMoney } from "./money";
export function formatShareText(r: SplitResult): string {
  return ["CheckMates — our meal, fairly shared", "", ...r.people.map(p => `${p.name}: ${formatMoney(p.totalCents)} (items ${formatMoney(p.itemsCents)}, tax ${formatMoney(p.taxCents)}, tip ${formatMoney(p.tipCents)})`), "", `Subtotal: ${formatMoney(r.subtotalCents)}`, `Tax: ${formatMoney(r.taxCents)}`, `Tip: ${formatMoney(r.tipCents)}`, `Total: ${formatMoney(r.totalCents)}`, "USD · Amounts owed; no payments processed."].join("\n");
}
