import { parseMoney } from "../money";
import type { OcrLine } from "@/types/ocr";
export type LineRole="item"|"modifier"|"unit"|"discount"|"subtotal"|"total"|"tax"|"tax-table"|"tax-detail"|"tip"|"suggestion"|"metadata"|"unknown"|"amount";
export type ClassifiedLine={raw:string;text:string;label:string;amount:number|null;role:LineRole;negative:boolean;taxCode:string|null;bbox?:OcrLine["bbox"]};
function sourceRows(text:string,lines?:OcrLine[]):{text:string;bbox?:OcrLine["bbox"]}[]{
 if(!lines?.length)return text.split(/\r?\n/).map(text=>({text}));
 const ordered=[...lines].sort((a,b)=>a.bbox.y0-b.bbox.y0||a.bbox.x0-b.bbox.x0);
 const rows:OcrLine[]=[];
 for(const line of ordered){
  const previous=rows.at(-1);const height=Math.max(1,line.bbox.y1-line.bbox.y0);
  const aligned=previous&&Math.abs((previous.bbox.y0+previous.bbox.y1)/2-(line.bbox.y0+line.bbox.y1)/2)<Math.min(height,previous.bbox.y1-previous.bbox.y0)*0.45;
  const amountOnly=(s:string)=>/^\s*\$?\s*\d+\.\d{2}(?:\s+F?T[\dOI]+)?\s*$/.test(s);
  if(aligned&&previous&& (amountOnly(previous.text)||amountOnly(line.text))){
   const pair=[previous,line].sort((a,b)=>a.bbox.x0-b.bbox.x0);
   rows[rows.length-1]={...previous,text:pair.map(p=>p.text).join(" "),bbox:{x0:Math.min(previous.bbox.x0,line.bbox.x0),x1:Math.max(previous.bbox.x1,line.bbox.x1),y0:Math.min(previous.bbox.y0,line.bbox.y0),y1:Math.max(previous.bbox.y1,line.bbox.y1)}};
  }else rows.push({...line});
 }
 return rows;
}
export function classifyReceiptLines(text:string,lines?:OcrLine[]):ClassifiedLine[]{
 let table=false;
 return sourceRows(text,lines).filter(row=>row.text.trim()).map(row=>{
  const raw=row.text;const s=raw.trim();
  const explicit=[...s.matchAll(/\$\s*(\d+(?:,\d{3})*\.\d{2})(?!\d)/g)].at(-1);
  const match=explicit??s.match(/\s+(\d+(?:,\d{3})*\.\d{2})(?:\s+(?:F?T[\dOI]+|[A-Z]))?\s*$/);
  const amount=match?parseMoney(match[1].replaceAll(",","")):null;
  const label=match?s.slice(0,match.index).trim().replace(/\s+\$$/,""):s;
  const taxCode=s.match(/\b(F?T[\dOI]+)\s*$/)?.[1]??null;
  let role:LineRole="unknown";
  if(/tax\s*code.*taxable/i.test(s)){table=true;role="tax-table";}
  else if(table&&/^\d+\s+.*\d+(?:\.\d+)?%/i.test(s))role="tax-detail";
  else if(/\b(suggest|recommended|tip guide|gratuity guide)/i.test(s))role="suggestion";
  else if(/\b(?:paid\s+by|payment|cash\s+change|you\s+saved|credit\s+sale|amount\s*:|visa|mastercard|amex|discover|tender|auth(?:orization)?|contactless|verified on device)\b|^(?:ticket|receipt)\s*:|^aid\s+[a-f\d ]+$|^for here$/i.test(s))role="metadata";
  else if(/\b(?:sub\s*total)\b/i.test(label)||/\btotal\s+\d+\s+item\(s\)/i.test(label))role="subtotal";
  else if(/\b(?:tax(?:es)?|vat)\b/i.test(label))role="tax";
  else if(/\b(?:grand\s*total|total|amount due|balance due)\b/i.test(label))role="total";
  else if(/\b(?:tip|gratuity)\b/i.test(label))role="tip";
  else if(/\b(?:disc(?:ount)?|coupon)\b/i.test(s))role="discount";
  else if(/\beach\b|\bunit price\b|^\d+\s*@|^\(?\$\d+\.\d{2}\s+each/i.test(s))role="unit";
  else if(/\b(?:service|svc|surcharge)\b/i.test(label))role="metadata";
  else if(amount!==null&&/[a-z]/i.test(label))role="item";
  else if(/^\$?\s*\d+\.\d{2}\s*$/.test(s)||(/^\(?\d+(?:\.\d+)?%\)?\s*\$?\d+\.\d{2}\s*$/.test(s)))role="amount";
  else if(/^(?:\d+\s+)?[*x]\s+\S|^\[.+\]|^(?:chicken|beef|pork|tofu|shrimp|no onions?|mild|medium|spicy|for here|take\s*out)\s*$/i.test(s))role="modifier";
  else if(/no beverage|dine.?in|party size|duplicate receipt|stored order|please pay|^item count|^(?:server|table|order|cashier|station)\b|thank|welcome|www\.|https?:|\b(?:street|avenue|ave|road|blvd|broadway|restaurant|cafe|diner|cuisine|supermarket)\b|\d{2,4}[/-]\d{1,2}[/-]\d{1,4}|\d{3}[-.) ]\s*\d{3}[-. ]\d{4}|\*{2,}/i.test(s))role="metadata";
  return {raw,text:s,label,amount,role,negative:/[-−]\s*\$\s*\d|(?:^|\s)[-−]\s*\d+\.\d{2}/.test(s),taxCode,bbox:row.bbox};
 });
}
