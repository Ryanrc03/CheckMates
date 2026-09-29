/* eslint-disable @next/next/no-img-element -- local blob preview must stay in the browser */
import { useEffect, useState, type FormEvent } from "react";
import { Plus, Trash2, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useBillStore } from "@/store/useBillStore";
import { CURRENCIES, DEFAULT_CURRENCY, isCurrency, lineTotal, moneyInput, parseMoney, parsePercent, parseQuantity, percentOf, formatMoney } from "@/lib/money";
import { reconcileReceipt } from "@/lib/ocr/reconcile";
import { PhotoInput } from "../home/home-step";
import type { Bill } from "@/types/bill";
import type { ExtraMode } from "@/types/receipt";

const TIP_PRESETS = ["10", "15", "18", "20"];
const unitInput = (priceCents: number, quantity = 1) => moneyInput(priceCents / quantity);
/** Cents for an amount, or for a rate of the items subtotal; 0 while the text is still invalid. */
function extraCents(mode: ExtraMode, value: string, subtotal: number) {
  if (mode === "amount") return parseMoney(value) ?? 0;
  const rate = parsePercent(value);
  return rate === null ? 0 : percentOf(subtotal, rate);
}

function ModeToggle({ label, mode, symbol, onChange }: { label: string; mode: ExtraMode; symbol: string; onChange: (mode: ExtraMode) => void }) {
  return <div className="mode-toggle" role="group" aria-label={`${label} mode`}>
    <button type="button" aria-pressed={mode === "amount"} aria-label={`${label} as amount`} onClick={() => onChange("amount")}>{symbol.trim()}</button>
    <button type="button" aria-pressed={mode === "percent"} aria-label={`${label} as percent`} onClick={() => onChange("percent")}>%</button>
  </div>;
}

export function ReceiptStep({ photoUrl, onAttach, onRotate, onRecognize, busy, stage, onCancel }: { photoUrl: string | null; onAttach: (file: File) => void; onRotate: () => void; onRecognize: () => void; busy: boolean; stage: string; onCancel: () => void }) {
  const s = useBillStore(); const draft = s.receiptDraft; const useDraft = draft && !s.receiptConfirmed;
  const currency = s.bill.currency ?? DEFAULT_CURRENCY; const money = (cents: number) => formatMoney(cents, currency); const symbol = CURRENCIES[currency].symbol;
  const [items, setItems] = useState(() => s.receiptEdit?.items ?? (useDraft ? draft.items.map((i, index) => ({ id: `ocr-${index}`, name: i.name, price: i.priceCents === null ? "" : moneyInput(i.priceCents), qty: "1", personIds: [] as string[] })) : s.bill.items.map(i => ({ id: i.id, name: i.name, price: unitInput(i.priceCents, i.quantity), qty: String(i.quantity ?? 1), personIds: i.personIds }))));
  const [taxMode, setTaxMode] = useState<ExtraMode>(() => s.receiptEdit ? s.receiptEdit.taxMode ?? "amount" : !useDraft && s.taxRate ? "percent" : "amount");
  const [tax, setTax] = useState(() => s.receiptEdit?.tax ?? (useDraft ? draft.taxCents === null ? "" : moneyInput(draft.taxCents) : s.taxRate ?? moneyInput(s.bill.taxCents)));
  const [chargedTip, setChargedTip] = useState(() => s.receiptEdit?.chargedTip ?? (useDraft ? draft.tipCents === null ? "" : moneyInput(draft.tipCents) : moneyInput(s.bill.tipCents - (s.addedTipCents ?? 0))));
  const [addedTipMode, setAddedTipMode] = useState<ExtraMode>(() => s.receiptEdit ? s.receiptEdit.addedTipMode ?? "amount" : !useDraft && s.addedTipRate ? "percent" : "amount");
  const [addedTip, setAddedTip] = useState(() => s.receiptEdit?.addedTip ?? (!useDraft && s.addedTipRate ? s.addedTipRate : moneyInput(s.addedTipCents ?? 0)));
  const [errors, setErrors] = useState<Record<string, string>>({}); const [checked, setChecked] = useState(false); const [note, setNote] = useState(s.receiptEdit?.note ?? s.reviewNote ?? "");
  const saveEdit = s.saveReceiptEdit;
  useEffect(() => { saveEdit({ items, tax, chargedTip, addedTip, note, taxMode, addedTipMode }); }, [items, tax, chargedTip, addedTip, note, taxMode, addedTipMode, saveEdit]);
  const quantityOf = (qty: string | undefined) => parseQuantity(qty ?? "1") ?? 1;
  const candidateItems = items.map(i => { const quantity = quantityOf(i.qty); return { id: i.id, name: i.name.trim(), priceCents: lineTotal(parseMoney(i.price), quantity) ?? 0, ...(quantity > 1 ? { quantity } : {}), personIds: i.personIds }; });
  const subtotal = candidateItems.reduce((sum, i) => sum + i.priceCents, 0);
  const taxCents = extraCents(taxMode, tax, subtotal); const addedTipCents = extraCents(addedTipMode, addedTip, subtotal);
  const candidate: Bill = { people: s.bill.people, items: candidateItems, taxCents, tipCents: (parseMoney(chargedTip) ?? 0) + addedTipCents, currency, ...(s.bill.splitMode ? { splitMode: s.bill.splitMode } : {}) };
  const total = subtotal + candidate.taxCents + candidate.tipCents;
  const reconciliation = draft ? reconcileReceipt(draft, candidate, addedTipCents) : null;
  const warnings = reconciliation?.warnings ?? []; const mismatch = reconciliation?.differenceCents !== null && reconciliation?.differenceCents !== undefined && reconciliation.differenceCents !== 0;
  /** Switching to amount keeps the current cents; switching to percent starts empty rather than guessing a rate. */
  function changeMode(mode: ExtraMode, current: ExtraMode, value: string, setMode: (mode: ExtraMode) => void, setValue: (value: string) => void) {
    if (mode === current) return;
    setMode(mode); setValue(mode === "amount" ? moneyInput(extraCents(current, value, subtotal)) : "");
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const next: Record<string, string> = {};
    items.forEach(i => {
      if (!i.name.trim()) next[`name-${i.id}`] = "Enter an item name.";
      if (parseQuantity(i.qty ?? "1") === null) next[`qty-${i.id}`] = "Enter a whole number from 1 to 99.";
      if (parseMoney(i.price) === null) next[`price-${i.id}`] = "Enter a nonnegative amount with up to two decimals.";
      else if (lineTotal(parseMoney(i.price), quantityOf(i.qty)) === null) next[`price-${i.id}`] = "The line total is too large.";
    });
    for (const [key, value, mode] of [["tax", tax, taxMode], ["charged-tip", chargedTip, "amount"], ["added-tip", addedTip, addedTipMode]] as const) {
      if (mode === "percent" ? parsePercent(value) === null : parseMoney(value) === null) next[key] = mode === "percent" ? "Enter a rate from 0 to 100, up to three decimals." : "Enter an amount, or 0 if none.";
    }
    if (!items.length) next.form = "Add at least one item.";
    if (!Number.isSafeInteger(total)) next.form = "The total is too large. Check the amounts.";
    if (subtotal === 0 && candidate.taxCents + candidate.tipCents > 0) next.form = "Tax and tip require a nonzero item subtotal.";
    if (warnings.length && !checked) next.review = "Review the notes and confirm you checked the receipt.";
    if (mismatch && !note.trim()) next.note = "Explain the difference or correct the amounts.";
    setErrors(next);
    if (Object.keys(next).length) { requestAnimationFrame(() => document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()); return; }
    s.confirmReceipt(candidate, { addedTipCents, reviewNote: note.trim(), taxRate: taxMode === "percent" ? tax.trim() : null, addedTipRate: addedTipMode === "percent" ? addedTip.trim() : null });
  }
  const error = (id: string) => errors[id] ? <p className="field-error" id={`${id}-error`}>{errors[id]}</p> : null;
  return <section><div className="step-heading"><p className="eyebrow">A QUICK DOUBLE-CHECK</p><h1>Check the receipt</h1><p>Enter the price for one and how many were ordered.</p></div>
    <span className="source-badge">{s.source === "demo" ? "Sample bill · editable" : "Your photo · review required"}</span>
    {s.source === "photo" && <div className="photo-review paper">
      {photoUrl ? <><a href={photoUrl} target="_blank" rel="noreferrer" className="photo-link"><img src={photoUrl} alt="Your original receipt — open to zoom"/><span>Open photo to zoom ↗</span></a><div className="row"><Button variant="outline" onClick={onRotate} disabled={busy}><RotateCw size={16}/> Adjust or rotate photo</Button><Button variant="outline" onClick={onRecognize} disabled={busy}>Recognize again</Button></div></> : <p>Your draft is saved. Reattach the photo to view it; this will not replace your edits.</p>}
      <PhotoInput label="Reattach receipt photo" onSelect={onAttach}/>
      {busy && <div role="status"><p>{stage}</p><Button variant="outline" onClick={onCancel}>Cancel recognition</Button></div>}
      {draft && <details><summary>Original recognized text</summary><pre>{draft.rawText || "No text recognized."}</pre></details>}
    </div>}
    <form onSubmit={submit} noValidate>
      <div className="paper receipt-editor"><div className="receipt-heading"><b>THE RECEIPT</b><select className="currency-select" aria-label="Currency" value={currency} onChange={e => { if (isCurrency(e.target.value)) s.setCurrency(e.target.value); }}>{Object.entries(CURRENCIES).map(([code, { symbol, label }]) => <option key={code} value={code} title={label}>{code} {symbol.trim()}</option>)}</select></div>
        {items.map((item, index) => <div key={item.id} className="item-editor">
          <label className="item-name">Item {index + 1}<Input id={`name-${item.id}`} aria-label={`Item ${index + 1} name`} value={item.name} aria-invalid={!!errors[`name-${item.id}`]} aria-describedby={errors[`name-${item.id}`] ? `name-${item.id}-error` : undefined} onChange={e => setItems(items.map(i => i.id === item.id ? { ...i, name: e.target.value } : i))}/>{error(`name-${item.id}`)}</label>
          <label className="item-qty">Qty<Input id={`qty-${item.id}`} aria-label={`Quantity for ${item.name || `item ${index + 1}`}`} inputMode="numeric" value={item.qty ?? "1"} aria-invalid={!!errors[`qty-${item.id}`]} aria-describedby={errors[`qty-${item.id}`] ? `qty-${item.id}-error` : undefined} onChange={e => setItems(items.map(i => i.id === item.id ? { ...i, qty: e.target.value } : i))}/>{error(`qty-${item.id}`)}</label>
          <label className="item-price">{quantityOf(item.qty) > 1 ? "Each" : "Price"}<Input id={`price-${item.id}`} aria-label={`Price for ${item.name || `item ${index + 1}`}`} inputMode="decimal" value={item.price} aria-invalid={!!errors[`price-${item.id}`]} aria-describedby={errors[`price-${item.id}`] ? `price-${item.id}-error` : undefined} onChange={e => setItems(items.map(i => i.id === item.id ? { ...i, price: e.target.value } : i))}/>{error(`price-${item.id}`)}</label>
          <Button type="button" className="remove-item" variant="ghost" aria-label={`Remove ${item.name || `item ${index + 1}`}`} onClick={() => setItems(items.filter(i => i.id !== item.id))}><Trash2 size={17}/></Button>
          {quantityOf(item.qty) > 1 && parseMoney(item.price) !== null && <p className="line-total">{quantityOf(item.qty)} × {money(parseMoney(item.price)!)} = <b>{money(lineTotal(parseMoney(item.price), quantityOf(item.qty)) ?? 0)}</b></p>}
        </div>)}
        <Button type="button" variant="outline" className="add-item" onClick={() => setItems([...items, { id: crypto.randomUUID(), name: "", price: "", qty: "1", personIds: [] }])}><Plus size={17}/> Add item</Button>
        <div className="totals-line"><span>Items subtotal</span><b>{money(subtotal)}</b></div>
        <div className="extras-row"><div><label htmlFor="tax">Tax</label>{taxMode === "percent" && <small id="tax-hint">% of items = {money(taxCents)}</small>}</div><div className="extras-input"><Input id="tax" inputMode="decimal" value={tax} placeholder={taxMode === "percent" ? "8.25" : undefined} aria-invalid={!!errors.tax} aria-describedby={[taxMode === "percent" && "tax-hint", errors.tax && "tax-error"].filter(Boolean).join(" ") || undefined} onChange={e => setTax(e.target.value)}/><ModeToggle label="Tax" mode={taxMode} symbol={symbol} onChange={mode => changeMode(mode, taxMode, tax, setTaxMode, setTax)}/></div>{error("tax")}</div>
        <div className="extras-row"><label htmlFor="charged-tip">Tip already on receipt</label><div className="extras-input"><Input id="charged-tip" inputMode="decimal" value={chargedTip} aria-invalid={!!errors["charged-tip"]} aria-describedby={errors["charged-tip"] ? "charged-tip-error" : undefined} onChange={e => setChargedTip(e.target.value)}/></div>{error("charged-tip")}</div>
        <div className="extras-row"><div><label htmlFor="added-tip">Added tip</label><small id="added-tip-hint">{addedTipMode === "percent" ? `% of items = ${money(addedTipCents)}` : "Only what you want to add now"}</small></div><div className="extras-input"><Input id="added-tip" inputMode="decimal" value={addedTip} aria-invalid={!!errors["added-tip"]} aria-describedby={["added-tip-hint", errors["added-tip"] && "added-tip-error"].filter(Boolean).join(" ")} onChange={e => setAddedTip(e.target.value)}/><ModeToggle label="Tip" mode={addedTipMode} symbol={symbol} onChange={mode => changeMode(mode, addedTipMode, addedTip, setAddedTipMode, setAddedTip)}/></div>{error("added-tip")}</div>
        <div className="tip-presets" role="group" aria-label="Quick tip">{TIP_PRESETS.map(rate => <button type="button" key={rate} aria-pressed={addedTipMode === "percent" && parsePercent(addedTip) === parsePercent(rate)} onClick={() => { setAddedTipMode("percent"); setAddedTip(rate); }}>{rate}%</button>)}</div>
        <div className="totals-line grand-total"><span>Edited total</span><b>{money(total)}</b></div>
        {draft && <div className="printed-totals"><p>Printed subtotal <b>{draft.printedSubtotalCents === null ? "Not identified" : money(draft.printedSubtotalCents)}</b></p><p>Printed total <b>{draft.printedTotalCents === null ? "Not identified" : money(draft.printedTotalCents)}</b></p>{reconciliation?.differenceCents !== null && <p>Difference before added tip <b>{money(reconciliation!.differenceCents!)}</b></p>}</div>}
      </div>
      {!!warnings.length && <div className="notice review-notes"><h2>Before we split</h2><ul>{warnings.map((w, i) => <li key={i}>{w}</li>)}</ul><label className="checkbox-label"><input type="checkbox" checked={checked} aria-invalid={!!errors.review} onChange={e => setChecked(e.target.checked)}/> I checked the photo, amounts, and all review notes.</label>{error("review")}</div>}
      {mismatch && <label className="note-label">Reason for the difference<Input aria-label="Reason for the difference" value={note} aria-invalid={!!errors.note} onChange={e => setNote(e.target.value)}/>{error("note")}</label>}
      {errors.form && <p className="notice" role="alert">{errors.form}</p>}
      <div className="bottom-actions"><Button type="button" variant="outline" onClick={() => { onCancel(); s.goTo("home"); }}>Back</Button><Button type="submit" disabled={busy}>Add friends <span aria-hidden="true">→</span></Button></div>
    </form>
  </section>;
}
