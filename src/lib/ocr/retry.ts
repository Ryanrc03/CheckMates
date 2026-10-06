import type {OcrEvidence} from "@/types/ocr";
import type {ReceiptDraft} from "@/types/receipt";
import {parseReceiptText} from "./parseReceipt";
export function shouldRetryReceipt(evidence:OcrEvidence,draft:ReceiptDraft):boolean{
 if(evidence.confidence<60||draft.printedSubtotalCents===null||draft.taxCents===null||draft.printedTotalCents===null||draft.items.some(i=>i.priceCents===null))return true;
 return draft.items.reduce((s,i)=>s+BigInt(i.priceCents??0),0n)!==BigInt(draft.printedSubtotalCents);
}
const normalized=(s:string)=>s.toLowerCase().replace(/[^a-z0-9]/g,"");
export function parseReceiptEvidence(evidence:OcrEvidence):ReceiptDraft{
 const draft=parseReceiptText(evidence.text,evidence.lines);
 if(evidence.enhancementError)draft.warnings.push("Enhanced scan was unavailable. Review the original scan or retry.");
 if(evidence.confidence<60)draft.warnings.push("Recognition confidence is low. Compare every line with the photo.");
 if(!evidence.alternate)return draft;
 draft.alternateRawText=evidence.alternate.text;
 const other=parseReceiptText(evidence.alternate.text,evidence.alternate.lines);
 const used=new Set<number>();
 for(const item of draft.items){
  const index=other.items.findIndex((i,k)=>!used.has(k)&&normalized(i.name)===normalized(item.name));
  if(index<0)continue;used.add(index);
  const alternate=other.items[index];
  if(item.priceCents!==null&&alternate.priceCents!==null&&item.priceCents!==alternate.priceCents){
   item.priceCents=null;item.details?.reviewCodes.push("ocr-price");
   draft.warnings.push(`Scans disagree on the price for ${item.name}. Enter the amount from the photo.`);
  }
 }
 for(const key of ["printedSubtotalCents","taxCents","printedTotalCents","tipCents"] as const){
  if(draft[key]!==null&&other[key]!==null&&draft[key]!==other[key]){draft[key]=null;draft.warnings.push(`Scans disagree on ${key}. Confirm the amount from the photo.`);}
 }
 return draft;
}
/** Ranking uses extracted structure, never rewrites prices to force a printed total. */
export function chooseReceiptCandidate(primary:OcrEvidence,secondary:OcrEvidence):OcrEvidence{
 const score=(e:OcrEvidence)=>{
  const d=parseReceiptText(e.text,e.lines);
  return d.items.filter(i=>i.priceCents!==null).length*2-d.items.filter(i=>i.priceCents===null).length*3
    +[d.printedSubtotalCents,d.taxCents,d.printedTotalCents].filter(v=>v!==null).length*3;
 };
 const priced=(e:OcrEvidence)=>parseReceiptText(e.text,e.lines).items.filter(i=>i.priceCents!==null).length;
 return priced(secondary)>=priced(primary)&&score(secondary)>score(primary)?{...secondary,alternate:primary}:{...primary,alternate:secondary};
}
