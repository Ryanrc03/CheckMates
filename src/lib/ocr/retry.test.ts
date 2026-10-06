import {expect,it} from "vitest";
import {shouldRetryReceipt,parseReceiptEvidence,chooseReceiptCandidate} from "./retry";
import {parseReceiptText} from "./parseReceipt";
it("does not retry clear reconciled receipts and flags missing financial evidence",()=>{
 const good={text:"Soup $8.00\nSubtotal $8.00\nTax $0.00\nTotal $8.00",confidence:90};
 expect(shouldRetryReceipt(good,parseReceiptText(good.text))).toBe(false);
 const missing={text:"Soup $8.00",confidence:50};expect(shouldRetryReceipt(missing,parseReceiptText(missing.text))).toBe(true);
});
it("does not discard a priced dish just because a layout candidate has fewer unclear rows",()=>{
 const primary={text:"Soup $8.00\nRice $2.00\nUnknown dish\nOther unclear dish",confidence:65};
 const secondary={text:"Soup $8.00",confidence:85};
 expect(chooseReceiptCandidate(primary,secondary).text).toBe(primary.text);
});
it("keeps conflicting scan prices unresolved even if one matches the total",()=>{
 const primary={text:"Soup $8.00\nSubtotal $8.00\nTax $0.00\nTotal $8.00",confidence:90};
 const secondary={text:"Soup $6.00\nSubtotal $8.00\nTax $0.00\nTotal $8.00",confidence:85};
 const d=parseReceiptEvidence({...primary,alternate:secondary});
 expect(d.items[0].priceCents).toBeNull();expect(d.items[0].details?.reviewCodes).toContain("ocr-price");
});
