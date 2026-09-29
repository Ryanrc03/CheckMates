export type WizardStep = "home" | "receipt" | "people" | "split" | "result";

export type CurrencyCode = "USD" | "EUR" | "GBP" | "CNY" | "CAD" | "AUD" | "HKD" | "SGD" | "INR" | "MXN" | "CHF";

/** "items": everyone pays for the dishes they shared. "even": the whole bill is divided equally. */
export type SplitMode = "items" | "even";

export type ReceiptItem = {
  id: string;
  name: string;
  /** Line total: quantity × unit price. */
  priceCents: number;
  /** Units on this line; omitted means 1. */
  quantity?: number;
  personIds: string[];
};

export type Person = { id: string; name: string };

export type Bill = {
  items: ReceiptItem[];
  people: Person[];
  taxCents: number;
  tipCents: number;
  /** Omitted means USD. */
  currency?: CurrencyCode;
  /** Omitted means "items". */
  splitMode?: SplitMode;
};

export type PersonShare = Person & {
  itemsCents: number;
  taxCents: number;
  tipCents: number;
  totalCents: number;
};

export type SplitResult = {
  subtotalCents: number;
  taxCents: number;
  tipCents: number;
  totalCents: number;
  people: PersonShare[];
};
