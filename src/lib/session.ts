import type { Bill, WizardStep, ItemAllocation } from "@/types/bill";
import type { BillSession, ReceiptDraft, ReceiptEdit, AllocationEdit } from "@/types/receipt";
import type { ReceiptDetails } from "@/types/receipt-details";
import { splitBill } from "./split";
export const validCents = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const nullableCents = (v: unknown) => v === null || validCents(v);
const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every(s => typeof s === "string");
const unique = (values: string[]) => new Set(values).size === values.length;
export function isAllocation(v: unknown, ids?: string[]): v is ItemAllocation {
  if (!record(v)) return false;
  const known = (id: string) => id.length > 0 && (!ids || ids.includes(id));
  if (v.mode === "equal") return strings(v.personIds) && unique(v.personIds) && v.personIds.every(known);
  if (v.mode !== "ratio" && v.mode !== "quantity") return false;
  if (!Array.isArray(v.shares) || !v.shares.every(s => record(s) && typeof s.personId === "string" && known(s.personId) && validCents(s.units) && s.units > 0)) return false;
  if (!unique(v.shares.map(s => s.personId))) return false;
  return v.mode === "ratio" || (validCents(v.totalUnits) && v.totalUnits > 0 && typeof v.unitLabel === "string");
}
export function isReceiptDetails(v: unknown): v is ReceiptDetails {
  if (!record(v) || !strings(v.sourceLines) || !strings(v.reviewCodes) || !Array.isArray(v.modifiers) || !Array.isArray(v.discounts)) return false;
  if (!v.modifiers.every(m => record(m) && typeof m.text === "string" && typeof m.sourceLine === "string")) return false;
  if (!v.discounts.every(d => record(d) && validCents(d.discountCents) && ["included","subtract","unresolved"].includes(String(d.inclusion)) && typeof d.sourceLine === "string")) return false;
  if (v.quantity !== undefined && v.quantity !== null && (!validCents(v.quantity) || v.quantity === 0)) return false;
  if (v.unitPriceCents !== undefined && !nullableCents(v.unitPriceCents)) return false;
  if (v.taxCode !== undefined && v.taxCode !== null && typeof v.taxCode !== "string") return false;
  if (v.parentSourceId !== undefined && typeof v.parentSourceId !== "string") return false;
  if (v.bbox !== undefined && (!record(v.bbox) || !["x0","y0","x1","y1"].every(k=>record(v.bbox) && typeof v.bbox[k]==="number" && Number.isFinite(v.bbox[k])))) return false;
  return true;
}
const details = (v: unknown) => v === undefined || isReceiptDetails(v);
export function isBill(input: unknown): input is Bill {
  if (!record(input) || !Array.isArray(input.items) || !Array.isArray(input.people) || !validCents(input.taxCents) || !validCents(input.tipCents)) return false;
  if (!input.people.every(p => record(p) && typeof p.id === "string" && p.id.length > 0 && typeof p.name === "string" && p.name.trim())) return false;
  const ids = input.people.map(p=>p.id);
  if (!unique(ids) || !input.items.every(i=>record(i) && typeof i.id === "string" && i.id.length>0 && typeof i.name === "string" && validCents(i.priceCents) && isAllocation(i.allocation,ids) && details(i.receiptDetails))) return false;
  return unique(input.items.map(i=>i.id)) && validCents(input.items.reduce((s,i)=>s+i.priceCents,0)+input.taxCents+input.tipCents);
}
export function receiptReady(bill: Bill): boolean {
  return isBill(bill) && bill.items.length>0 && bill.items.every(i=>!!i.name.trim() && !i.receiptDetails?.discounts.some(d=>d.inclusion === "unresolved")) && (bill.items.some(i=>i.priceCents>0) || bill.taxCents+bill.tipCents===0);
}
export function isDraft(v: unknown): v is ReceiptDraft {
  return record(v) && typeof v.rawText==="string" && Array.isArray(v.items) && v.items.every(i=>record(i) && typeof i.name==="string" && nullableCents(i.priceCents) && typeof i.sourceLine==="string" && details(i.details)) && [v.taxCents,v.tipCents,v.printedSubtotalCents,v.printedTotalCents].every(nullableCents) && strings(v.warnings);
}
export function availableStep(s: BillSession, target: WizardStep): WizardStep {
  if (target==="home") return "home";
  if (!s.source) return "home";
  if (target==="receipt") return "receipt";
  if (!receiptReady(s.bill) || (s.source==="photo" && !s.receiptConfirmed)) return "receipt";
  if (target==="people") return "people";
  if (!s.bill.people.length) return "people";
  if (target==="split") return "split";
  if (Object.keys(s.allocationEdits??{}).length) return "split";
  try {splitBill(s.bill);return "result";} catch {return "split";}
}
export function isReceiptEdit(v: unknown): v is ReceiptEdit {
  return record(v) && [v.tax,v.chargedTip,v.addedTip,v.note].every(s=>typeof s==="string") && Array.isArray(v.items) && v.items.every(i=>record(i) && typeof i.id==="string" && typeof i.name==="string" && typeof i.price==="string" && isAllocation(i.allocation) && details(i.receiptDetails)) && unique(v.items.map(i=>i.id));
}
function isAllocationEdits(v: unknown, bill: Bill): v is Record<string, AllocationEdit> {
  return record(v) && Object.entries(v).every(([id,e])=>bill.items.some(i=>i.id===id) && record(e) && ["equal","ratio","quantity"].includes(String(e.mode)) && typeof e.totalUnits==="string" && typeof e.unitLabel==="string" && Array.isArray(e.entries) && e.entries.every(p=>record(p) && typeof p.personId==="string" && bill.people.some(person=>person.id===p.personId) && typeof p.value==="string") && unique(e.entries.map(p=>p.personId)));
}
export function restoreSession(input: unknown): BillSession | null {
  if (!record(input) || !isBill(input.bill) || !["home","receipt","people","split","result"].includes(String(input.step)) || ![null,"photo","demo"].includes(input.source as string|null) || !(input.fileName===null || typeof input.fileName==="string") || !(input.receiptDraft===null || isDraft(input.receiptDraft))) return null;
  if (input.receiptConfirmed!==undefined && typeof input.receiptConfirmed!=="boolean") return null;
  if (input.addedTipCents!==undefined && !validCents(input.addedTipCents)) return null;
  if (input.reviewNote!==undefined && typeof input.reviewNote!=="string") return null;
  if (input.receiptEdit!==undefined && input.receiptEdit!==null && !isReceiptEdit(input.receiptEdit)) return null;
  if (input.allocationEdits!==undefined && !isAllocationEdits(input.allocationEdits,input.bill)) return null;
  const s: BillSession=structuredClone({bill:input.bill,step:input.step as WizardStep,source:input.source as BillSession["source"],fileName:input.fileName as string|null,receiptDraft:input.receiptDraft as ReceiptDraft|null,receiptConfirmed:input.receiptConfirmed===true,addedTipCents:input.addedTipCents as number|undefined,reviewNote:input.reviewNote as string|undefined,receiptEdit:input.receiptEdit as ReceiptEdit|null|undefined,allocationEdits:(input.allocationEdits??{}) as Record<string,AllocationEdit>});
  if ((s.addedTipCents??0)>s.bill.tipCents && s.receiptConfirmed) return null;
  s.step=availableStep(s,s.step);return s;
}
export function migrateSession(input: unknown): BillSession | null {
  if (!record(input)) return null;
  if (input.version===2) return restoreSession(input.state);
  if (input.version!==1 || !record(input.state) || !record(input.state.bill) || !Array.isArray(input.state.bill.items)) return null;
  const s=structuredClone(input.state);
  const convert=(i:unknown)=>{if (!record(i)) return i;const {personIds,...rest}=i;return {...rest,allocation:{mode:"equal",personIds}};};
  if (!record(s.bill)) return null;
  s.bill.items=(s.bill.items as unknown[]).map(convert);
  if (record(s.receiptEdit) && Array.isArray(s.receiptEdit.items)) s.receiptEdit.items=s.receiptEdit.items.map(convert);
  return restoreSession(s);
}
