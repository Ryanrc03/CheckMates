import { Check, ChevronDown, Users } from "lucide-react";
import type { ItemAllocation, Person, ReceiptItem } from "@/types/bill";
import type { AllocationEdit } from "@/types/receipt";
import { allocateItemCents, allocationPersonIds, validateItemAllocation } from "@/lib/item-allocation";
import { useBillStore } from "@/store/useBillStore";
import { formatMoney } from "@/lib/money";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { personColor } from "../people/person-style";

function fromItem(item: ReceiptItem, people: Person[]): AllocationEdit {
  const a = item.allocation;
  return { mode:a.mode,totalUnits:a.mode==="quantity"?String(a.totalUnits):"",unitLabel:a.mode==="quantity"?a.unitLabel:"pieces",
    entries:people.map(p=>({personId:p.id,value:String(a.mode==="equal"?(a.personIds.includes(p.id)?1:0):(a.shares.find(s=>s.personId===p.id)?.units??0))})) };
}
function parseEdit(e: AllocationEdit, people: Person[]): { allocation?: ItemAllocation; message?: string } {
  const integer=(s:string)=>/^\d+$/.test(s.trim()) && Number.isSafeInteger(Number(s));
  if (e.entries.some(p=>!integer(p.value))) return {message:"Use whole numbers (0 means no share)."};
  const shares=e.entries.filter(p=>Number(p.value)>0).map(p=>({personId:p.personId,units:Number(p.value)}));
  if (e.mode==="quantity" && (!integer(e.totalUnits) || Number(e.totalUnits)<=0)) return {message:"Enter a positive whole number of total units."};
  const allocation: ItemAllocation=e.mode==="equal"?{mode:"equal",personIds:shares.map(s=>s.personId)}:e.mode==="ratio"?{mode:"ratio",shares}:{mode:"quantity",totalUnits:Number(e.totalUnits),unitLabel:e.unitLabel.trim()||"pieces",shares};
  const result=validateItemAllocation(allocation,people);
  return result.valid?{allocation}:{message:result.message};
}
export function ItemAllocationEditor({item,people}:{item:ReceiptItem;people:Person[]}) {
  const s=useBillStore();const pending=s.allocationEdits?.[item.id];const edit=pending??fromItem(item,people);
  const {allocation,message}=parseEdit(edit,people);
  const preview=allocation?allocateItemCents({...item,allocation},people):[];
  const change=(patch:Partial<AllocationEdit>)=>s.saveAllocationEdit(item.id,{...edit,...patch});
  const mode=(next:ItemAllocation["mode"])=>{
    if(next==="equal"){s.resetEqualAllocation(item.id);return;}
    change({mode:next,totalUnits:next==="quantity" && edit.mode!=="quantity"?"":edit.totalUnits});
  };
  const selected=allocationPersonIds(item.allocation);
  return <div className="allocation-editor">
    <div className="split-method"><label htmlFor={`split-${item.id}`}>Split method</label><span className="select-wrap"><select id={`split-${item.id}`} value={edit.mode} onChange={e=>mode(e.target.value as ItemAllocation["mode"])}><option value="equal">Equal</option><option value="ratio">Ratio</option><option value="quantity">Quantity</option></select><ChevronDown aria-hidden="true"/></span></div>
    {edit.mode==="equal"?<>
      <div className="chip-list">{people.map((p,i)=><button key={p.id} type="button" className={`chip ${personColor(i)}`} aria-pressed={selected.includes(p.id)} onClick={()=>s.togglePerson(item.id,p.id)}>{selected.includes(p.id)?<Check aria-hidden="true"/>:<span className="chip-dot" aria-hidden="true"/>}{p.name}</button>)}<button type="button" className="chip chip-everyone" onClick={()=>s.assignEveryone(item.id)}><Users aria-hidden="true"/>Everyone</button></div>
      {!selected.length&&<p className="assign-hint">Choose at least one friend</p>}
    </>:<>
      {edit.mode==="quantity"&&<div className="quantity-heading"><label className="share-field"><span className="field-label">Total units</span><Input inputMode="numeric" value={edit.totalUnits} onChange={e=>change({totalUnits:e.target.value})}/></label><label className="share-field"><span className="field-label">Unit label</span><Input value={edit.unitLabel} onChange={e=>change({unitLabel:e.target.value})}/></label></div>}
      <p className="muted">{edit.mode==="quantity"?"Set the number of pieces or servings to share. Receipt quantity does not set this automatically.":"Use relative whole-number weights. 2:1 means twice the share."}</p>
      <div className="share-inputs">{people.map(p=><label key={p.id} className="share-field"><span className="field-label">{p.name}</span><Input aria-label={`${edit.mode==="quantity"?"Units":"Weight"} for ${p.name}`} inputMode="numeric" value={edit.entries.find(e=>e.personId===p.id)?.value??"0"} onChange={e=>change({entries:people.map(person=>({personId:person.id,value:person.id===p.id?e.target.value:edit.entries.find(entry=>entry.personId===person.id)?.value??"0"}))})}/></label>)}</div>
      {message&&<p className="field-error" role="status">{message}</p>}
      {pending&&<p className="muted">Apply the pending shares before viewing the result.</p>}
      <Button variant="outline" disabled={!allocation || !pending} onClick={()=>allocation&&s.applyAllocation(item.id,allocation)}>Apply shares</Button>
      <p className="fine-print">Switching to Equal resets this item&apos;s custom shares.</p>
    </>}
    {!!preview.length&&<ul className="item-share-preview" aria-label={`Shares for ${item.name}`}>{preview.map(part=><li key={part.personId}>{people.find(p=>p.id===part.personId)?.name}: {part.units}/{part.weightSum}{edit.mode==="quantity"?` ${edit.unitLabel||"pieces"}`:""} · {formatMoney(part.cents)}</li>)}</ul>}
  </div>;
}
