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
export type ReceiptEdit = { items: { id: string; name: string; price: string; personIds: string[] }[]; tax: string; chargedTip: string; addedTip: string; note: string };
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
};
