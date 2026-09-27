import { expect, it } from "vitest";
import { parseReceiptText } from "./parseReceipt";
import { reconcileReceipt } from "./reconcile";
import { createMockBill } from "../receipt";

const simple = "Burger 14.95\nFries 5.95\nLemonade 3.50\nSubtotal 24.40\nTax 2.01\nTotal 26.41";
it("extracts actual lines and separates printed totals", () => {
  const d = parseReceiptText(simple);
  expect(d.items.map(i => [i.name, i.priceCents])).toEqual([["Burger", 1495], ["Fries", 595], ["Lemonade", 350]]);
  expect([d.printedSubtotalCents, d.taxCents, d.printedTotalCents, d.tipCents]).toEqual([2440, 201, 2641, 0]);
});
it("ignores suggested tips and payment metadata", () => {
  const d = parseReceiptText("Cafe\nTel 206-555-1234\n09/05/2026 12:34\nVisa **** 1234\n" + simple + "\nSuggested gratuity\n18% 4.39\n20% 4.88\nThank you!");
  expect(d.items).toHaveLength(3); expect(d.tipCents).toBe(0);
});
it("keeps missing prices and flags ambiguous quantities and unsupported fees", () => {
  const d = parseReceiptText("Soup 8.00\nSalad\n2 x Taco 3.00\nDiscount -1.00\nService charge 2.00\nTax 0.50\nTax 0.20\nTotal 12.00\nTotal 13.00");
  expect(d.items.find(i => i.name === "Salad")?.priceCents).toBeNull();
  expect(d.items.find(i => i.name.includes("Taco"))?.sourceLine).toBe("2 x Taco 3.00");
  expect(d.warnings.join(" ")).toMatch(/quantity/i); expect(d.warnings.join(" ")).toMatch(/discount/i);
  expect(d.warnings.join(" ")).toMatch(/service/i); expect(d.warnings.join(" ")).toMatch(/tax/i); expect(d.warnings.join(" ")).toMatch(/total/i);
});
it("separates charged gratuity and added tip when reconciling", () => {
  const d = parseReceiptText(simple.replace("Total 26.41", "Gratuity 4.00\nTotal 30.41"));
  expect(d.tipCents).toBe(400);
  const bill = { ...createMockBill(), tipCents: 600 };
  expect(reconcileReceipt(d, bill, 200).differenceCents).toBe(0);
  expect(reconcileReceipt(d, { ...bill, taxCents: 202 }, 200).differenceCents).toBe(1);
});
it("handles quantity lines, unit prices, modifiers and duplicate payment totals", () => {
  const d = parseReceiptText("LINE THAI CAFE\nPineapple Fried Rice $13.90\nChicken\nFried Tofu (12) $7.90\nMilk Tea $4.00\nPad Thai ×2 $25.80\n($12.90 each)\nChicken\nPad Kra Pow $12.90\nChicken\nNo Onion\nBrown Sugar Milk x2 $8.00\n($4.00 each)\nSubtotal $72.50\nSale tax (8.25%) $5.98\nTotal $78.48\nVisa $78.48");
  expect(d.items.map(i => i.priceCents)).toEqual([1390, 790, 400, 2580, 1290, 800]);
  expect(d.taxCents).toBe(598); expect(d.printedTotalCents).toBe(7848);
});
it("does not fabricate data from blank text", () => {
  const d = parseReceiptText(""); expect(d.items).toEqual([]); expect(d.taxCents).toBeNull(); expect(d.printedTotalCents).toBeNull();
});
it("retains amounts with trailing OCR noise and split tax/subtotal lines", () => {
  const d = parseReceiptText("Pineapple Fried Rice $13.90 3 ;\nChicken ow » 2\nFried Tofu (12) $7.90 ” - pr\nMilk Tea $4.00 =\nPad Thaj x 2 $25.80\nChicken\n($12.90 each) ’ E\nPad Kra Pow $12.90\nChicken\nNo Onion\n7 Brown Sugar Milk x Zr) $8.00\n($4.00 each) ’\nSubtotal i\n$72.50\nsale tax (8.25% 1\n(8.25%) $5.98\n7848\n5 Visa XXXX (Contac :\ntless) $78.48");
  expect(d.items.filter(i => i.priceCents !== null).map(i => i.priceCents)).toEqual([1390,790,400,2580,1290,800]);
  expect(d.printedSubtotalCents).toBe(7250); expect(d.taxCents).toBe(598);
  expect(d.printedTotalCents).toBeNull();
});
it("preserves an incomplete first dish instead of silently losing it", () => {
  const d = parseReceiptText("Soup 8.0\nSalad 5.00\nTax 0.00\nTotal 13.00");
  expect(d.items[0]).toMatchObject({ name: "Soup 8.0", priceCents: null }); expect(d.warnings.join(" ")).toMatch(/missing|unclear/i);
  expect(parseReceiptText("Soup\nSalad 5.00\nTax 0.00\nTotal 13.00").items[0].priceCents).toBeNull();
});
it("requires review for service labels and abbreviations", () => {
  for (const label of ["Service 10%", "Svc Chg", "Service"]) {
    const d = parseReceiptText(`Soup 8.00\n${label} 0.80\nTax 0.00\nTotal 8.80`);
    expect(d.items).toHaveLength(1); expect(d.warnings.join(" ")).toMatch(/service/i);
  }
});
it("excludes an entire suggested-tip section with spelled-out percentages", () => {
  const d = parseReceiptText("Soup 8.00\nSuggested gratuity\n18 percent $1.44\n20 percent $1.60\nTax 0.00\nTotal 8.00");
  expect(d.items).toHaveLength(1); expect(d.tipCents).toBe(0); expect(d.printedTotalCents).toBe(800);
});
