/* eslint-disable @next/next/no-img-element -- local blob preview must stay in the browser */
import { useEffect, useState, type FormEvent } from "react";
import { Plus, Trash2, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useBillStore } from "@/store/useBillStore";
import { moneyInput, parseMoney, formatMoney } from "@/lib/money";
import { reconcileReceipt } from "@/lib/ocr/reconcile";
import { PhotoInput } from "../home/home-step";
import type { ReceiptEdit } from "@/types/receipt";
import type { Bill } from "@/types/bill";
import { ReceiptLineDetails } from "./receipt-line-details";

export function ReceiptStep({ photoUrl, onAttach, onRotate, onRecognize, busy, stage, onCancel }: { photoUrl: string | null; onAttach: (file: File) => void; onRotate: () => void; onRecognize: (enhanced?:boolean) => void; busy: boolean; stage: string; onCancel: () => void }) {
  const s = useBillStore(); const draft = s.receiptDraft; const useDraft = draft && !s.receiptConfirmed;
  const [items, setItems] = useState<ReceiptEdit["items"]>(() => s.receiptEdit?.items ?? (useDraft ? draft.items.map((i, index) => ({ id: `ocr-${index}`, name: i.name, price: i.priceCents === null ? "" : moneyInput(i.priceCents), allocation: { mode: "equal" as const, personIds: [] }, receiptDetails:i.details?structuredClone(i.details):undefined })) : s.bill.items.map(i => ({ ...i, price: moneyInput(i.priceCents) }))));
  const [tax, setTax] = useState(() => s.receiptEdit?.tax ?? (useDraft ? draft.taxCents === null ? "" : moneyInput(draft.taxCents) : moneyInput(s.bill.taxCents)));
  const [chargedTip, setChargedTip] = useState(() => s.receiptEdit?.chargedTip ?? (useDraft ? draft.tipCents === null ? "" : moneyInput(draft.tipCents) : moneyInput(s.bill.tipCents - (s.addedTipCents ?? 0))));
  const [addedTip, setAddedTip] = useState(() => s.receiptEdit?.addedTip ?? moneyInput(s.addedTipCents ?? 0));
  const [errors, setErrors] = useState<Record<string, string>>({}); const [checked, setChecked] = useState(false); const [note, setNote] = useState(s.receiptEdit?.note ?? s.reviewNote ?? "");
  const saveEdit = s.saveReceiptEdit;
  useEffect(() => { saveEdit({ items, tax, chargedTip, addedTip, note }); }, [items, tax, chargedTip, addedTip, note, saveEdit]);
  const candidate: Bill = { people: s.bill.people, items: items.map(i => ({ id: i.id, name: i.name.trim(), priceCents: parseMoney(i.price) ?? 0, allocation: i.allocation, receiptDetails: i.receiptDetails })), taxCents: parseMoney(tax) ?? 0, tipCents: (parseMoney(chargedTip) ?? 0) + (parseMoney(addedTip) ?? 0) };
  const subtotal = candidate.items.reduce((sum, i) => sum + i.priceCents, 0); const total = subtotal + candidate.taxCents + candidate.tipCents;
  const reconciliation = draft ? reconcileReceipt(draft, candidate, parseMoney(addedTip) ?? 0) : null;
  const warnings = reconciliation?.warnings ?? []; const mismatch = reconciliation?.differenceCents !== null && reconciliation?.differenceCents !== undefined && reconciliation.differenceCents !== 0;
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const next: Record<string, string> = {};
    items.forEach(i => { if (!i.name.trim()) next[`name-${i.id}`] = "Enter an item name."; if (parseMoney(i.price) === null) next[`price-${i.id}`] = "Enter a nonnegative USD amount with up to two decimals."; if(i.receiptDetails?.discounts.some(d=>d.inclusion==="unresolved"))next[`price-${i.id}`]=`Resolve the discount for ${i.name} before continuing.`; });
    for (const [key, value] of [["tax", tax], ["charged-tip", chargedTip], ["added-tip", addedTip]]) if (parseMoney(value) === null) next[key] = "Enter an amount, or 0 if none.";
    if (!items.length) next.form = "Add at least one item.";
    if (!Number.isSafeInteger(total)) next.form = "The total is too large. Check the amounts.";
    if (subtotal === 0 && candidate.taxCents + candidate.tipCents > 0) next.form = "Tax and tip require a nonzero item subtotal.";
    if (warnings.length && !checked) next.review = "Review the notes and confirm you checked the receipt.";
    if (mismatch && !note.trim()) next.note = "Explain the difference or correct the amounts.";
    setErrors(next);
    if (Object.keys(next).length) { requestAnimationFrame(() => document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()); return; }
    s.confirmReceipt(candidate, { addedTipCents: parseMoney(addedTip)!, reviewNote: note.trim() });
  }
  const error = (id: string) => errors[id] ? <p className="field-error" id={`${id}-error`}>{errors[id]}</p> : null;
  function chooseDiscount(id:string,choice:"included"|"subtract"){
    const item=items.find(i=>i.id===id);if(!item?.receiptDetails)return;
    const base=item.receiptDetails.printedPriceCents??parseMoney(item.price);
    if(base===null)return;
    const discount=item.receiptDetails.discounts.reduce((s,d)=>s+BigInt(d.discountCents),0n);
    const net=BigInt(base)-(choice==="subtract"?discount:0n);
    if(net<0n){setErrors({...errors,[`price-${id}`]:"Listed discounts exceed the printed amount. Check the receipt."});return;}
    const receiptDetails=structuredClone(item.receiptDetails);receiptDetails.printedPriceCents=base;receiptDetails.discounts.forEach(d=>{d.inclusion=choice;});receiptDetails.reviewCodes=receiptDetails.reviewCodes.filter(code=>code!=="discount");
    setItems(items.map(i=>i.id===id?{...i,price:moneyInput(Number(net)),receiptDetails}:i));
    setErrors({...errors,[`price-${id}`]:""});
  }
  return <section><div className="step-heading"><p className="eyebrow">A QUICK DOUBLE-CHECK</p><h1>Check the receipt</h1><p>Make sure each price is the whole line total after discounts.</p></div>
    <span className="source-badge">{s.source === "demo" ? "Sample bill · editable" : "Your photo · review required"}</span>
    {s.source === "photo" && <div className="photo-review paper">
      {photoUrl ? <><a href={photoUrl} target="_blank" rel="noreferrer" className="photo-link"><img src={photoUrl} alt="Your original receipt — open to zoom"/><span>Open photo to zoom ↗</span></a><div className="row"><Button variant="outline" onClick={onRotate} disabled={busy}><RotateCw size={16}/> Adjust or rotate photo</Button><Button variant="outline" onClick={()=>onRecognize()} disabled={busy}>Recognize again</Button><Button variant="outline" onClick={()=>onRecognize(true)} disabled={busy}>Enhanced scan</Button></div></> : <p>Your draft is saved. Reattach the photo to view it; this will not replace your edits.</p>}
      <PhotoInput label="Reattach receipt photo" onSelect={onAttach}/>
      {busy && <div role="status"><p>{stage}</p><Button variant="outline" onClick={onCancel}>Cancel recognition</Button></div>}
      {draft && <details><summary>Original recognized text</summary><pre>{draft.rawText || "No text recognized."}</pre></details>}
      {draft?.alternateRawText&&<details><summary>Alternative recognized text</summary><pre>{draft.alternateRawText}</pre></details>}
    </div>}
    <form onSubmit={submit} noValidate>
      <div className="paper receipt-editor"><div className="receipt-heading"><b>THE RECEIPT</b><span>USD</span></div>
        {items.map((item, index) => <div key={item.id} className="item-editor">
          <label className="item-name">Item {index + 1}<Input id={`name-${item.id}`} aria-label={`Item ${index + 1} name`} value={item.name} aria-invalid={!!errors[`name-${item.id}`]} aria-describedby={errors[`name-${item.id}`] ? `name-${item.id}-error` : undefined} onChange={e => setItems(items.map(i => i.id === item.id ? { ...i, name: e.target.value } : i))}/>{error(`name-${item.id}`)}</label>
          <label className="item-price">Price<Input id={`price-${item.id}`} aria-label={`Price for ${item.name || `item ${index + 1}`}`} inputMode="decimal" value={item.price} aria-invalid={!!errors[`price-${item.id}`]} aria-describedby={errors[`price-${item.id}`] ? `price-${item.id}-error` : undefined} onChange={e => setItems(items.map(i => i.id === item.id ? { ...i, price: e.target.value } : i))}/>{error(`price-${item.id}`)}</label>
          <Button type="button" className="remove-item" variant="ghost" aria-label={`Remove ${item.name || `item ${index + 1}`}`} onClick={() => setItems(items.filter(i => i.id !== item.id))}><Trash2 size={17}/></Button>
          {item.receiptDetails&&<ReceiptLineDetails name={item.name} details={item.receiptDetails} onDiscountChoice={choice=>chooseDiscount(item.id,choice)}/>}
        </div>)}
        <Button type="button" variant="outline" className="add-item" onClick={() => setItems([...items, { id: crypto.randomUUID(), name: "", price: "", allocation: {mode:"equal",personIds:[]} }])}><Plus size={17}/> Add item</Button>
        <div className="totals-line"><span>Items subtotal</span><b>{formatMoney(subtotal)}</b></div>
        {([["tax", "Tax", tax, setTax], ["charged-tip", "Tip already on receipt", chargedTip, setChargedTip], ["added-tip", "Added tip", addedTip, setAddedTip]] as const).map(([id, label, value, setter]) => <div key={id} className="extras-row"><label htmlFor={id}>{label}{id === "added-tip" && <small>Only what you want to add now</small>}</label><div><Input id={id} inputMode="decimal" value={value} aria-invalid={!!errors[id]} aria-describedby={errors[id] ? `${id}-error` : undefined} onChange={e => setter(e.target.value)}/>{error(id)}</div></div>)}
        <div className="totals-line grand-total"><span>Edited total</span><b>{formatMoney(total)}</b></div>
        {draft && <div className="printed-totals"><p>Printed subtotal <b>{draft.printedSubtotalCents === null ? "Not identified" : formatMoney(draft.printedSubtotalCents)}</b></p><p>Printed total <b>{draft.printedTotalCents === null ? "Not identified" : formatMoney(draft.printedTotalCents)}</b></p>{reconciliation?.differenceCents !== null && <p>Difference before added tip <b>{formatMoney(reconciliation!.differenceCents!)}</b></p>}</div>}
      </div>
      {!!warnings.length && <div className="notice review-notes"><h2>Before we split</h2><ul>{warnings.map((w, i) => <li key={i}>{w}</li>)}</ul><label className="checkbox-label"><input type="checkbox" checked={checked} aria-invalid={!!errors.review} onChange={e => setChecked(e.target.checked)}/> I checked the photo, amounts, and all review notes.</label>{error("review")}</div>}
      {mismatch && <label className="note-label">Reason for the difference<Input aria-label="Reason for the difference" value={note} aria-invalid={!!errors.note} onChange={e => setNote(e.target.value)}/>{error("note")}</label>}
      {errors.form && <p className="notice" role="alert">{errors.form}</p>}
      <div className="bottom-actions"><Button type="button" variant="outline" onClick={() => { onCancel(); s.goTo("home"); }}>Back</Button><Button type="submit" disabled={busy}>Add friends <span aria-hidden="true">→</span></Button></div>
    </form>
  </section>;
}
