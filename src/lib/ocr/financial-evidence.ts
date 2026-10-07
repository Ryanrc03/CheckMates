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
 return text.replace(/\bTota[)1|]?(?=[:;\s]|$)/gi,"Total").replace(/\bTo[tr]e\b/gi,"Total").replace(/^\s*TOT\s+[^\d\n]+(?=\d)/gmi,"Total ")
  .replace(/(\d+)\s*[.,|]\s*(\d)\s*[- ]?\s*(\d)(?!\d)/g,"$1.$2$3")
  .replace(/(\d)[, ](\d{2})(?!\d)/g,"$1.$2");
}
export function readFinancialEvidence(evidence:OcrEvidence):ReceiptDraft{
 const lines=evidence.lines?.map(line=>{
  // A background digit far away from "$78.4" cannot supply its missing cent.
  let text=line.text;
  for(let index=0;index<line.words.length-1;index++){
   const left=line.words[index];let next=index+1;
   if(/^[.,|]$/.test(line.words[next].text))next++;
   const right=line.words[next];if(!right)continue;
   if(/\d(?:[.,]\d?)?$/.test(left.text)&&/^\d{1,2}$/.test(right.text)&&right.bbox.x0-left.bbox.x1>2*Math.max(left.bbox.y1-left.bbox.y0,right.bbox.y1-right.bbox.y0)){
    text=text.replace(new RegExp(`${left.text.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}\\s+(?:[.,|]\\s+)?${right.text}\\b`),`${left.text} ¦ ${right.text}`);
   }
  }
  return {...line,text:clean(text),words:line.words.map(word=>({...word,text:clean(word.text)}))};
 });
 if(!lines?.length)return rejectConflicts(parseReceiptText(clean(evidence.text)));
 const rows:string[]=[];
 const amounts=lines.filter(line=>/^\s*\$?\s*(?:\d{1,3}(?:,\d{3})+|\d+)\.\d{2}\s*$/.test(line.text));
 const used=new Set<(typeof lines)[number]>();
 let taxTable=false;
 for(const line of [...lines].sort((a,b)=>a.bbox.y0-b.bbox.y0)){
  if(/tax\s*code|\brate\b/i.test(line.text))taxTable=true;
  if(taxTable)continue;
  const text=line.text.trim();if(/tax\s*code|taxable|\brate\b|suggest|\bpayment\b|\bpaid\b/i.test(text))continue;
  const role=/sub\s*tot|^total\s+\d+\s+item/i.test(text)?"Subtotal":/\btax(?:es)?\b/i.test(text)?"Tax":/\b(?:grand\s+)?total\b|^tot\b/i.test(text)?"Total":null;
  if(!role)continue;
  if(/%/.test(text)&&role!=="Tax")continue;
  const withoutRates=text.replace(/\d+(?:\.\d+)?\s*%/g,"");
  const inline=[...withoutRates.matchAll(/(?<![\d.,])\$?\s*((?:\d{1,3}(?:,\d{3})+|\d+)\.\d{2})(?!\d)/g)].at(-1)?.[1];
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
 const itemScans=evidence.map(scan=>parseReceiptText(scan.text,scan.lines));
 const baseName=(name:string)=>name.replace(/\s+[x×]\s+.*$/i,"").toLowerCase().replace(/[^a-z0-9]/g,"");
 for(const item of draft.items){
  if(item.priceCents!==null)continue;
  const matches=itemScans.map(scan=>scan.items.filter(other=>baseName(other.name)===baseName(item.name)));
  if(matches.length<2||matches.some(list=>list.length!==1||list[0].priceCents===null))continue;
  const recovered=matches[0][0];if(!matches.every(list=>list[0].priceCents===recovered.priceCents))continue;
  const oldName=item.name;item.name=recovered.name;item.priceCents=recovered.priceCents;
  item.details={...recovered.details!,sourceLines:[...(item.details?.sourceLines??[]),...recovered.details!.sourceLines]};
  draft.warnings=draft.warnings.filter(w=>w!==`Missing or unclear price: ${oldName}`);
  draft.warnings.push(`Price reread in two scans for ${item.name}; check the line total against the photo.`);
 }
 for(const item of draft.items){
  const unclear=item.name.match(/^(.+?)\s+[x×]\s+([^\d].*)$/i);if(!unclear||!item.details)continue;
  const normalize=(s:string)=>s.toLowerCase().replace(/[^a-z0-9]/g,"");
  const sightings=evidence.flatMap(scan=>(scan.lines?.map(l=>l.text)??scan.text.split(/\r?\n/)).flatMap(text=>{
   const match=text.trim().match(/^(.+?)\s+[x×]\s*(\d+)(?:\s+\$\d+\.\d{2})?\s*$/i);
   return match&&normalize(match[1])===normalize(unclear[1])?[{quantity:Number(match[2]),text}]:[];
  }));
  const qty=sightings[0]?.quantity;
  if(qty&&Number.isSafeInteger(qty)&&sightings.every(s=>s.quantity===qty)){
   item.name=unclear[1].trim();item.details.quantity=qty;item.details.sourceLines.push(...sightings.map(s=>s.text));
   item.details.reviewCodes=item.details.reviewCodes.filter(code=>code!=="unit-price");
   if(item.details.unitPriceCents!==null&&item.details.unitPriceCents!==undefined&&item.priceCents!==null&&item.details.unitPriceCents*qty!==item.priceCents)item.details.reviewCodes.push("unit-price");
   draft.warnings=draft.warnings.filter(w=>!w.startsWith(`Unit price differs from line total: check ${unclear[0]}`));
   draft.warnings.push(`Check quantity: financial scan reads ${qty} for ${item.name}.`);
  }
 }
 const reads=evidence.map(readFinancialEvidence);
 // A misread tax digit may be corrected only by two direct rescans plus a complete,
 // matching printed ledger. Never manufacture tax from the subtotal difference.
 const confirmed=reads.find(r=>r.taxCents!==null&&r.printedSubtotalCents!==null&&r.printedTotalCents!==null
  &&r.printedSubtotalCents+r.taxCents===r.printedTotalCents
  &&reads.filter(other=>other.taxCents===r.taxCents).length>=2
  &&reads.every(other=>keys.every(key=>other[key]===null||other[key]===r[key]))
  &&draft.items.length>0&&draft.items.every(i=>i.priceCents!==null&&!i.details?.discounts.length)
  &&draft.items.reduce((sum,i)=>sum+i.priceCents!,0)===r.printedSubtotalCents
  &&draft.tipCents===0&&!draft.unassignedDiscounts?.length
  &&["printedSubtotalCents","printedTotalCents"].every(key=>draft[key as typeof keys[number]]===null||draft[key as typeof keys[number]]===r[key as typeof keys[number]])
  &&!draft.warnings.some(w=>/Scans disagree|Financial scans disagree/.test(w)));
 if(confirmed&&draft.taxCents!==null&&draft.taxCents!==confirmed.taxCents){
  draft.taxCents=confirmed.taxCents;draft.warnings.push("Tax corrected by two matching financial scans; check the tax evidence against the photo.");
 }
 const conflicts=new Set<string>(keys.filter(key=>draft.warnings.some(w=>w.includes(`Scans disagree on ${key}`)||w.includes(`Financial scans disagree on ${key}`))));
 for(const scan of evidence){const read=readFinancialEvidence(scan);for(const key of keys){
  if(read.warnings.some(w=>w.includes(`Financial scans disagree on ${key}`))){draft[key]=null;conflicts.add(key);draft.warnings.push(`Financial scans disagree on ${key}. Enter the amount from the photo.`);continue;}
  const amount=read[key];if(amount===null||conflicts.has(key))continue;
  if(draft[key]!==null&&draft[key]!==amount){draft[key]=null;conflicts.add(key);draft.warnings.push(`Financial scans disagree on ${key}. Enter the amount from the photo.`);}else draft[key]=amount;
 }}
 draft.financialRawText=evidence.map(scan=>scan.text);
 if(draft.taxCents!==null)draft.warnings=draft.warnings.filter(w=>w!=="Tax was not identified. Enter the tax or explicitly enter 0.");
}
