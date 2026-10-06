import {expect,it} from "vitest";
import {readFinancialEvidence,mergeFinancialEvidence} from "./financial-evidence";
import {parseReceiptText} from "./parseReceipt";
it("never borrows the tax amount for an adjacent total whose amount is missing",()=>{
 const line=(text:string,x:number,y:number)=>({text,confidence:85,bbox:{x0:x,y0:y,x1:x+70,y1:y+20},words:[]});
 const d=readFinancialEvidence({text:"Tax\n$0.75\nTotal",confidence:85,lines:[line("Tax",10,0),line("$0.75",200,0),line("Total",10,22)]});
 expect(d.taxCents).toBe(75);expect(d.printedTotalCents).toBeNull();
});
it("reads grouped amounts as complete tokens",()=>{
 const line=(text:string,y:number)=>({text,confidence:85,bbox:{x0:10,y0:y,x1:200,y1:y+20},words:[]});
 const d=readFinancialEvidence({text:"Tax $1,000.00\nTotal $1,234.56",confidence:85,lines:[line("Tax $1,000.00",0),line("Total $1,234.56",40)]});
 expect(d.taxCents).toBe(100000);expect(d.printedTotalCents).toBe(123456);
});
it("rejects contradictions within a targeted scan rather than keeping its first amount",()=>{
 const d=parseReceiptText("Food $10.00");mergeFinancialEvidence(d,[{text:"Tax $1.00\nTax $2.00\nTotal $11.00\nTotal $12.00",confidence:85}]);
 expect(d.taxCents).toBeNull();expect(d.printedTotalCents).toBeNull();expect(d.warnings.filter(w=>w.includes("Financial scans disagree"))).toHaveLength(2);
});
it("does not refill an amount rejected by conflicting whole-page scans",()=>{
 const d=parseReceiptText("Soup $10.00\nSubtotal $10.00\nTax $1.00");d.printedTotalCents=null;d.warnings.push("Scans disagree on printedTotalCents. Confirm the amount from the photo.");
 mergeFinancialEvidence(d,[{text:"Total $11.00",confidence:90}]);expect(d.printedTotalCents).toBeNull();
});
it("pairs financial labels with right-column values even when OCR returns the amount first",()=>{
 const line=(text:string,x:number,y:number)=>({text,confidence:85,bbox:{x0:x,y0:y,x1:x+90,y1:y+20},words:[]});
 const r=readFinancialEvidence({text:"87.50\nTotal 9 item(s)\n5.25\nTaxes\n92.75\nGrand Total",confidence:85,lines:[line("$87.50",300,0),line("Total 9 item(s)",10,8),line("$5.25",300,40),line("Taxes",10,48),line("$92.75",300,80),line("Grand Total",10,88)]});
 expect([r.printedSubtotalCents,r.taxCents,r.printedTotalCents]).toEqual([8750,525,9275]);
});
it("reads decimal punctuation noise in financial rows without treating payment as total",()=>{
 const result=readFinancialEvidence({text:"Subtotal: $74.48\nTax: $2,24\nTota): $76,72\nPayment $100.00",confidence:80});
 expect([result.printedSubtotalCents,result.taxCents,result.printedTotalCents]).toEqual([7448,224,7672]);
});
it("reads spaced footer digits from the explicit total line",()=>{
 const r=readFinancialEvidence({text:"Subtotal 247.27\nSales Tax 14.66\nPlease pay this amount\nTOT ey 261 93",confidence:80});
 expect([r.printedSubtotalCents,r.taxCents,r.printedTotalCents]).toEqual([24727,1466,26193]);
 expect(readFinancialEvidence({text:"Tote 261 , 9-3",confidence:80}).printedTotalCents).toBe(26193);
});
it("never derives tax from a subtotal/total difference or silently overwrites conflicting evidence",()=>{
 const d=parseReceiptText("Food $10.00\nSubtotal $10.00\nTotal $11.00");
 mergeFinancialEvidence(d,[{text:"Subtotal $10.00\nTotal $11.00",confidence:90}]);expect(d.taxCents).toBeNull();
 mergeFinancialEvidence(d,[{text:"Tax $2.00\nTotal $12.00",confidence:90}]);expect(d.printedTotalCents).toBeNull();expect(d.taxCents).toBe(200);
});
