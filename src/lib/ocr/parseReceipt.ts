import type { ReceiptDraft } from "@/types/receipt";
import { parseMoney } from "../money";

/** Conservative line parser: totals and suggestions are never ordinary dishes. */
export function parseReceiptText(text: string): ReceiptDraft {
  const draft: ReceiptDraft = { rawText: text, items: [], taxCents: null, tipCents: 0, printedSubtotalCents: null, printedTotalCents: null, warnings: [] };
  const warn = (message: string) => { if (!draft.warnings.includes(message)) draft.warnings.push(message); };
  let inItems = false; let totalsSeen = false; let suggestions = false;
  let pending: "printedSubtotalCents" | "printedTotalCents" | "taxCents" | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim(); if (!line) continue;
    if (/suggest|recommended|tip guide|gratuity guide/i.test(line)) { suggestions = true; continue; }
    if (/^\s*\d{1,2}\s*%/.test(line) || (suggestions && /%/.test(line))) continue;
    const explicit = [...line.matchAll(/\$\s*(\d+(?:,\d{3})*\.\d{2})(?!\d)/g)].at(-1);
    const match = explicit ?? line.match(/\s*(\d+(?:,\d{3})*\.\d{2})\s*[$]?(?:\s*[A-Z])?$/);
    const amount = match ? parseMoney(match[1].replaceAll(",", "")) : null;
    const label = match ? line.slice(0, match.index).trim().replace(/\s+\$$/, "") : line;
    if (pending && amount !== null && !/[a-z]/i.test(label)) { draft[pending] = amount; pending = null; continue; }
    pending = null;
    if (explicit && line.slice(explicit.index! + explicit[0].length).trim()) warn(`Extra text after amount: check ${line}`);
    if (/\b(sub\s*total)\b/i.test(label)) {
      if (draft.printedSubtotalCents !== null) warn("Multiple subtotals: confirm the printed subtotal.");
      draft.printedSubtotalCents = amount; if (amount === null) pending = "printedSubtotalCents"; totalsSeen = true; continue;
    }
    if (/\b(tax|vat)\b/i.test(label)) {
      if (draft.taxCents !== null) warn("Multiple tax lines: confirm the total tax.");
      draft.taxCents = amount === null ? null : (draft.taxCents ?? 0) + amount; if (amount === null) pending = "taxCents"; totalsSeen = true; continue;
    }
    if (/\b(grand\s*total|total|amount due|balance due)\b/i.test(label)) {
      if (draft.printedTotalCents !== null) warn("Multiple total lines: confirm which total was charged.");
      draft.printedTotalCents = amount; if (amount === null) pending = "printedTotalCents"; totalsSeen = true; continue;
    }
    if (suggestions) continue;
    if (/discount|coupon|\bservice\b|\bsvc\b|surcharge/i.test(label)) { warn(`Review unsupported discount or service charge: ${line}`); continue; }
    if (/\b(tip|gratuity)\b/i.test(label)) {
      if (suggestions || /%/.test(line)) continue;
      if (draft.tipCents) warn("Multiple gratuity lines: confirm the charged tip.");
      draft.tipCents = amount; continue;
    }
    if (/\beach\b|\bunit price\b/i.test(line)) { warn("Check quantity and unit-price lines against each item’s line total."); continue; }
    if (/^(chicken|beef|pork|tofu|shrimp|no onion|no onions|mild|medium|spicy|for here|take\s*out)\s*$/i.test(line)) continue;
    if (amount === null && /^(chicken|no onions?)\b/i.test(line)) { if (line.trim().toLowerCase() !== "chicken" && !/^no onions?$/i.test(line)) warn(`Check item modifier: ${line}`); continue; }
    if (/\b(visa|mastercard|amex|discover|card|credit|debit|cash|change|tender|payment|auth|aid|ticket|receipt|server|table|order|tel|phone|verified)\b/i.test(label) || /\d{2,4}[/-]\d{1,2}[/-]\d{1,4}|\d{3}[-.) ]\s*\d{3}[-. ]\d{4}|\*{2,}/.test(line)) continue;
    if (/thank|www\.|https?:|@|welcome|\b(street|avenue|ave|road|blvd|zip)\b/i.test(line)) continue;
    if (amount === null && /\b(cafe|restaurant|diner|receipt|menu)\b/i.test(line)) continue;
    if (totalsSeen) continue;
    if (amount !== null && /[a-z]/i.test(label)) {
      if (/[-−]\s*\$?\s*\d/.test(line)) { warn(`Negative amount needs manual review: ${line}`); continue; }
      if (/[×x]\s*\d|\d\s*[×x]|^\d+\s+\S/i.test(label)) warn(`Check quantity: confirm the line total for ${label}.`);
      draft.items.push({ name: label, priceCents: amount, sourceLine: raw }); inItems = true;
    } else if ((inItems || /[a-z].*\s+\$?\d+(?:[.,]\d*)?$/i.test(line) || /^[A-Za-z][A-Za-z '&()-]{2,60}$/.test(line)) && /[a-z]/i.test(line) && !/^[-=_*\s]+$/.test(line)) {
      draft.items.push({ name: line, priceCents: null, sourceLine: raw }); warn(`Missing or unclear price: ${line}`);
    }
  }
  if (draft.taxCents === null) warn("Tax was not identified. Enter the tax or explicitly enter 0.");
  if (!draft.items.length) warn("No usable items found. Add the receipt items manually or try a clearer photo.");
  return draft;
}
