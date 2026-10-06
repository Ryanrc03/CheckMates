import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { parseReceiptText } from "./parseReceipt";
const text=(name:string)=>readFileSync(new URL(`../../../tests/fixtures/receipts/${name}.transcription.txt`,import.meta.url),"utf8");
it("retains all eleven charged Olive lines and associates included options",()=>{
 const d=parseReceiptText(text("olive-garden"));
 expect(d.items.map(i=>i.priceCents)).toEqual([1399,679,299,4498,2249,8996,775,1779,775,1229,2049]);
 expect([d.printedSubtotalCents,d.taxCents,d.printedTotalCents]).toEqual([24727,1466,26193]);
 expect(d.items[0].details?.modifiers?.map(m=>m.text)).toContain("Bucatini");
 expect(d.items[3].details?.quantity).toBe(2); expect(d.items[5].details?.quantity).toBe(4);
 expect(d.items.find(i=>i.name==="Table Games")?.priceCents).toBe(299);
});
it("distinguishes menu numbers, quantities, each prices and the item-count subtotal",()=>{
 const d=parseReceiptText(text("krung-thep"));
 expect(d.items.map(i=>[i.name,i.priceCents])).toEqual([["Fried Tofu",600],["Beef Noodles",1200],["Curry Noodles",1400],["Pineapple Fried Rice",2800],["Sticky Rice with Peach",2400],["Diet Coke",350]]);
 expect(d.items.map(i=>i.details?.quantity)).toEqual([1,1,1,2,3,1]);
 expect(d.items[3].details?.unitPriceCents).toBe(1400);
 expect([d.printedSubtotalCents,d.taxCents,d.printedTotalCents]).toEqual([8750,525,9275]);
});
it("does not subtract included grocery savings or combine duplicate goods",()=>{
 const d=parseReceiptText(text("chinatown-supermarket"));
 expect(d.items.map(i=>i.priceCents)).toEqual([999,999,599,399,299,450,649,399,399,599,350,349,350,349,259]);
 expect([d.printedSubtotalCents,d.taxCents,d.printedTotalCents]).toEqual([7448,224,7672]);
 expect(d.items[10].name).toBe(d.items[11].name);
 expect(d.items.flatMap(i=>i.details?.discounts??[]).map(a=>a.inclusion)).toEqual(["included","included","included","included","included","included"]);
 expect(d.items[10].details?.unitPriceCents).toBe(399);
});
it("leaves ambiguous discounts for review and applies clear independent discounts once",()=>{
 const ambiguous=parseReceiptText("Soup $10.00\nDisc. -$1.00\nTax $0.00");
 expect(ambiguous.items[0].details?.discounts?.[0].inclusion).toBe("unresolved");
 const clear=parseReceiptText("Soup $10.00\nDisc. -$1.00\nSubtotal $9.00\nTax $0.00\nTotal $9.00");
 expect(clear.items[0].priceCents).toBe(900);expect(clear.items[0].details?.discounts?.[0].inclusion).toBe("subtract");
});
it("does not lose priced Chicken or Table Games and keeps missing dishes",()=>{
 const d=parseReceiptText("Chicken 8.00\nTable Games 2.99\nSoup\nSubtotal 10.99\nTaxes 0.50\nTotal 11.49");
 expect(d.items.map(i=>[i.name,i.priceCents])).toEqual([["Chicken",800],["Table Games",299],["Soup",null]]);
 expect(d.taxCents).toBe(50);
});
it("uses tax detail only once and never uses taxable amounts as tax",()=>{
 const table="TAX CODE RATE TAXABLE TAX\n0 DEFAULT T 3.0% $9.98 $0.30\n1 DEFAULT 3.0% $64.50 $1.94\nTOTAL TAX $2.24";
 expect(parseReceiptText("Food $74.48\nSubtotal $74.48\nTax $2.24\nTotal $76.72\n"+table).taxCents).toBe(224);
 expect(parseReceiptText("Food $74.48\nSubtotal $74.48\n"+table).taxCents).toBe(224);
});
it("keeps an indented missing-price dish unless a customization context identifies an option",()=>{
 const missing=parseReceiptText("Noodles $8.00\n    Soup\nSubtotal $8.00\nTax $0.00\nTotal $8.00");
 expect(missing.items.map(i=>[i.name,i.priceCents])).toEqual([["Noodles",800],["Soup",null]]);
 const option=parseReceiptText("CYO Noodles $8.00\n    Buckwheat\n    Soy broth\nSubtotal $8.00\nTax $0.00\nTotal $8.00");
 expect(option.items).toHaveLength(1);expect(option.items[0].details?.modifiers.map(m=>m.text)).toEqual(["Buckwheat","Soy broth"]);
});
it("links an included side to the main dish across a charged addon",()=>{
 const d=parseReceiptText("CYO Pasta $13.99\nAdd Shrimp $6.79\n1 * Salad\nSubtotal $20.78\nTax $0.00\nTotal $20.78");
 expect(d.items[0].details?.modifiers.map(m=>m.text)).toContain("1 * Salad");
 expect(d.items[1].details?.parentSourceId).toBe(d.items[0].details?.sourceId);
});
it("keeps a leading list dash separate from a negative monetary amount",()=>{
 const d=parseReceiptText("- 1 Main Course 22.49\nRefund -$1.00\nSubtotal $22.49\nTax $0.00\nTotal $22.49");
 expect(d.items.map(i=>i.priceCents)).toEqual([2249]);
 expect(d.warnings.some(w=>w.includes("Negative amount"))).toBe(true);
});
