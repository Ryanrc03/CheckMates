export type LlmItem = { printedText: string; name: string; nameZh: string; quantity: number | null; unitPrice: string | null; lineTotal: string | null; modifiers: string[] };
export type LlmDiscount = { printedText: string; amount: string | null; itemIndex: number | null };
export type LlmReceipt = { items: LlmItem[]; discounts: LlmDiscount[]; subtotal: string | null; tax: string | null; tip: string | null; total: string | null; uncertain: string[] };
export const UNREADABLE_REPLY = "Cloud recognition returned an unreadable answer. Try again, or choose Standard or Precise.";
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown) => typeof v === "string" ? v : "";
const amount = (v: unknown): string | null => typeof v === "string" ? v.trim() || null : typeof v === "number" && Number.isFinite(v) ? String(v) : null;
const count = (v: unknown) => typeof v === "number" && Number.isSafeInteger(v) && v > 0 ? v : null;
const index = (v: unknown) => typeof v === "number" && Number.isSafeInteger(v) && v >= 0 ? v : null;
const texts = (v: unknown) => Array.isArray(v) ? v.filter((s): s is string => typeof s === "string") : [];
/** Structured output makes valid JSON likely, not certain: validate every field before it can reach a draft. */
export function parseLlmReply(content: string): LlmReceipt {
  let value: unknown; try { value = JSON.parse(content.trim().replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "")); } catch { throw new Error(UNREADABLE_REPLY); }
  if (!record(value) || !Array.isArray(value.items) || !value.items.every(record)) throw new Error(UNREADABLE_REPLY);
  const items = value.items.map(i => ({ printedText: text(i.printedText) || text(i.name), name: text(i.name), nameZh: text(i.nameZh), quantity: count(i.quantity), unitPrice: amount(i.unitPrice), lineTotal: amount(i.lineTotal), modifiers: texts(i.modifiers) }));
  const discounts = (Array.isArray(value.discounts) ? value.discounts.filter(record) : []).map(d => ({ printedText: text(d.printedText), amount: amount(d.amount), itemIndex: index(d.itemIndex) }));
  return { items, discounts, subtotal: amount(value.subtotal), tax: amount(value.tax), tip: amount(value.tip), total: amount(value.total), uncertain: texts(value.uncertain) };
}
