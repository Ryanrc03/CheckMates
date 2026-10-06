import type {OcrEvidence} from "@/types/ocr";
import type {ReceiptDraft} from "@/types/receipt";
import {parseReceiptText} from "./parseReceipt";
import {parseMoney} from "../money";
const keys=["printedSubtotalCents","taxCents","printedTotalCents"] as const;
function rejectConflicts(draft:ReceiptDraft):ReceiptDraft{
 for(const [key,phrase]of [["printedSubtotalCents","Multiple subtotals"],["taxCents","Multiple tax lines"],["printedTotalCents","Multiple total lines"]] as const){
  if(draft.warnings.some(w=>w.includes(phrase))){draft[key]=null;draft.warnings.push(`Financial scans disagree on ${key}. Enter the amount from the photo.`);}
 }
 return draft;
}
function clean(text:string):string{
 return text.replace(/\bTota[)1|](?=[:;\s]|$)/gi,"Total").replace(/^\s*Tote\b/gmi,"Total").replace(/^\s*TOT\s+[^\d\n]+(?=\d)/gmi,"Total ")
  .replace(/(\d+)\s*[.,]\s*(\d)\s*[- ]?\s*(\d)(?!\d)/g,"$1.$2$3")
  .replace(/(\d)[, ](\d{2})(?!\d)/g,"$1.$2");
}
export function readFinancialEvidence(evidence:OcrEvidence):ReceiptDraft{
 const lines=evidence.lines?.map(line=>({...line,text:clean(line.text),words:line.words.map(word=>({...word,text:clean(word.text)}))}));
 if(!lines?.length)return rejectConflicts(parseReceiptText(clean(evidence.text)));
 const rows:string[]=[];
 const amounts=lines.filter(line=>/^\s*\$?\s*(?:\d{1,3}(?:,\d{3})+|\d+)\.\d{2}\s*$/.test(line.text));
 const used=new Set<(typeof lines)[number]>();
 for(const line of [...lines].sort((a,b)=>a.bbox.y0-b.bbox.y0)){
  const text=line.text.trim();if(/tax\s*code|taxable|\brate\b|suggest|\bpayment\b|\bpaid\b|%/i.test(text))continue;
  const role=/sub\s*tot|^total\s+\d+\s+item/i.test(text)?"Subtotal":/\btax(?:es)?\b/i.test(text)?"Tax":/\b(?:grand\s+)?total\b|^tot\b/i.test(text)?"Total":null;
  if(!role)continue;
  const inline=[...text.matchAll(/(?<![\d.,])\$?\s*((?:\d{1,3}(?:,\d{3})+|\d+)\.\d{2})(?!\d)/g)].at(-1)?.[1];
  let amount=inline?parseMoney(inline.replaceAll(",","")):null;
  if(amount===null){
   const center=(line.bbox.y0+line.bbox.y1)/2;
   const candidates=amounts.map(other=>({other,distance:Math.abs((other.bbox.y0+other.bbox.y1)/2-center)}))
    .filter(({other,distance})=>!used.has(other)&&other.bbox.x0>=line.bbox.x1&&distance<Math.max(line.bbox.y1-line.bbox.y0,other.bbox.y1-other.bbox.y0)*.9)
    .sort((a,b)=>a.distance-b.distance);
   if(candidates.length&&(!candidates[1]||candidates[1].distance-candidates[0].distance>3)){amount=parseMoney(candidates[0].other.text.replace(/[$,]/g,"").trim());if(amount!==null)used.add(candidates[0].other);}
  }
  if(amount!==null)rows.push(`${role} ${(amount/100).toFixed(2)}`);
 }
 return rejectConflicts(parseReceiptText(rows.join("\n")));
}
export function mergeFinancialEvidence(draft:ReceiptDraft,evidence:OcrEvidence[]):void{
 const conflicts=new Set<string>(keys.filter(key=>draft.warnings.some(w=>w.includes(`Scans disagree on ${key}`)||w.includes(`Financial scans disagree on ${key}`))));
 for(const scan of evidence){const read=readFinancialEvidence(scan);for(const key of keys){
  if(read.warnings.some(w=>w.includes(`Financial scans disagree on ${key}`))){draft[key]=null;conflicts.add(key);draft.warnings.push(`Financial scans disagree on ${key}. Enter the amount from the photo.`);continue;}
  const amount=read[key];if(amount===null||conflicts.has(key))continue;
  if(draft[key]!==null&&draft[key]!==amount){draft[key]=null;conflicts.add(key);draft.warnings.push(`Financial scans disagree on ${key}. Enter the amount from the photo.`);}else draft[key]=amount;
 }}
 draft.financialRawText=evidence.map(scan=>scan.text);
 if(draft.taxCents!==null)draft.warnings=draft.warnings.filter(w=>w!=="Tax was not identified. Enter the tax or explicitly enter 0.");
}
