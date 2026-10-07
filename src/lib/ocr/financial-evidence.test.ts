import {expect,it} from "vitest";
import {readFinancialEvidence,mergeFinancialEvidence} from "./financial-evidence";
import {parseReceiptText} from "./parseReceipt";
it("does not append a distant background digit to an incomplete monetary token",()=>{
 const words=[{text:"Total",confidence:95,bbox:{x0:10,y0:10,x1:70,y1:30}},{text:"$83.4",confidence:95,bbox:{x0:300,y0:10,x1:370,y1:30}},{text:"5",confidence:50,bbox:{x0:550,y0:10,x1:570,y1:30}}];
 const line={text:"Total $83.4 5",confidence:90,bbox:{x0:10,y0:10,x1:570,y1:30},words};
 expect(readFinancialEvidence({text:line.text,confidence:90,lines:[line]}).printedTotalCents).toBeNull();
 words[1].text="$83";words[2].text="45";line.text="Total $83 45";
 expect(readFinancialEvidence({text:line.text,confidence:90,lines:[line]}).printedTotalCents).toBeNull();
 words[1].text="$83.";words[2].text="45";words[2].bbox.x0=375;words[2].bbox.x1=395;line.text="Total $83. 45";
 expect(readFinancialEvidence({text:line.text,confidence:90,lines:[line]}).printedTotalCents).toBe(8345);
});
it("recovers a missing line total only when two direct scans agree on the same item",()=>{
 const text="Iced Cocoa x 2 $9.00\n($4.50 each)\nSubtotal $9.00\nTax $0.74\nTotal $9.74";
 const d=parseReceiptText("Iced Cocoa x 2 00");mergeFinancialEvidence(d,[{text,confidence:90},{text,confidence:90}]);
 expect(d.items).toHaveLength(1);expect(d.items[0].name).toBe("Iced Cocoa");expect(d.items[0].priceCents).toBe(900);expect(d.items[0].details?.quantity).toBe(2);
 const conflict=parseReceiptText("Iced Cocoa x 2 00");mergeFinancialEvidence(conflict,[{text,confidence:90},{text:text.replace("$9.00","$8.00"),confidence:90}]);expect(conflict.items[0].priceCents).toBeNull();
});
it("uses a directly rescanned quantity without computing it from price division",()=>{
 const d=parseReceiptText("Iced Cocoa x p) $9.00\n($4.50 each)");
 mergeFinancialEvidence(d,[{text:"Iced Cocoa x 2\n$9.00",confidence:90}]);
 expect(d.items[0].name).toBe("Iced Cocoa");expect(d.items[0].details?.quantity).toBe(2);expect(d.items[0].priceCents).toBe(900);
 expect(d.items[0].details?.sourceLines).toContain("Iced Cocoa x 2");
});
it("reads tax amounts beside a percentage and never treats the rate as money",()=>{
 expect(readFinancialEvidence({text:"Sales tax (7.25%) $1.45",confidence:90}).taxCents).toBe(145);
 const line={text:"Sales tax (7.25 %)",confidence:90,bbox:{x0:0,y0:0,x1:150,y1:20},words:[]};
 expect(readFinancialEvidence({text:line.text,confidence:90,lines:[line]}).taxCents).toBeNull();
});
it("corrects a wrong tax digit only with two agreeing direct scans and a matching complete ledger",()=>{
 const scan={text:"Subtotal $20.00\nTax $1.65\nTotal $21.65",confidence:90};
 const d=parseReceiptText("Noodles $12.00\nTea $8.00\nTax $1.05");
 mergeFinancialEvidence(d,[scan,scan]);expect(d.taxCents).toBe(165);expect(d.warnings.join(" ")).toContain("Tax corrected");
 for(const scans of [[scan],[scan,{text:"Tax $1.64",confidence:90}]]){
  const conflicting=parseReceiptText("Noodles $12.00\nTea $8.00\nTax $1.05");mergeFinancialEvidence(conflicting,scans);expect(conflicting.taxCents).toBeNull();
 }
 const incomplete=parseReceiptText("Noodles $12.00\nTea\nTax $1.05");mergeFinancialEvidence(incomplete,[scan,scan]);expect(incomplete.taxCents).toBeNull();
});
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
 expect(readFinancialEvidence({text:"A Tore 261 | 93",confidence:80}).printedTotalCents).toBe(26193);
});
it("does not borrow tax-table amounts for a summary total tax label",()=>{
 const line=(text:string,y:number)=>({text,confidence:90,bbox:{x0:0,y0:y,x1:200,y1:y+20},words:[]});
 const text="Tax $2.24\nTotal $76.72\nTax Code Rate\nTOTAL TAX $1.94";
 const d=readFinancialEvidence({text,confidence:90,lines:text.split("\n").map((text,index)=>line(text,index*30))});
 expect(d.taxCents).toBe(224);expect(d.printedTotalCents).toBe(7672);
});
it("never derives tax from a subtotal/total difference or silently overwrites conflicting evidence",()=>{
 const d=parseReceiptText("Food $10.00\nSubtotal $10.00\nTotal $11.00");
 mergeFinancialEvidence(d,[{text:"Subtotal $10.00\nTotal $11.00",confidence:90}]);expect(d.taxCents).toBeNull();
 mergeFinancialEvidence(d,[{text:"Tax $2.00\nTotal $12.00",confidence:90}]);expect(d.printedTotalCents).toBeNull();expect(d.taxCents).toBe(200);
});
