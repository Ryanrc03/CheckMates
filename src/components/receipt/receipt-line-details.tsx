import type { ReceiptDetails } from "@/types/receipt-details";
import { formatMoney } from "@/lib/money";
import { Button } from "@/components/ui/button";
export function ReceiptLineDetails({name,details,onDiscountChoice}:{name:string;details:ReceiptDetails;onDiscountChoice:(choice:"included"|"subtract")=>void}){
 return <div className="receipt-line-details">
  <p>{details.quantity!==undefined&&details.quantity!==null&&<>Receipt quantity: {details.quantity}. </>}{details.unitPriceCents!==undefined&&details.unitPriceCents!==null&&<>Unit price: {formatMoney(details.unitPriceCents)}. </>}{details.taxCode&&<>Tax code: {details.taxCode}.</>}</p>
  {!!details.modifiers.length&&<p>Options: {details.modifiers.map(m=>m.text).join(" · ")}</p>}
  {!!details.discounts.length&&<div>
   {details.discounts.map((d,i)=><p key={i}><span>{d.inclusion==="included"?"Discount already included":d.inclusion==="subtract"?"Discount subtracted once":"Discount needs review"}</span> · {formatMoney(d.discountCents)}</p>)}
   <p>Choose whether the printed line amount already includes the listed discount. These choices use the printed amount.</p>
   <div className="row"><Button type="button" variant="outline" onClick={()=>onDiscountChoice("included")}>Use printed line total</Button><Button type="button" variant="outline" onClick={()=>onDiscountChoice("subtract")}>Subtract listed discount</Button></div>
  </div>}
  <details><summary>Receipt evidence for {name}</summary><pre>{details.sourceLines.join("\n")}</pre></details>
 </div>;
}
