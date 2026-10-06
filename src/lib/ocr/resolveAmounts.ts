import type { ReceiptDraft } from "@/types/receipt";
import { parseMoney } from "../money";
/** Resolve only complete arithmetic evidence; an uncertain discount never becomes a negative item. */
export function resolveReceiptAmounts(draft:ReceiptDraft):void{
 const complete=draft.items.every(i=>i.priceCents!==null);
 const sum=draft.items.reduce((n,i)=>n+BigInt(i.priceCents??0),0n);
 const discounts=draft.items.flatMap(i=>i.details?.discounts??[]);
 const saved=draft.rawText.match(/you\s+saved\s*:?\s*\$?(\d+\.\d{2})/i);
 const savedCents=saved?parseMoney(saved[1]):null;
 const savings=discounts.reduce((n,d)=>n+BigInt(d.discountCents),0n);
 const globalIncluded=complete&&draft.printedSubtotalCents!==null&&sum===BigInt(draft.printedSubtotalCents)&&savedCents!==null&&savings===BigInt(savedCents);
 const allSubtract=complete&&draft.printedSubtotalCents!==null&&sum-savings===BigInt(draft.printedSubtotalCents)&&draft.items.length===1;
 for(const item of draft.items){
  const details=item.details;if(!details||!details.discounts.length||item.priceCents===null)continue;
  const total=details.discounts.reduce((n,d)=>n+BigInt(d.discountCents),0n);
  const nominal=details.unitPriceCents!==undefined&&details.unitPriceCents!==null?BigInt(details.unitPriceCents)*BigInt(details.quantity??1):null;
  const unitIncluded=nominal!==null&&nominal-total===BigInt(item.priceCents);
  const negative=details.discounts.every(d=>/[-−]\s*\$?\s*\d/.test(d.sourceLine));
  const basis=negative&&(globalIncluded||unitIncluded)?"included":negative&&allSubtract&&total<=BigInt(item.priceCents)?"subtract":"unresolved";
  details.discounts.forEach(d=>{d.inclusion=basis;});
  if(basis==="subtract")item.priceCents-=Number(total);
  if(basis==="unresolved"){details.reviewCodes.push("discount");draft.warnings.push(`Review discount: confirm whether ${item.name} already includes it.`);}
 }
}
