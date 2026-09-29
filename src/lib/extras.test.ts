import { describe, expect, it } from "vitest";
import { formatMoney, isCurrency, lineTotal, parseMoney, parsePercent, parseQuantity, percentOf } from "./money";
import { formatShareText } from "./share";
import { splitBill } from "./split";

describe("percentages, quantities and currencies", () => {
  it("parses rates into thousandths of a percent", () => {
    expect(parsePercent("8.25")).toBe(8250);
    expect(parsePercent("8.875%")).toBe(8875);
    expect(parsePercent("18")).toBe(18000);
    expect(parsePercent("0")).toBe(0);
    expect(parsePercent("100")).toBe(100000);
    for (const bad of ["", "100.001", "-5", "8.2525", "abc", "1e2"]) expect(parsePercent(bad)).toBeNull();
  });

  it("applies a rate with half-cent rounding up", () => {
    expect(percentOf(3690, 8250)).toBe(304);
    expect(percentOf(3690, 18000)).toBe(664);
    expect(percentOf(1000, 12345)).toBe(123);
    expect(percentOf(200, 250)).toBe(1);
    expect(percentOf(0, 20000)).toBe(0);
    expect(percentOf(Number.MAX_SAFE_INTEGER, 100000)).toBe(Number.MAX_SAFE_INTEGER);
  });

  it("accepts whole quantities from 1 to 99 and multiplies safely", () => {
    expect(parseQuantity("2")).toBe(2);
    for (const bad of ["0", "100", "1.5", "", "-1"]) expect(parseQuantity(bad)).toBeNull();
    expect(lineTotal(250, 3)).toBe(750);
    expect(lineTotal(null, 3)).toBeNull();
    expect(lineTotal(Number.MAX_SAFE_INTEGER, 2)).toBeNull();
  });

  it("formats and parses other currency symbols", () => {
    expect(formatMoney(123456, "EUR")).toBe("€1,234.56");
    expect(formatMoney(5, "CAD")).toBe("CA$0.05");
    expect(formatMoney(100, "CHF")).toBe("CHF 1.00");
    expect(parseMoney("€12.50")).toBe(1250);
    expect(parseMoney("HK$3")).toBe(300);
    expect(isCurrency("GBP")).toBe(true);
    expect(isCurrency("toString")).toBe(false);
  });

  it("labels the currency in the summary and appends the link when given", () => {
    const result = splitBill({ people: [{ id: "a", name: "A" }], items: [{ id: "1", name: "Soup", priceCents: 800, personIds: ["a"] }], taxCents: 0, tipCents: 0 });
    const text = formatShareText(result, "GBP", "https://example.test/#share=abc");
    expect(text).toContain("A: £8.00");
    expect(text).toContain("GBP · Amounts owed");
    expect(text).toContain("View the split: https://example.test/#share=abc");
  });

  it("reproduces the reviewed sample: 8.25% tax and 18% tip on a $36.90 subtotal", () => {
    const subtotal = 1495 + 595 + 350 + 1250;
    expect(percentOf(subtotal, parsePercent("8.25")!) + percentOf(subtotal, parsePercent("18")!) + subtotal).toBe(4658);
  });
});
