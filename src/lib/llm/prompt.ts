const money = { type: ["string", "null"], description: "Amount exactly as printed: digits and one dot, no currency sign, e.g. \"12.90\". null when not printed or any digit is unreadable." };
export const RECEIPT_SCHEMA = {
  type: "object", additionalProperties: false, required: ["items", "discounts", "subtotal", "tax", "tip", "total", "uncertain"],
  properties: {
    items: { type: "array", items: { type: "object", additionalProperties: false, required: ["printedText", "name", "nameZh", "quantity", "unitPrice", "lineTotal", "modifiers"],
      properties: { printedText: { type: "string" }, name: { type: "string" }, nameZh: { type: "string" }, quantity: { type: ["integer", "null"] }, unitPrice: money, lineTotal: money, modifiers: { type: "array", items: { type: "string" } } } } },
    discounts: { type: "array", items: { type: "object", additionalProperties: false, required: ["printedText", "amount", "itemIndex"],
      properties: { printedText: { type: "string" }, amount: money, itemIndex: { type: ["integer", "null"] } } } },
    subtotal: money, tax: money, tip: money, total: money,
    uncertain: { type: "array", items: { type: "string" } },
  },
};
/** Measured on the Line Thai Cafe photo (2026-10-22): without the protein rule Qwen translated "Pad Kra Pow" + "Chicken" as 打抛猪肉饭. */
export const RECEIPT_PROMPT = `You transcribe one restaurant receipt photo into JSON. Completeness matters most: list EVERY purchased dish or drink line, top to bottom, and skip none.
- printedText: the item's printed lines, joined with "\\n".
- name: the item name exactly as printed in English, including portion notes such as "(12)", without quantity markers such as "x 2" or "2 @".
- nameZh: the Simplified Chinese menu name for this item. If a modifier names the protein (Chicken, Beef, Shrimp, Tofu...), use that protein, and write the Chinese for that protein only: "Pad Kra Pow" with modifier "Chicken" is 打抛饭 (鸡肉), never 猪肉 (pork). Never mention a meat, seafood, ingredient or size that appears in neither name nor modifiers, even if the dish is usually made that way. Keep portion notes such as (12).
- lineTotal: the amount printed on that item's row. Never compute or multiply it. quantity and unitPrice only when printed.
- modifiers: option lines under the item, e.g. "Chicken", "No Onion". "(12.90 each)" lines are unit prices, not modifiers. Neither is a separate item.
- discounts: every printed discount, coupon or comp line, amount without a minus sign; itemIndex is the 0-based index in items of the item it follows, or null for a whole-bill discount.
- Not items: merchant details, dates, ticket or card numbers, payment and change lines, subtotal, tax, tip, total.
- subtotal, tax, total: only when printed. tip: only a gratuity or service charge actually charged, never a suggested-tip table.
- If any digit of an amount is unreadable, use null and describe it in uncertain. Never guess.`;
export const FIRST_REQUEST = "Transcribe this receipt.";
export function recheckMessage(previous: string, problem: string): string {
  return `A first transcription of this receipt is below. ${problem}\nRead the photo again line by line, find any missing or misread lines, and return the complete corrected transcription in the same JSON format.\n\n${previous}`;
}
