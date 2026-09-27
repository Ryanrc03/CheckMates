import type { Bill } from "@/types/bill";
import type { ReceiptDraft } from "@/types/receipt";
export function reconcileReceipt(draft: ReceiptDraft, confirmed: Bill, addedTipCents: number): { differenceCents: number | null; warnings: string[] } {
  const subtotal = confirmed.items.reduce((s, i) => s + i.priceCents, 0);
  const differenceCents = draft.printedTotalCents === null ? null : subtotal + confirmed.taxCents + confirmed.tipCents - addedTipCents - draft.printedTotalCents;
  const warnings = [...draft.warnings];
  if (draft.printedSubtotalCents !== null && draft.printedSubtotalCents !== subtotal) warnings.push("Edited items differ from the printed subtotal.");
  if (draft.printedTotalCents === null) warnings.push("Printed total was not identified. Check all amounts against the photo.");
  if (differenceCents !== null && differenceCents !== 0) warnings.push("Edited total differs from the printed total (excluding your added tip). Explain or correct the difference.");
  if (draft.tipCents && draft.printedTotalCents !== null && draft.printedSubtotalCents !== null && draft.taxCents !== null && draft.printedSubtotalCents + draft.taxCents + draft.tipCents !== draft.printedTotalCents) warnings.push("It is unclear whether the printed total includes gratuity. Confirm the charged tip.");
  return { differenceCents, warnings };
}
