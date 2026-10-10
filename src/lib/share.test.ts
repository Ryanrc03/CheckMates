import { expect, it } from "vitest";
import { formatShareText } from "./share";
import { splitBill } from "./split";
it("includes the exact weighted dish basis in a shareable summary", () => {
 const r=splitBill({people:[{id:"a",name:"A"},{id:"b",name:"B"}],items:[{id:"w",name:"Wings",priceCents:1001,allocation:{mode:"quantity",totalUnits:3,unitLabel:"pieces",shares:[{personId:"a",units:2},{personId:"b",units:1}]}}],taxCents:0,tipCents:0});
 expect(formatShareText(r)).toContain("Wings: A 2/3 pieces $6.67; B 1/3 pieces $3.34");
});
it("shares exact per-person and bill amounts", () => {
  const result = splitBill({ people: [{ id: "a", name: "A" }, { id: "b", name: "B" }], items: [{ id: "1", name: "Burger", priceCents: 1001, allocation: {mode:"equal",personIds:["a", "b"]} }, { id: "2", name: "Fries", priceCents: 500, allocation: {mode:"equal",personIds:["b"]} }], taxCents: 151, tipCents: 302 });
  const text = formatShareText(result);
  for (const expected of ["CheckMates", "A: $6.52", "B: $13.02", "Subtotal: $15.01", "Tax: $1.51", "Tip: $3.02", "Total: $19.54"]) expect(text).toContain(expected);
});
