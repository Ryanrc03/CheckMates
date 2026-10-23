import { formatMoney, parseMoney } from "@/lib/money";
import type { DraftItem, ReceiptDraft } from "@/types/receipt";
import type { LlmReceipt } from "./reply";
export type DishTranslation = { name: string; text: string };
export type CloudReading = { draft: ReceiptDraft; translations: DishTranslation[] };
const cents = (value: string | null) => value === null ? null : parseMoney(value.replace(/,(?=\d{3}(?!\d))/g, ""));
const CJK = /[㐀-鿿]/;
const key = (name: string) => name.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
/** Same unconfirmed draft the local engines produce: unreadable amounts stay null and every discount stays unresolved for the user. */
export function toDraft(reply: LlmReceipt, model: string): CloudReading {
  const warnings = reply.uncertain.map(note => note.trim()).filter(Boolean).map(note => `Cloud recognition was unsure: ${note}`);
  const slots: (DraftItem | null)[] = reply.items.map(item => {
    const name = item.name.trim(); if (!name) return null;
    const priceCents = cents(item.lineTotal); if (item.lineTotal !== null && priceCents === null) warnings.push(`Could not read the amount "${item.lineTotal}" for ${name}. Enter it from the photo.`);
    const sourceLines = item.printedText.split("\n").map(l => l.trim()).filter(Boolean);
    return { name, priceCents, sourceLine: sourceLines.join(" / ") || name, details: { quantity: item.quantity, unitPriceCents: cents(item.unitPrice), printedPriceCents: priceCents, sourceLines: sourceLines.length ? sourceLines : [name], modifiers: item.modifiers.map(m => m.trim()).filter(Boolean).map(text => ({ text, sourceLine: text })), discounts: [], reviewCodes: [] } };
  });
  for (const field of ["subtotal", "tax", "tip", "total"] as const) if (reply[field] !== null && cents(reply[field]) === null) warnings.push(`Could not read the printed ${field} "${reply[field]}". Enter it from the photo.`);
  const unassignedDiscounts: string[] = [];
  for (const d of reply.discounts) {
    const amount = cents(d.amount?.replace(/^-/, "") ?? null); const target = d.itemIndex === null ? null : slots[d.itemIndex] ?? null;
    if (amount === null || !target?.details) { unassignedDiscounts.push(d.printedText); continue; }
    target.details.discounts.push({ discountCents: amount, inclusion: "unresolved", sourceLine: d.printedText }); if (!target.details.reviewCodes.includes("discount")) target.details.reviewCodes.push("discount");
  }
  const rawText = [...reply.items.map(i => `${i.printedText.replace(/\n/g, " / ")}  ${i.lineTotal ?? "?"}`), ...reply.discounts.map(d => `${d.printedText}  -${d.amount?.replace(/^-/, "") ?? "?"}`), ...(["subtotal", "tax", "tip", "total"] as const).filter(k => reply[k] !== null).map(k => `${k}  ${reply[k]}`), `(read by ${model})`].join("\n");
  const draft: ReceiptDraft = { items: slots.filter((i): i is DraftItem => i !== null), rawText, taxCents: cents(reply.tax), tipCents: reply.tip === null ? 0 : cents(reply.tip), printedSubtotalCents: cents(reply.subtotal), printedTotalCents: cents(reply.total), warnings, ...(unassignedDiscounts.length ? { unassignedDiscounts } : {}) };
  const translations = reply.items.filter(i => i.name.trim() && CJK.test(i.nameZh) && i.nameZh.trim().length <= 60).map(i => ({ name: i.name.trim(), text: i.nameZh.trim() }));
  return { draft, translations };
}
/** Why a reading cannot be trusted yet, phrased for the recheck request; null when it balances or nothing printed can check it. */
export function readingProblem(draft: ReceiptDraft): string | null {
  if (!draft.items.length) return "It lists no items.";
  const unread = draft.items.filter(i => i.priceCents === null).map(i => i.name); if (unread.length) return `The amounts for ${unread.join(", ")} were unreadable.`;
  if (draft.unassignedDiscounts?.length || draft.items.some(i => i.details?.discounts.length)) return null; // a discount may or may not be inside the subtotal, so the sum proves nothing
  const sum = draft.items.reduce((total, i) => total + (i.priceCents ?? 0), 0);
  if (draft.printedSubtotalCents !== null) return sum === draft.printedSubtotalCents ? null : `Its item amounts add up to ${formatMoney(sum)}, but the printed subtotal is ${formatMoney(draft.printedSubtotalCents)}.`;
  if (draft.tipCents === null) return "The printed tip was unreadable.";
  if (draft.printedTotalCents !== null && draft.taxCents !== null) { const expected = sum + draft.taxCents + (draft.tipCents ?? 0); return expected === draft.printedTotalCents ? null : `Its item amounts plus tax and tip add up to ${formatMoney(expected)}, but the printed total is ${formatMoney(draft.printedTotalCents)}.`; }
  return null;
}
/** Neither reading balances: keep the recheck, blank amounts the two disagree on, and list what only one of them saw. */
export function mergeReadings(first: CloudReading, second: CloudReading): CloudReading {
  if (readingProblem(second.draft) === null) return second;
  if (!second.draft.items.length) { const kept = structuredClone(first.draft); kept.warnings.push("The double-check found no items; showing the first reading. Compare every line with the photo."); return { draft: kept, translations: first.translations }; }
  const draft = structuredClone(second.draft); const used = new Set<number>();
  for (const item of draft.items) {
    const index = first.draft.items.findIndex((other, k) => !used.has(k) && key(other.name) === key(item.name));
    if (index < 0) { draft.warnings.push(`Only the second reading found ${item.name}. Check it against the photo.`); continue; }
    used.add(index); const other = first.draft.items[index]; const mine = item.priceCents;
    if (mine === null && other.priceCents !== null) { item.priceCents = other.priceCents; if (item.details) item.details.printedPriceCents = other.priceCents; draft.warnings.push(`Only one reading could read the amount for ${item.name}. Check it against the photo.`); }
    else if (mine !== null && other.priceCents !== null && mine !== other.priceCents) { item.priceCents = null; if (item.details) { item.details.printedPriceCents = null; item.details.reviewCodes.push("ocr-price"); } draft.warnings.push(`Two readings disagree on the amount for ${item.name} (${formatMoney(other.priceCents)} or ${formatMoney(mine)}). Enter the printed amount.`); }
  }
  first.draft.items.forEach((other, k) => { if (!used.has(k)) draft.warnings.push(`The first reading also found ${other.name} (${other.priceCents === null ? "amount unreadable" : formatMoney(other.priceCents)}). Add it if it is on the receipt.`); });
  const names = new Set(second.translations.map(t => key(t.name)));
  return { draft, translations: [...second.translations, ...first.translations.filter(t => !names.has(key(t.name)))] };
}
