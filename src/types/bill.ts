export type WizardStep = "home" | "receipt" | "people" | "split" | "result";

export type ReceiptItem = {
  id: string;
  name: string;
  priceCents: number;
  personIds: string[];
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
