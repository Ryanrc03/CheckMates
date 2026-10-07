import type { ReceiptDraft, DraftItem } from "@/types/receipt";
import type { ReceiptDetails } from "@/types/receipt-details";
import type { OcrLine } from "@/types/ocr";
import { parseMoney } from "../money";
import { classifyReceiptLines, type ClassifiedLine } from "./classifyLines";
import { resolveReceiptAmounts } from "./resolveAmounts";
const freshDetails=():ReceiptDetails=>({sourceLines:[],modifiers:[],discounts:[],reviewCodes:[]});
function itemName(row:ClassifiedLine):{name:string;quantity:number|null;unitPriceCents:number|null}{
 let name=row.label.replace(/^[|:;−-]\s*/,"");let quantity:number|null=null;
 const prefix=name.match(/^(\d+)\s+(?:[x×]\s*)?/i);
 if(prefix){quantity=Number(prefix[1]);name=name.slice(prefix[0].length).replace(/^\d+\s+(?=[a-z])/i,"");}
 const suffix=name.match(/\s*[x×]\s*(\d+)\s*$/i);if(suffix){quantity=Number(suffix[1]);name=name.slice(0,suffix.index);}
 const unit=name.match(/\(\s*\$?(\d+\.\d{2})\s*\)/);
 const unitPriceCents=unit?parseMoney(unit[1]):null;
 if(unit)name=name.replace(unit[0],"").trim();
 return {name:name.trim(),quantity:quantity!==null&&Number.isSafeInteger(quantity)&&quantity>0?quantity:null,unitPriceCents};
}
/** Receipt semantics are separated from character recognition. Every suggestion retains its source. */
export function parseReceiptText(text:string,lines?:OcrLine[]):ReceiptDraft{
 const draft:ReceiptDraft={rawText:text,items:[],taxCents:null,tipCents:0,printedSubtotalCents:null,printedTotalCents:null,warnings:[]};
 const rows=classifyReceiptLines(text,lines);let totalsSeen=false;let suggestions=false;
 let pending:"printedSubtotalCents"|"printedTotalCents"|"taxCents"|null=null;
 let pendingUnit:{price:number|null;quantity:number|null;source:string}|null=null;
 const taxParts:number[]=[];
 const warn=(s:string)=>{if(!draft.warnings.includes(s))draft.warnings.push(s);};
 const last=()=>draft.items.at(-1);
 const details=(item:DraftItem)=>item.details??(item.details=freshDetails());
 const firstPrice=rows.findIndex(r=>r.role==="item");
 for(const [index,row]of rows.entries()){
  const {role,amount,label}=row;
  if(pending && role==="amount" && amount!==null){draft[pending]=amount;pending=null;continue;}
  pending=null;
  if(role==="suggestion"){suggestions=true;continue;}
  if(role==="metadata"){
   if(/\bservice\b|\bsvc\b|surcharge/i.test(label))warn(`Review unsupported service charge: ${row.raw}`);
   continue;
  }
  if(role==="subtotal"){
   if(draft.printedSubtotalCents!==null&&draft.printedSubtotalCents!==amount)warn("Multiple subtotals: confirm the printed subtotal.");
   draft.printedSubtotalCents=amount;if(amount===null)pending="printedSubtotalCents";totalsSeen=true;continue;
  }
  if(role==="tax-table")continue;
  if(role==="tax-detail"){if(amount!==null)taxParts.push(amount);continue;}
  if(role==="tax"){
   if(draft.taxCents===null)draft.taxCents=amount;
   else if(amount!==null&&draft.taxCents!==amount)warn("Multiple tax lines: confirm the total tax.");
   if(amount===null)pending="taxCents";totalsSeen=true;continue;
  }
  if(role==="total"){
   if(draft.printedTotalCents!==null&&amount!==null&&draft.printedTotalCents!==amount)warn("Multiple total lines: confirm which total was charged.");
   if(draft.printedTotalCents===null||/grand\s*total/i.test(label))draft.printedTotalCents=amount;
   if(amount===null)pending="printedTotalCents";totalsSeen=true;continue;
  }
  if(suggestions)continue;
  if(role==="tip"){
   if(/%/.test(row.text))continue;
   if(draft.tipCents)warn("Multiple gratuity lines: confirm the charged tip.");
   draft.tipCents=amount;continue;
  }
  if(role==="discount"){
   const item=last();
   if(!totalsSeen&&item&&amount!==null){const d=details(item);d.discounts.push({discountCents:amount,inclusion:"unresolved",sourceLine:row.raw});d.sourceLines.push(row.raw);}
   else {(draft.unassignedDiscounts??=[]).push(row.raw);warn(`Review unsupported or unassigned discount: ${row.raw}`);}
   continue;
  }
  if(totalsSeen)continue;
  if(role==="unit"){
   const price=row.text.match(/\$\s*(\d+\.\d{2})\s*(?:each|gach)/i)?.[1]??row.text.match(/unit price\s*:?\s*\$?(\d+\.\d{2})/i)?.[1];
   const qty=row.text.match(/^(\d+)\s*@/)?.[1];
   if(qty&&price){pendingUnit={price:parseMoney(price),quantity:Number(qty),source:row.raw};}
   else if(last()) {const d=details(last()!);if(price)d.unitPriceCents=parseMoney(price);d.sourceLines.push(row.raw);d.modifiers.push({text:row.text,sourceLine:row.raw});}
   continue;
  }
  if(role==="modifier"&&last()){
   const parent=last()!.details?.parentSourceId;
   const main=parent?draft.items.find(i=>i.details?.sourceId===parent)??last()!:last()!;
   const d=details(main);d.modifiers.push({text:row.text,sourceLine:row.raw});d.sourceLines.push(row.raw);continue;
  }
  if(role==="item"&&amount!==null){
   if(row.negative){warn(`Negative amount needs manual review: ${row.raw}`);continue;}
   const parsed=itemName(row);const d=freshDetails();d.sourceId=`line-${index}`;d.sourceLines.push(row.raw);d.quantity=parsed.quantity??pendingUnit?.quantity??1;d.unitPriceCents=parsed.unitPriceCents??pendingUnit?.price??null;d.taxCode=row.taxCode;d.printedPriceCents=amount;
   if(row.bbox)d.bbox=row.bbox;
   if(pendingUnit){d.sourceLines.unshift(pendingUnit.source);pendingUnit=null;}
   if(/^add\b/i.test(parsed.name)&&last())d.parentSourceId=last()!.details?.sourceId;
   if((parsed.quantity??1)>1)warn(`Check quantity: confirm the line total for ${parsed.name}.`);
   if(d.unitPriceCents!==null&&BigInt(d.unitPriceCents!)*BigInt(d.quantity!)!==BigInt(amount))d.reviewCodes.push("unit-price");
   draft.items.push({name:parsed.name,priceCents:amount,sourceLine:row.raw,details:d});continue;
  }
  if((role==="unknown"||role==="modifier")&&/[a-z]/i.test(row.text)){
   // A merchant name preceding an address/service header is metadata; a lone missing dish stays editable.
   if(index<firstPrice&&rows.slice(index+1,firstPrice).some(r=>r.role==="metadata"))continue;
   const custom=last()&&/^(?:CYO\b|custom\b|build.*own)/i.test(last()!.name);
   const indented=/^\s{2,}\S/.test(row.raw)||(row.bbox&&last()?.details?.bbox&&row.bbox.x0>last()!.details!.bbox!.x0+20);
   if(last()&&(/^chicken\b.*[^\w\s]/i.test(row.text)||custom&&indented)){
    const d=details(last()!);d.modifiers.push({text:row.text,sourceLine:row.raw});d.sourceLines.push(row.raw);continue;
   }
   const d=freshDetails();d.sourceLines.push(row.raw);d.reviewCodes.push("missing-price");
   draft.items.push({name:row.text,priceCents:null,sourceLine:row.raw,details:d});warn(`Missing or unclear price: ${row.text}`);
  }
 }
 if(taxParts.length){const sum=taxParts.reduce((s,n)=>s+n,0);if(draft.taxCents===null)draft.taxCents=Number.isSafeInteger(sum)?sum:null;else if(sum!==draft.taxCents)warn("Tax summary conflicts with the tax detail table. Confirm total tax.");}
 resolveReceiptAmounts(draft);
 for(const item of draft.items){if(item.details?.reviewCodes.includes("unit-price")&&!item.details.discounts.length)warn(`Unit price differs from line total: check ${item.name}.`);}
 if(draft.taxCents===null)warn("Tax was not identified. Enter the tax or explicitly enter 0.");
 if(!draft.items.length)warn("No usable items found. Add the receipt items manually or try a clearer photo.");
 return draft;
}
