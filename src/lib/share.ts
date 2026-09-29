import type { CurrencyCode, SplitResult } from "@/types/bill";
import { DEFAULT_CURRENCY, formatMoney } from "./money";
export function formatShareText(r: SplitResult, currency: CurrencyCode = DEFAULT_CURRENCY, link?: string): string {
  const money = (cents: number) => formatMoney(cents, currency);
  return ["CheckMates — our meal, fairly shared", "", ...r.people.map(p => `${p.name}: ${money(p.totalCents)} (items ${money(p.itemsCents)}, tax ${money(p.taxCents)}, tip ${money(p.tipCents)})`), "", `Subtotal: ${money(r.subtotalCents)}`, `Tax: ${money(r.taxCents)}`, `Tip: ${money(r.tipCents)}`, `Total: ${money(r.totalCents)}`, `${currency} · Amounts owed; no payments processed.`, ...(link ? ["", `View the split: ${link}`] : [])].join("\n");
}
