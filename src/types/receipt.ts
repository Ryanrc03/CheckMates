import type { Bill, WizardStep } from "./bill";
export type ReceiptDraft = {
  items: { name: string; priceCents: number | null; sourceLine: string }[];
  rawText: string;
  taxCents: number | null;
  tipCents: number | null;
  printedSubtotalCents: number | null;
  printedTotalCents: number | null;
  warnings: string[];
};
export type ExtraMode = "amount" | "percent";
/** Raw editor text. `price` is the unit price; `qty` defaults to 1. In percent mode `tax`/`addedTip` hold a rate. */
export type ReceiptEdit = { items: { id: string; name: string; price: string; qty?: string; personIds: string[] }[]; tax: string; chargedTip: string; addedTip: string; note: string; taxMode?: ExtraMode; addedTipMode?: ExtraMode };
export type BillSession = {
  bill: Bill;
  step: WizardStep;
  source: "demo" | "photo" | null;
  fileName: string | null;
  receiptDraft: ReceiptDraft | null;
  receiptConfirmed?: boolean;
  addedTipCents?: number;
  reviewNote?: string;
  receiptEdit?: ReceiptEdit | null;
  /** Percent text the confirmed tax / added tip was calculated from, so it follows later subtotal edits. */
  taxRate?: string | null;
  addedTipRate?: string | null;
};
