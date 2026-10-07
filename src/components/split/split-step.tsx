import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useBillStore } from "@/store/useBillStore";
import { formatMoney } from "@/lib/money";
import { validateItemAllocation } from "@/lib/item-allocation";
import { ItemAllocationEditor } from "./item-allocation-editor";
export function SplitStep() {
 const s=useBillStore();const [error,setError]=useState("");
 const assigned=s.bill.items.filter(i=>validateItemAllocation(i.allocation,s.bill.people).valid && !s.allocationEdits?.[i.id]).length;
 function proceed(){
   if(Object.keys(s.allocationEdits??{}).length){setError("Apply the pending shares before viewing the result.");return;}
   if(assigned!==s.bill.items.length){setError("Choose at least one friend for every item. Fully assign any quantities.");return;}
   setError("");s.goTo("result");
 }
 return <section><div className="step-heading"><p className="eyebrow">A BITE FOR EVERYONE</p><h1>Who had what?</h1><p>Choose who shared each item, equally or by their share.</p></div><p className="assignment-count" role="status">{assigned} of {s.bill.items.length} items assigned</p>
 {s.bill.items.map(item=><fieldset className={`paper assignment ${error&&!validateItemAllocation(item.allocation,s.bill.people).valid?"unassigned":""}`} key={item.id} aria-label={`Assign ${item.name}`}><legend className="sr-only">Assign {item.name}</legend><div className="assignment-title"><h2>{item.name}</h2><b>{formatMoney(item.priceCents)}</b></div><ItemAllocationEditor item={item} people={s.bill.people}/></fieldset>)}
 {error&&<p className="notice" role="alert">{error.startsWith("Choose")?<><span>Choose at least one friend for every item.</span> Fully assign any quantities.</>:error}</p>}
 <div className="bottom-actions"><Button variant="outline" onClick={()=>s.goTo("people")}>Back to friends</Button><Button onClick={proceed}>See the split →</Button></div></section>;
}
