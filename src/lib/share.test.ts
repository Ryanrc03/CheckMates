import { expect, it } from "vitest";
import { formatShareText } from "./share";
import { splitBill } from "./split";
it("shares exact per-person and bill amounts", () => {
  const result = splitBill({ people: [{ id: "a", name: "A" }, { id: "b", name: "B" }], items: [{ id: "1", name: "Burger", priceCents: 1001, personIds: ["a", "b"] }, { id: "2", name: "Fries", priceCents: 500, personIds: ["b"] }], taxCents: 151, tipCents: 302 });
  const text = formatShareText(result);
  for (const expected of ["CheckMates", "A: $6.52", "B: $13.02", "Subtotal: $15.01", "Tax: $1.51", "Tip: $3.02", "Total: $19.54"]) expect(text).toContain(expected);
});
