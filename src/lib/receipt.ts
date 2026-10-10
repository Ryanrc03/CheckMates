import type { Bill } from "@/types/bill";
export function createMockBill(): Bill {
  return { items: [["Burger", 1495], ["Fries", 595], ["Lemonade", 350]].map(([name, priceCents], index) => ({ id: `demo-${index}`, name: String(name), priceCents: Number(priceCents), allocation: { mode: "equal" as const, personIds: [] } })), people: [], taxCents: 201, tipCents: 0 };
}
export function emptyBill(): Bill { return { items: [], people: [], taxCents: 0, tipCents: 0 }; }
