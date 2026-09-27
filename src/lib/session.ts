import type { Bill, WizardStep } from "@/types/bill";
import type { BillSession, ReceiptDraft, ReceiptEdit } from "@/types/receipt";
import { splitBill } from "./split";

export const validCents = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const nullableCents = (v: unknown) => v === null || validCents(v);
const unique = (values: string[]) => new Set(values).size === values.length;
export function isBill(input: unknown): input is Bill {
  if (!record(input) || !Array.isArray(input.items) || !Array.isArray(input.people) || !validCents(input.taxCents) || !validCents(input.tipCents)) return false;
  if (!input.people.every(p => record(p) && typeof p.id === "string" && p.id.length > 0 && typeof p.name === "string" && p.name.trim())) return false;
  const ids = input.people.map(p => p.id);
  if (!unique(ids)) return false;
  if (!input.items.every(i => record(i) && typeof i.id === "string" && i.id.length > 0 && typeof i.name === "string" && validCents(i.priceCents) && Array.isArray(i.personIds) && i.personIds.every(id => typeof id === "string" && ids.includes(id)) && unique(i.personIds))) return false;
  return unique(input.items.map(i => i.id)) && validCents(input.items.reduce((s, i) => s + i.priceCents, 0) + input.taxCents + input.tipCents);
}
export function receiptReady(bill: Bill): boolean {
  return isBill(bill) && bill.items.length > 0 && bill.items.every(i => !!i.name.trim()) && (bill.items.some(i => i.priceCents > 0) || bill.taxCents + bill.tipCents === 0);
}
export function isDraft(v: unknown): v is ReceiptDraft {
  return record(v) && typeof v.rawText === "string" && Array.isArray(v.items) && v.items.every(i => record(i) && typeof i.name === "string" && nullableCents(i.priceCents) && typeof i.sourceLine === "string") && [v.taxCents, v.tipCents, v.printedSubtotalCents, v.printedTotalCents].every(nullableCents) && Array.isArray(v.warnings) && v.warnings.every(w => typeof w === "string");
}
export function availableStep(session: BillSession, target: WizardStep): WizardStep {
  if (target === "home") return "home";
  if (!session.source) return "home";
  if (target === "receipt") return "receipt";
  if (!receiptReady(session.bill) || (session.source === "photo" && !session.receiptConfirmed)) return "receipt";
  if (target === "people") return "people";
  if (!session.bill.people.length) return "people";
  if (target === "split") return "split";
  try { splitBill(session.bill); return "result"; } catch { return "split"; }
}
export function restoreSession(input: unknown): BillSession | null {
  if (!record(input) || !isBill(input.bill) || !["home", "receipt", "people", "split", "result"].includes(String(input.step)) || ![null, "photo", "demo"].includes(input.source as string | null) || !(input.fileName === null || typeof input.fileName === "string") || !(input.receiptDraft === null || isDraft(input.receiptDraft))) return null;
  if (input.receiptConfirmed !== undefined && typeof input.receiptConfirmed !== "boolean") return null;
  if (input.addedTipCents !== undefined && !validCents(input.addedTipCents)) return null;
  if (input.reviewNote !== undefined && typeof input.reviewNote !== "string") return null;
  const receiptEdit = input.receiptEdit;
  if (receiptEdit !== undefined && receiptEdit !== null && !isReceiptEdit(receiptEdit)) return null;
  const s: BillSession = structuredClone({ bill: input.bill, step: input.step as WizardStep, source: input.source as BillSession["source"], fileName: input.fileName as string | null, receiptDraft: input.receiptDraft as ReceiptDraft | null, receiptConfirmed: input.receiptConfirmed === true, addedTipCents: input.addedTipCents as number | undefined, reviewNote: input.reviewNote as string | undefined, receiptEdit: receiptEdit as ReceiptEdit | null | undefined });
  if ((s.addedTipCents ?? 0) > s.bill.tipCents && s.receiptConfirmed) return null;
  s.step = availableStep(s, s.step);
  return s;
}
export function isReceiptEdit(v: unknown): v is ReceiptEdit {
  return record(v) && [v.tax, v.chargedTip, v.addedTip, v.note].every(s => typeof s === "string") && Array.isArray(v.items) && v.items.every(i => record(i) && typeof i.id === "string" && typeof i.name === "string" && typeof i.price === "string" && Array.isArray(i.personIds) && i.personIds.every(p => typeof p === "string")) && unique(v.items.map(i => i.id));
}
