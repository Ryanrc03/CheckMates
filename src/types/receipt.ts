import type { Bill, WizardStep, ItemAllocation } from "./bill";
import type { ReceiptDetails } from "./receipt-details";
export type DraftItem = { name: string; priceCents: number | null; sourceLine: string; details?: ReceiptDetails };
export type AllocationEdit = { mode: "equal" | "ratio" | "quantity"; totalUnits: string; unitLabel: string; entries: { personId: string; value: string }[] };
export type ReceiptDraft = {
  items: DraftItem[];
  rawText: string;
  taxCents: number | null;
  tipCents: number | null;
  printedSubtotalCents: number | null;
  printedTotalCents: number | null;
  warnings: string[];
  alternateRawText?: string;
};
export type ReceiptEdit = { items: { id: string; name: string; price: string; allocation: ItemAllocation; receiptDetails?: ReceiptDetails }[]; tax: string; chargedTip: string; addedTip: string; note: string };
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
  allocationEdits?: Record<string, AllocationEdit>;
};
