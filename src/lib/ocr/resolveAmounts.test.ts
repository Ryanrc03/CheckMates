import { expect,it } from "vitest";
import {parseReceiptText} from "./parseReceipt";
it("uses explicit unit-price evidence to identify included discount",()=>{
 const d=parseReceiptText("1 @ $3.99 each (2/$6.99)\nDrink $3.50 T1\nQty Pkg Disc. -$0.49\nTax $0.10");
 expect(d.items).toHaveLength(1);expect(d.items[0].priceCents).toBe(350);
 expect(d.items[0].details?.discounts[0].inclusion).toBe("included");
});
it("does not treat a discount with a missing negative sign as a product",()=>{
 const d=parseReceiptText("Drink $3.50\nQty Pkg Disc. $0.49\nSubtotal $3.50\nTax $0.10\nTotal $3.60");
 expect(d.items).toHaveLength(1);expect(d.items[0].details?.discounts[0].inclusion).toBe("unresolved");
});
