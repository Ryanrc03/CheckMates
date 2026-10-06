export type WizardStep = "home" | "receipt" | "people" | "split" | "result";

export type ItemAllocation =
  | { mode: "equal"; personIds: string[] }
  | { mode: "ratio"; shares: { personId: string; units: number }[] }
  | { mode: "quantity"; totalUnits: number; unitLabel: string; shares: { personId: string; units: number }[] };
export type ReceiptItem = {
  id: string;
  name: string;
  priceCents: number;
  allocation: ItemAllocation;
  receiptDetails?: import("./receipt-details").ReceiptDetails;
};

export type Person = { id: string; name: string };

export type Bill = {
  items: ReceiptItem[];
  people: Person[];
  taxCents: number;
  tipCents: number;
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
