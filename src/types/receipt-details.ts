export type ReceiptDiscount = {
  discountCents: number;
  inclusion: "included" | "subtract" | "unresolved";
  sourceLine: string;
};
export type ReceiptDetails = {
  quantity?: number | null;
  unitPriceCents?: number | null;
  taxCode?: string | null;
  sourceLines: string[];
  bbox?: { x0: number; y0: number; x1: number; y1: number };
  parentSourceId?: string;
  modifiers: { text: string; sourceLine: string }[];
  discounts: ReceiptDiscount[];
  reviewCodes: string[];
};
