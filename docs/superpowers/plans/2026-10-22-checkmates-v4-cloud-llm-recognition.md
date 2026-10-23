# CheckMates v4: Cloud LLM Receipt Recognition + Chinese Dish Names — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a third recognition engine, "Cloud AI (most accurate)". The browser sends the corrected receipt photo directly to Alibaba Cloud Bailian `qwen3.5-plus`. One call returns every dish, its amount, the subtotal/tax/tip/total, and a Chinese name. If the amounts don't reconcile, the engine re-reads the receipt automatically, so dishes are not missed. The app stays pure front end.

**Architecture:** A new `src/lib/llm/` module, independent of the existing Tesseract/PaddleOCR pipeline. Its output is the same `ReceiptDraft`, so the receipt step, persistence and splitting code don't change. Chinese names are written into the existing translation cache with `provider: "llm"`, so the existing `TranslationControls` / `DishLabel` display them directly. The key comes from `NEXT_PUBLIC_DASHSCOPE_*` and is inlined into the browser bundle at build time. When no key is set, the cloud engine is hidden and v3 behavior is unchanged.

**Tech Stack:** Next.js 16 (client components), TypeScript, Zustand, Vitest, Playwright, the DashScope OpenAI-compatible API (`/compatible-mode/v1/chat/completions`, `response_format: json_schema`).

---

## Background and decisions (measured on 2026-10-22)

| Item | Conclusion | Evidence |
|---|---|---|
| Direct browser calls | Possible. The Beijing endpoint answers the preflight with `access-control-allow-origin: *` and allows the `authorization, content-type` headers | Measured with `curl -X OPTIONS` |
| Key region | The user's key only works on **China (Beijing)** `https://dashscope.aliyuncs.com/compatible-mode/v1`. The Singapore endpoint returns `invalid_api_key` | Measured |
| Model | `qwen3.5-plus` (the user's choice). `json_object` / `json_schema` structured output works with `enable_thinking: false` | Measured |
| Accuracy | Redacted real photo `line-thai-cafe-2026-09-05`: **6/6 dishes, 6/6 amounts, and subtotal 72.50 / tax 5.98 / total 78.48 all correct** | 3 probe runs |
| Latency | 2.3 MB PNG: 69 s. **≤1600 px JPEG (260 KB): 11 s**. So the image must be compressed to JPEG before upload | Measured |
| Cost | About 2,200 input + 560 output tokens per receipt. At Beijing list prices that's about $0.0011 (≈ ¥0.008) per receipt | Official price page |
| flash vs plus | `qwen3.5-flash` is slower (15 s), adds a `$` to amounts, and invents ingredients in translation (黑糖**珍珠**奶茶 for Brown Sugar Milk). Not used | Measured |
| Translation hallucination | With "Pad Kra Pow + Chicken", the model translated 打抛**猪肉**饭 (pork). Fixed by a prompt rule: use the protein from the modifiers, and never add an ingredient that appears in neither the name nor the modifiers. After the fix: 打抛饭 (鸡肉) | Measured |

**Key risk (the user accepted it by choosing a key built into the front end):** `NEXT_PUBLIC_DASHSCOPE_API_KEY` is written into the public JS. Anyone who opens the site can read it from DevTools and spend money on your Alibaba Cloud account. The IP allowlist must be `0.0.0.0/0` + `::/0`, because requests come from every user's phone, so it offers no protection. The only effective controls are on the Alibaba Cloud side; see Task 11. The key never enters git (`.env*` is already ignored).

**Recognition policy (consistent with the existing conservative OCR policy in `src/ARCHITECTURE.md`):**
- The model is only asked to **copy** printed amounts. It never computes or multiplies them. If any digit is unclear, the value is `null` and gets a warning.
- Every amount goes through `parseMoney` into integer cents. No floats.
- Discounts are always `inclusion: "unresolved"`; the user decides whether the line amount already includes them.
- "Don't miss dishes": the sum of item amounts must equal the printed subtotal (or subtotal unprinted but sum + tax + tip = total). If it doesn't, or any item amount is unreadable, the engine **automatically re-reads once**, giving the model the first transcription and the specific discrepancy. If the second reading still doesn't reconcile, amounts the two readings disagree on are blanked (`ocr-price`), and items found by only one reading are listed in warnings for the user to check.

## File map

| File | Responsibility |
|---|---|
| Create `src/lib/llm/config.ts` | Reads the `NEXT_PUBLIC_DASHSCOPE_*` config; returns `null` when there is no key |
| Create `src/lib/llm/prompt.ts` | System prompt, JSON Schema, re-read message |
| Create `src/lib/llm/reply.ts` | Hand-validates the model's JSON into `LlmReceipt` |
| Create `src/lib/llm/to-draft.ts` | `LlmReceipt` → `ReceiptDraft` + Chinese names; reconciliation check; merging two readings |
| Create `src/lib/llm/qwen-client.ts` | One HTTP request and the error messages |
| Create `src/lib/llm/upload-image.ts` | Browser-side compression to a JPEG data URL (long edge ≤ 2048) |
| Create `src/lib/llm/recognize.ts` | Orchestration: compress → read → reconcile → optional re-read; cancellation and a 90 s timeout |
| Create `src/lib/llm/*.test.ts` | Unit tests, plus `live-eval.test.ts`, which calls the real API only when `LIVE_LLM=1` |
| Modify `src/lib/ocr/client.ts` | `OcrEngine` gains `"cloud"`; the local factories use `LocalEngine` |
| Modify `src/lib/ocr/engine-preference.ts` | Defaults to cloud when a key is configured |
| Modify `src/components/receipt/photo-adjustment.tsx` | Third engine option and button text |
| Modify `src/components/bill-wizard.tsx` | `recognizePrepared` branches to the cloud engine and seeds the translations |
| Modify `src/lib/translation/{types,service}.ts`, `src/store/useTranslationStore.ts` | `TranslationService.seed()`, `provider: "llm"` |
| Modify `playwright.config.ts`, create `tests/e2e/cloud-ocr.spec.ts` | E2E uses a fake key and intercepted requests, so it never spends real money |
| Create `.env.example`, modify `.gitignore` | Variable template, so others know what to configure |
| Modify `src/ARCHITECTURE.md`, `README.md`; create `docs/validation/2026-10-22-cloud-llm-ocr.md` | Documentation and validation record |

---

### Task 1: Cloud configuration

**Files:**
- Create: `src/lib/llm/config.ts`
- Test: `src/lib/llm/config.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { DEFAULT_BASE_URL, DEFAULT_MODEL, parseCloudConfig } from "./config";
describe("cloud config", () => {
  it("is off without a key and fills the Beijing endpoint and qwen3.5-plus by default", () => {
    expect(parseCloudConfig({})).toBeNull(); expect(parseCloudConfig({ apiKey: "  " })).toBeNull();
    expect(parseCloudConfig({ apiKey: " k " })).toEqual({ apiKey: "k", baseUrl: DEFAULT_BASE_URL, model: DEFAULT_MODEL });
  });
  it("trims a trailing slash, keeps a chosen model and rejects non-https endpoints", () => {
    expect(parseCloudConfig({ apiKey: "k", baseUrl: "https://x.test/v1/", model: "qwen3.7-plus" })).toEqual({ apiKey: "k", baseUrl: "https://x.test/v1", model: "qwen3.7-plus" });
    expect(parseCloudConfig({ apiKey: "k", baseUrl: "http://x.test/v1" })).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx vitest run src/lib/llm/config.test.ts`
Expected: FAIL, `Failed to resolve import "./config"`

- [ ] **Step 3: Implement**

```ts
export type CloudConfig = { apiKey: string; baseUrl: string; model: string };
export const DEFAULT_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1"; // China (Beijing); international keys need https://dashscope-intl.aliyuncs.com/compatible-mode/v1
export const DEFAULT_MODEL = "qwen3.5-plus";
export function parseCloudConfig(raw: { apiKey?: string; baseUrl?: string; model?: string }): CloudConfig | null {
  const apiKey = raw.apiKey?.trim(); if (!apiKey) return null;
  const baseUrl = (raw.baseUrl?.trim() || DEFAULT_BASE_URL).replace(/\/+$/, ""); if (!baseUrl.startsWith("https://")) return null;
  return { apiKey, baseUrl, model: raw.model?.trim() || DEFAULT_MODEL };
}
/** NEXT_PUBLIC_ values are inlined into the public bundle at build time, so they must be read by literal name; without a key the cloud engine is hidden. */
export function cloudConfig(): CloudConfig | null {
  return parseCloudConfig({ apiKey: process.env.NEXT_PUBLIC_DASHSCOPE_API_KEY, baseUrl: process.env.NEXT_PUBLIC_DASHSCOPE_BASE_URL, model: process.env.NEXT_PUBLIC_DASHSCOPE_MODEL });
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npx vitest run src/lib/llm/config.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Add the environment variable template**

Create `.env.example`:

```
# Cloud recognition (Alibaba Cloud Model Studio / DashScope, OpenAI-compatible). Leave the key empty to hide the Cloud AI engine.
# WARNING: NEXT_PUBLIC_ values are inlined into the public JavaScript bundle. Anyone who opens the site can read this key.
NEXT_PUBLIC_DASHSCOPE_API_KEY=
# China (Beijing). International keys use https://dashscope-intl.aliyuncs.com/compatible-mode/v1
NEXT_PUBLIC_DASHSCOPE_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
NEXT_PUBLIC_DASHSCOPE_MODEL=qwen3.5-plus
```

In `.gitignore`, add one line directly below `.env*` (line 40):

```
!.env.example
```

Run: `git check-ignore -v .env.local; git check-ignore .env.example; echo $LASTEXITCODE`
Expected: `.env.local` is still ignored, and `.env.example` gives exit code 1 (not ignored)

- [ ] **Step 6: Commit**

```bash
git add src/lib/llm/config.ts src/lib/llm/config.test.ts .env.example .gitignore
git commit -m "feat(llm): cloud recognition config from NEXT_PUBLIC_DASHSCOPE_*"
```

---

### Task 2: Prompt and schema

**Files:**
- Create: `src/lib/llm/prompt.ts`

This is pure data with no logic. It's exercised by Task 5 (request body) and Task 9 (live eval).

- [ ] **Step 1: Write the file**

```ts
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
- nameZh: the Simplified Chinese menu name for this item. If a modifier names the protein (Chicken, Beef, Shrimp, Tofu...), use that protein. Never mention a meat, seafood, ingredient or size that appears in neither name nor modifiers, even if the dish is usually made that way. Keep portion notes such as (12).
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
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/llm/prompt.ts
git commit -m "feat(llm): receipt prompt, JSON schema and recheck message"
```

---

### Task 3: Validating the model reply

**Files:**
- Create: `src/lib/llm/reply.ts`
- Test: `src/lib/llm/reply.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { parseLlmReply, UNREADABLE_REPLY } from "./reply";
const item = { printedText: "Pad Thai x 2\nChicken", name: "Pad Thai", nameZh: "泰式炒河粉 (鸡肉)", quantity: 2, unitPrice: "12.90", lineTotal: "25.80", modifiers: ["Chicken"] };
describe("parseLlmReply", () => {
  it("accepts a schema reply, number amounts and a fenced block", () => {
    const reply = parseLlmReply("```json\n" + JSON.stringify({ items: [item, { ...item, lineTotal: 4, quantity: null }], discounts: [], subtotal: "29.80", tax: null, tip: null, total: null, uncertain: [] }) + "\n```");
    expect(reply.items[0]).toEqual(item); expect(reply.items[1].lineTotal).toBe("4"); expect(reply.subtotal).toBe("29.80"); expect(reply.discounts).toEqual([]);
  });
  it("drops bad quantities and indices, fills missing lists, and rejects non-JSON or itemless replies", () => {
    const reply = parseLlmReply(JSON.stringify({ items: [{ ...item, quantity: 0, printedText: "", modifiers: "x" }], discounts: [{ printedText: "Coupon", amount: "2.00", itemIndex: -1 }], subtotal: "", tax: "1.00" }));
    expect(reply.items[0]).toMatchObject({ quantity: null, printedText: "Pad Thai", modifiers: [] }); expect(reply.discounts[0].itemIndex).toBeNull();
    expect(reply.subtotal).toBeNull(); expect(reply.tax).toBe("1.00"); expect(reply.tip).toBeNull(); expect(reply.uncertain).toEqual([]);
    expect(() => parseLlmReply("not json")).toThrow(UNREADABLE_REPLY); expect(() => parseLlmReply("{\"total\":\"1.00\"}")).toThrow(UNREADABLE_REPLY); expect(() => parseLlmReply("{\"items\":[1]}")).toThrow(UNREADABLE_REPLY);
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx vitest run src/lib/llm/reply.test.ts`
Expected: FAIL, `Failed to resolve import "./reply"`

- [ ] **Step 3: Implement**

```ts
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
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npx vitest run src/lib/llm/reply.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/llm/reply.ts src/lib/llm/reply.test.ts
git commit -m "feat(llm): validate the Qwen receipt reply"
```

---

### Task 4: Converting to a draft, reconciling, merging two readings

**Files:**
- Create: `src/lib/llm/to-draft.ts`
- Test: `src/lib/llm/to-draft.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { isDraft } from "@/lib/session";
import type { LlmItem, LlmReceipt } from "./reply";
import { mergeReadings, readingProblem, toDraft } from "./to-draft";
const line = (name: string, lineTotal: string | null, extra: Partial<LlmItem> = {}): LlmItem => ({ printedText: name, name, nameZh: "", quantity: null, unitPrice: null, lineTotal, modifiers: [], ...extra });
const receipt = (items: LlmItem[], extra: Partial<LlmReceipt> = {}): LlmReceipt => ({ items, discounts: [], subtotal: null, tax: null, tip: null, total: null, uncertain: [], ...extra });
describe("toDraft", () => {
  it("maps a Line Thai style reply to a valid draft with cents, details and Chinese names", () => {
    const { draft, translations } = toDraft(receipt([line("Pad Thai", "25.80", { printedText: "Pad Thai x 2\nChicken\n($12.90 each)", nameZh: "泰式炒河粉 (鸡肉)", quantity: 2, unitPrice: "12.90", modifiers: ["Chicken"] }), line("Milk Tea", "$4.00", { nameZh: "奶茶" }), line("  ", "1.00")], { subtotal: "29.80", tax: "2.46", total: "32.26" }), "qwen3.5-plus");
    expect(isDraft(draft)).toBe(true);
    expect(draft.items.map(i => [i.name, i.priceCents])).toEqual([["Pad Thai", 2580], ["Milk Tea", 400]]);
    expect(draft.items[0].details).toMatchObject({ quantity: 2, unitPriceCents: 1290, printedPriceCents: 2580, sourceLines: ["Pad Thai x 2", "Chicken", "($12.90 each)"], modifiers: [{ text: "Chicken", sourceLine: "Chicken" }], discounts: [], reviewCodes: [] });
    expect([draft.printedSubtotalCents, draft.taxCents, draft.tipCents, draft.printedTotalCents]).toEqual([2980, 246, 0, 3226]);
    expect(translations).toEqual([{ name: "Pad Thai", text: "泰式炒河粉 (鸡肉)" }, { name: "Milk Tea", text: "奶茶" }]); expect(draft.rawText).toContain("qwen3.5-plus");
  });
  it("keeps unreadable amounts null with a warning and leaves every discount for the user", () => {
    const { draft } = toDraft(receipt([line("Soup", "8.2?"), line("Toast", "6.00")], { discounts: [{ printedText: "Toast coupon", amount: "-1.00", itemIndex: 1 }, { printedText: "Happy hour", amount: "2.00", itemIndex: null }], uncertain: ["soup amount smudged"] }), "m");
    expect(draft.items[0].priceCents).toBeNull(); expect(draft.items[1].details?.discounts).toEqual([{ discountCents: 100, inclusion: "unresolved", sourceLine: "Toast coupon" }]); expect(draft.items[1].details?.reviewCodes).toEqual(["discount"]);
    expect(draft.unassignedDiscounts).toEqual(["Happy hour"]); expect(draft.warnings).toEqual(["Cloud recognition was unsure: soup amount smudged", "Could not read the amount \"8.2?\" for Soup. Enter it from the photo."]);
  });
});
describe("readingProblem", () => {
  const draft = (items: LlmItem[], extra: Partial<LlmReceipt> = {}) => toDraft(receipt(items, extra), "m").draft;
  it("accepts items that add up to the printed subtotal, or to the total with tax and tip", () => {
    expect(readingProblem(draft([line("A", "4.00"), line("B", "12.90")], { subtotal: "16.90" }))).toBeNull();
    expect(readingProblem(draft([line("A", "4.00")], { tax: "0.33", tip: "1.00", total: "5.33" }))).toBeNull();
    expect(readingProblem(draft([line("A", "4.00")]))).toBeNull(); // nothing printed to check against
  });
  it("names the gap, unreadable amounts and an empty reading, and skips the sum when a discount is listed", () => {
    expect(readingProblem(draft([line("A", "4.00")], { subtotal: "16.90" }))).toBe("Its item amounts add up to $4.00, but the printed subtotal is $16.90.");
    expect(readingProblem(draft([line("A", null)]))).toBe("The amounts for A were unreadable.");
    expect(readingProblem(draft([]))).toBe("It lists no items.");
    expect(readingProblem(draft([line("A", "4.00")], { subtotal: "3.00", discounts: [{ printedText: "Coupon", amount: "1.00", itemIndex: 0 }] }))).toBeNull();
  });
});
describe("mergeReadings", () => {
  const reading = (items: LlmItem[], subtotal: string) => toDraft(receipt(items, { subtotal }), "m");
  it("prefers a balanced second reading as is", () => {
    const second = reading([line("A", "4.00"), line("B", "12.90")], "16.90");
    expect(mergeReadings(reading([line("A", "4.00")], "16.90"), second)).toBe(second);
  });
  it("blanks amounts the readings disagree on and lists lines only one reading found", () => {
    const { draft } = mergeReadings(reading([line("Pad Thai", "12.90"), line("Tea", "3.00")], "17.90"), reading([line("Pad Thai", "13.00"), line("Rice", "2.00")], "17.90"));
    expect(draft.items.map(i => [i.name, i.priceCents])).toEqual([["Pad Thai", null], ["Rice", 200]]); expect(draft.items[0].details?.reviewCodes).toEqual(["ocr-price"]);
    expect(draft.warnings).toEqual(["Two readings disagree on the amount for Pad Thai ($12.90 or $13.00). Enter the printed amount.", "Only the second reading found Rice. Check it against the photo.", "The first reading also found Tea ($3.00). Add it if it is on the receipt."]);
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx vitest run src/lib/llm/to-draft.test.ts`
Expected: FAIL, `Failed to resolve import "./to-draft"`

- [ ] **Step 3: Implement**

```ts
import { formatMoney, parseMoney } from "@/lib/money";
import type { DraftItem, ReceiptDraft } from "@/types/receipt";
import type { LlmReceipt } from "./reply";
export type DishTranslation = { name: string; text: string };
export type CloudReading = { draft: ReceiptDraft; translations: DishTranslation[] };
const cents = (value: string | null) => value === null ? null : parseMoney(value.replace(/,/g, ""));
const CJK = /[㐀-鿿]/;
const key = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, "");
/** Same unconfirmed draft the local engines produce: unreadable amounts stay null and every discount stays unresolved for the user. */
export function toDraft(reply: LlmReceipt, model: string): CloudReading {
  const warnings = reply.uncertain.map(note => note.trim()).filter(Boolean).map(note => `Cloud recognition was unsure: ${note}`);
  const slots: (DraftItem | null)[] = reply.items.map(item => {
    const name = item.name.trim(); if (!name) return null;
    const priceCents = cents(item.lineTotal); if (item.lineTotal !== null && priceCents === null) warnings.push(`Could not read the amount "${item.lineTotal}" for ${name}. Enter it from the photo.`);
    const sourceLines = item.printedText.split("\n").map(l => l.trim()).filter(Boolean);
    return { name, priceCents, sourceLine: sourceLines.join(" / ") || name, details: { quantity: item.quantity, unitPriceCents: cents(item.unitPrice), printedPriceCents: priceCents, sourceLines: sourceLines.length ? sourceLines : [name], modifiers: item.modifiers.map(m => m.trim()).filter(Boolean).map(text => ({ text, sourceLine: text })), discounts: [], reviewCodes: [] } };
  });
  const unassignedDiscounts: string[] = [];
  for (const d of reply.discounts) {
    const amount = cents(d.amount?.replace(/^-/, "") ?? null); const target = d.itemIndex === null ? null : slots[d.itemIndex] ?? null;
    if (amount === null || !target?.details) { unassignedDiscounts.push(d.printedText); continue; }
    target.details.discounts.push({ discountCents: amount, inclusion: "unresolved", sourceLine: d.printedText }); if (!target.details.reviewCodes.includes("discount")) target.details.reviewCodes.push("discount");
  }
  const rawText = [...reply.items.map(i => `${i.printedText.replace(/\n/g, " / ")}  ${i.lineTotal ?? "?"}`), ...reply.discounts.map(d => `${d.printedText}  -${d.amount ?? "?"}`), ...(["subtotal", "tax", "tip", "total"] as const).filter(k => reply[k] !== null).map(k => `${k}  ${reply[k]}`), `(read by ${model})`].join("\n");
  const draft: ReceiptDraft = { items: slots.filter((i): i is DraftItem => i !== null), rawText, taxCents: cents(reply.tax), tipCents: cents(reply.tip) ?? 0, printedSubtotalCents: cents(reply.subtotal), printedTotalCents: cents(reply.total), warnings, ...(unassignedDiscounts.length ? { unassignedDiscounts } : {}) };
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
  if (draft.printedTotalCents !== null && draft.taxCents !== null) { const expected = sum + draft.taxCents + (draft.tipCents ?? 0); return expected === draft.printedTotalCents ? null : `Its item amounts plus tax and tip add up to ${formatMoney(expected)}, but the printed total is ${formatMoney(draft.printedTotalCents)}.`; }
  return null;
}
/** Neither reading balances: keep the recheck, blank amounts the two disagree on, and list what only one of them saw. */
export function mergeReadings(first: CloudReading, second: CloudReading): CloudReading {
  if (readingProblem(second.draft) === null) return second;
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
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npx vitest run src/lib/llm/to-draft.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/llm/to-draft.ts src/lib/llm/to-draft.test.ts
git commit -m "feat(llm): map Qwen readings to drafts, check the ledger, merge rechecks"
```

---

### Task 5: The DashScope request

**Files:**
- Create: `src/lib/llm/qwen-client.ts`
- Test: `src/lib/llm/qwen-client.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it, vi } from "vitest";
import { requestReceipt } from "./qwen-client";
import { UNREADABLE_REPLY } from "./reply";
const config = { apiKey: "secret", baseUrl: "https://x.test/v1", model: "qwen3.5-plus" };
const live = () => new AbortController().signal;
const ok = (content: unknown) => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200, headers: { "Content-Type": "application/json" } });
describe("requestReceipt", () => {
  it("posts one image with the schema, thinking off, and returns the message content", async () => {
    const send = vi.fn<typeof fetch>(async () => ok("{\"items\":[]}"));
    await expect(requestReceipt("data:image/jpeg;base64,AA", config, { signal: live(), fetch: send })).resolves.toBe("{\"items\":[]}");
    const [url, init] = send.mock.calls[0]; const body = JSON.parse(String(init?.body));
    expect(url).toBe("https://x.test/v1/chat/completions"); expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer secret");
    expect(body).toMatchObject({ model: "qwen3.5-plus", enable_thinking: false, temperature: 0, response_format: { type: "json_schema", json_schema: { name: "receipt", strict: true } } });
    expect(body.messages[0].role).toBe("system"); expect(body.messages[1].content).toEqual([{ type: "image_url", image_url: { url: "data:image/jpeg;base64,AA" } }, { type: "text", text: "Transcribe this receipt." }]);
  });
  it("sends the recheck text in place of the first request", async () => {
    const send = vi.fn<typeof fetch>(async () => ok("{}"));
    await requestReceipt("u", config, { signal: live(), fetch: send, recheck: "Read again." });
    expect(JSON.parse(String(send.mock.calls[0][1]?.body)).messages[1].content[1].text).toBe("Read again.");
  });
  it("turns HTTP, network and shape failures into next-step messages", async () => {
    for (const [status, message] of [[401, "rejected its key"], [429, "over its quota"], [413, "smaller, clearer photo"], [500, "HTTP 500"]] as const)
      await expect(requestReceipt("u", config, { signal: live(), fetch: async () => new Response("{}", { status }) })).rejects.toThrow(message);
    await expect(requestReceipt("u", config, { signal: live(), fetch: async () => { throw new TypeError("Failed to fetch"); } })).rejects.toThrow("Could not reach cloud recognition");
    await expect(requestReceipt("u", config, { signal: live(), fetch: async () => ok(null) })).rejects.toThrow(UNREADABLE_REPLY);
  });
  it("passes a cancellation through unchanged", async () => {
    const controller = new AbortController(); controller.abort();
    await expect(requestReceipt("u", config, { signal: controller.signal, fetch: async () => { throw new DOMException("aborted", "AbortError"); } })).rejects.toMatchObject({ name: "AbortError" });
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx vitest run src/lib/llm/qwen-client.test.ts`
Expected: FAIL, `Failed to resolve import "./qwen-client"`

- [ ] **Step 3: Implement**

```ts
import type { CloudConfig } from "./config";
import { FIRST_REQUEST, RECEIPT_PROMPT, RECEIPT_SCHEMA } from "./prompt";
import { UNREADABLE_REPLY } from "./reply";
export type RequestOptions = { signal: AbortSignal; recheck?: string; fetch?: typeof fetch };
function httpMessage(status: number): string {
  if (status === 401 || status === 403) return "Cloud recognition rejected its key. Choose Standard or Precise, and update the key in the deployment settings.";
  if (status === 429) return "Cloud recognition is busy or over its quota. Wait a minute and try again, or choose Standard or Precise.";
  if (status === 400 || status === 413) return "Cloud recognition could not accept this photo. Try a smaller, clearer photo, or choose Standard or Precise.";
  return `Cloud recognition failed (HTTP ${status}). Try again, or choose Standard or Precise.`;
}
/** One chat completion straight from the browser: DashScope answers CORS preflights for any origin (checked 2026-10-22). */
export async function requestReceipt(imageUrl: string, config: CloudConfig, { signal, recheck, fetch: send = (input, init) => fetch(input, init) }: RequestOptions): Promise<string> {
  const body = { model: config.model, enable_thinking: false, temperature: 0, response_format: { type: "json_schema", json_schema: { name: "receipt", strict: true, schema: RECEIPT_SCHEMA } },
    messages: [{ role: "system", content: RECEIPT_PROMPT }, { role: "user", content: [{ type: "image_url", image_url: { url: imageUrl } }, { type: "text", text: recheck ?? FIRST_REQUEST }] }] };
  let response: Response;
  try { response = await send(`${config.baseUrl}/chat/completions`, { method: "POST", signal, headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify(body) }); }
  catch (error) { if (signal.aborted) throw error; throw new Error("Could not reach cloud recognition. Check your connection, or choose Standard or Precise."); }
  if (!response.ok) throw new Error(httpMessage(response.status));
  const reply: unknown = await response.json().catch(() => null);
  const content = (reply as { choices?: { message?: { content?: unknown } }[] } | null)?.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new Error(UNREADABLE_REPLY);
  return content;
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npx vitest run src/lib/llm/qwen-client.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/llm/qwen-client.ts src/lib/llm/qwen-client.test.ts
git commit -m "feat(llm): DashScope chat completion request with next-step errors"
```

---

### Task 6: Image compression and the orchestrator

**Files:**
- Create: `src/lib/llm/upload-image.ts` (uses browser APIs; covered by the Task 10 E2E)
- Create: `src/lib/llm/recognize.ts`
- Test: `src/lib/llm/recognize.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it, vi } from "vitest";
import type { requestReceipt } from "./qwen-client";
import { createCloudRecognizer } from "./recognize";
const config = { apiKey: "k", baseUrl: "https://x.test/v1", model: "qwen3.5-plus" };
const reply = (items: [string, string | null][], subtotal: string | null) => JSON.stringify({ items: items.map(([name, lineTotal]) => ({ printedText: name, name, nameZh: name === "Milk Tea" ? "奶茶" : "", quantity: null, unitPrice: null, lineTotal, modifiers: [] })), discounts: [], subtotal, tax: "1.00", tip: null, total: null, uncertain: [] });
const options = () => ({ signal: new AbortController().signal, onProgress: vi.fn() });
function make(...answers: (string | Error)[]) {
  const request = vi.fn<typeof requestReceipt>(async () => { const next = answers.shift()!; if (next instanceof Error) throw next; return next; });
  return { request, recognize: createCloudRecognizer({ config, prepare: async () => "data:image/jpeg;base64,AA", request }) };
}
describe("cloud recognizer", () => {
  it("returns a balanced first reading after one request, with its Chinese names", async () => {
    const { request, recognize } = make(reply([["Milk Tea", "4.00"], ["Pad Thai", "12.90"]], "16.90"));
    const { draft, translations } = await recognize(new Blob(["x"]), options());
    expect(request).toHaveBeenCalledTimes(1); expect(draft.items.map(i => i.priceCents)).toEqual([400, 1290]); expect(translations).toEqual([{ name: "Milk Tea", text: "奶茶" }]);
  });
  it("re-reads once when the items miss the printed subtotal and keeps the balanced second reading", async () => {
    const { request, recognize } = make(reply([["Milk Tea", "4.00"]], "16.90"), reply([["Milk Tea", "4.00"], ["Pad Thai", "12.90"]], "16.90"));
    const { draft } = await recognize(new Blob(["x"]), options());
    expect(request).toHaveBeenCalledTimes(2); expect(request.mock.calls[1][2].recheck).toContain("the printed subtotal is $16.90");
    expect(draft.items.map(i => i.name)).toEqual(["Milk Tea", "Pad Thai"]); expect(draft.warnings).toEqual([]);
  });
  it("keeps the first reading with a warning when the re-read fails", async () => {
    const { recognize } = make(reply([["Milk Tea", "4.00"]], "16.90"), new Error("Cloud recognition is busy or over its quota."));
    const { draft } = await recognize(new Blob(["x"]), options());
    expect(draft.items).toHaveLength(1); expect(draft.warnings).toEqual(["The double-check could not run: Cloud recognition is busy or over its quota."]);
  });
  it("fails clearly with no items, no configuration, or a cancel", async () => {
    await expect(make(reply([], null), reply([], null)).recognize(new Blob(["x"]), options())).rejects.toThrow("No receipt items found");
    await expect(createCloudRecognizer({ config: null, prepare: async () => "u", request: vi.fn() })(new Blob(["x"]), options())).rejects.toThrow("not set up on this site");
    const controller = new AbortController();
    const request = vi.fn<typeof requestReceipt>((_url, _config, o) => new Promise((_, reject) => o.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")))));
    const pending = createCloudRecognizer({ config, prepare: async () => "u", request })(new Blob(["x"]), { signal: controller.signal, onProgress: () => {} }); controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx vitest run src/lib/llm/recognize.test.ts`
Expected: FAIL, `Failed to resolve import "./recognize"`

- [ ] **Step 3: Implement image compression**

`src/lib/llm/upload-image.ts`:

```ts
const FAILED = "Could not prepare the photo for cloud recognition. Choose Standard or Precise.";
/** The 2.3 MB corrected PNG took 69 s to read; the same photo as a 260 KB JPEG took 11 s with identical results (2026-10-22). */
export async function toUploadDataUrl(image: Blob, maxEdge = 2048): Promise<string> {
  const bitmap = await createImageBitmap(image);
  try {
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height)); const width = Math.max(1, Math.round(bitmap.width * scale)); const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
    const context = canvas.getContext("2d"); if (!context) throw new Error(FAILED);
    context.fillStyle = "#fff"; context.fillRect(0, 0, width, height); context.drawImage(bitmap, 0, 0, width, height); // JPEG has no alpha: paint transparent PNG areas white, not black
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error(FAILED)), "image/jpeg", 0.85));
    return await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error(FAILED)); reader.readAsDataURL(blob); });
  } finally { bitmap.close(); }
}
```

- [ ] **Step 4: Implement the orchestrator**

`src/lib/llm/recognize.ts`:

```ts
import { cloudConfig, type CloudConfig } from "./config";
import { recheckMessage } from "./prompt";
import { requestReceipt } from "./qwen-client";
import { parseLlmReply } from "./reply";
import { mergeReadings, readingProblem, toDraft, type CloudReading } from "./to-draft";
import { toUploadDataUrl } from "./upload-image";
export type CloudDeps = { config: CloudConfig | null; prepare: (image: Blob) => Promise<string>; request: typeof requestReceipt };
type Options = { signal: AbortSignal; onProgress: (stage: string, progress: number | null) => void };
const TIMEOUT_MS = 90000; // two readings at ~11 s each, with room for a slow phone network
const canceled = () => new DOMException("Recognition canceled. You can select another photo or enter items manually.", "AbortError");
/** Reads once; when the items do not reconcile with the printed subtotal or total, re-reads once with the first transcription and the gap. */
export function createCloudRecognizer(deps: CloudDeps) {
  return async (image: Blob, { signal, onProgress }: Options): Promise<CloudReading> => {
    const config = deps.config; if (!config) throw new Error("Cloud recognition is not set up on this site. Choose Standard or Precise.");
    const controller = new AbortController(); const abort = () => controller.abort(); if (signal.aborted) abort(); else signal.addEventListener("abort", abort, { once: true });
    let timedOut = false; const timer = setTimeout(() => { timedOut = true; controller.abort(); }, TIMEOUT_MS);
    try {
      onProgress("Preparing the photo", null); const url = await deps.prepare(image); if (controller.signal.aborted) throw canceled();
      onProgress("Reading with cloud recognition", null);
      const firstText = await deps.request(url, config, { signal: controller.signal }); const first = toDraft(parseLlmReply(firstText), config.model);
      const problem = readingProblem(first.draft); let result = first;
      if (problem) {
        onProgress("Double-checking every line", null);
        try { result = mergeReadings(first, toDraft(parseLlmReply(await deps.request(url, config, { signal: controller.signal, recheck: recheckMessage(firstText, problem) })), config.model)); }
        catch (error) { if (controller.signal.aborted) throw error; first.draft.warnings.push(`The double-check could not run: ${error instanceof Error ? error.message : "unknown error"}`); }
      }
      if (!result.draft.items.length) throw new Error("No receipt items found. Try a clearer photo, or enter items manually.");
      return result;
    } catch (error) {
      if (timedOut) throw new Error("Cloud recognition took longer than 90 seconds. Try again, or choose Standard or Precise.");
      if (signal.aborted) throw canceled();
      throw error;
    } finally { clearTimeout(timer); signal.removeEventListener("abort", abort); }
  };
}
export const recognizeWithCloud = createCloudRecognizer({ config: cloudConfig(), prepare: toUploadDataUrl, request: requestReceipt });
```

- [ ] **Step 5: Run the test and confirm it passes**

Run: `npx vitest run src/lib/llm/`
Expected: PASS (all tests under `src/lib/llm`)

- [ ] **Step 6: Commit**

```bash
git add src/lib/llm/upload-image.ts src/lib/llm/recognize.ts src/lib/llm/recognize.test.ts
git commit -m "feat(llm): cloud recognizer with JPEG upload, ledger recheck, cancel and timeout"
```

---

### Task 7: Translation service can accept cloud translations

**Files:**
- Modify: `src/lib/translation/types.ts` (`TranslationProvider`, `TranslationService`)
- Modify: `src/lib/translation/service.ts:83` (add `seed` to the returned object)
- Modify: `src/store/useTranslationStore.ts:53` (`serverService`)
- Test: `src/lib/translation/service.test.ts`

- [ ] **Step 1: Write the failing test** (append inside the `describe("translation service")` block in `service.test.ts`, reusing the file's `deps()` / `opts()`)

```ts
  it("serves seeded cloud translations from its cache before the glossary or the model", async () => {
    const { service, translateCalls } = deps(); service.seed([{ name: "Pad Kra Pow", text: "打抛饭 (鸡肉)" }, { name: "Milk Tea", text: "港式奶茶" }, { name: "  ", text: "空" }, { name: "Rice", text: " " }]);
    const outcome = await service.translateDishes([{ id: "a", name: "pad  kra pow" }, { id: "b", name: "Milk Tea" }], opts());
    expect(outcome.items.find(i => i.id === "a")).toMatchObject({ translatedText: "打抛饭 (鸡肉)", provider: "llm" }); expect(outcome.items.find(i => i.id === "b")?.translatedText).toBe("港式奶茶"); expect(translateCalls).toEqual([]);
  });
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx vitest run src/lib/translation/service.test.ts`
Expected: FAIL, `service.seed is not a function`

- [ ] **Step 3: Implement**

In `src/lib/translation/types.ts`, change the first line to:

```ts
export type TranslationProvider = "glossary" | "rule" | "model" | "llm";
```

In `TranslationService` (after `translateDishes`), add:

```ts
  /** Stores names translated elsewhere (cloud recognition) so the next request for the same names is a cache hit. */
  seed(entries: { name: string; text: string }[]): void;
```

In the object returned by `src/lib/translation/service.ts`, add after `setOcrBusy: setBusy,`:

```ts
    seed(entries) { for (const entry of entries) { const key = translationKey(entry.name); const text = entry.text.trim(); if (key && text) remember(key, { text, provider: "llm" }); } },
```

Add `seed: () => {},` to `serverService` in `src/store/useTranslationStore.ts:53`:

```ts
const serverService: TranslationService = { getCapabilities: async () => ({ modelAvailable: false, modelCached: false, downloadBytes: 0 }), translateDishes: async () => ({ items: [], error: null }), seed: () => {}, setOcrBusy: async () => {}, cancelTranslations: async () => {}, clearCache: () => {}, dispose: async () => {} };
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx vitest run src/lib/translation src/store`
Expected: PASS (existing tests + the new one)

- [ ] **Step 5: Commit**

```bash
git add src/lib/translation/types.ts src/lib/translation/service.ts src/lib/translation/service.test.ts src/store/useTranslationStore.ts
git commit -m "feat(translation): accept cloud dish names as provider llm"
```

---

### Task 8: Engine selection and wiring the wizard

**Files:**
- Modify: `src/lib/ocr/client.ts:8-9,14`
- Modify: `src/lib/ocr/engine-preference.ts:4`
- Test: `src/lib/ocr/engine-preference.test.ts`
- Modify: `src/components/receipt/photo-adjustment.tsx:143-147`
- Modify: `src/components/bill-wizard.tsx:35-51`

- [ ] **Step 1: Write the failing test** (append inside the `describe` in `engine-preference.test.ts`)

```ts
  it("defaults to cloud only when the site has a cloud key, and never returns cloud without one", () => {
    const s = storage(); expect(readEnginePreference(s, true)).toBe("cloud"); expect(readEnginePreference(s, false)).toBe("standard");
    writeEnginePreference(s, "standard"); expect(readEnginePreference(s, true)).toBe("standard");
    writeEnginePreference(s, "cloud"); expect(readEnginePreference(s, true)).toBe("cloud"); expect(readEnginePreference(s, false)).toBe("standard");
  });
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx vitest run src/lib/ocr/engine-preference.test.ts`
Expected: FAIL (`expected 'standard' to be 'cloud'`, and a TS type error)

- [ ] **Step 3: Engine type**

In `src/lib/ocr/client.ts`, replace lines 8-9 with:

```ts
export type OcrEngine = "standard" | "precise" | "cloud";
export type LocalEngine = Exclude<OcrEngine, "cloud">; // the cloud engine returns a draft directly (src/lib/llm), not OCR evidence
type Options = { signal: AbortSignal; onProgress: (stage: string, progress: number | null) => void; enhanced?:boolean; engine?: LocalEngine };
```

Change line 14's `factories: Record<OcrEngine, Factory>` to `factories: Record<LocalEngine, Factory>`.

- [ ] **Step 4: Preference**

Replace line 4 of `src/lib/ocr/engine-preference.ts` (and add the import):

```ts
import { cloudConfig } from "@/lib/llm/config";
export function readEnginePreference(storage: StorageLike | null = typeof window === "undefined" ? null : window.localStorage, cloudAvailable = cloudConfig() !== null): OcrEngine {
  const fallback: OcrEngine = cloudAvailable ? "cloud" : "standard"; // with a key, a fresh browser starts on the most accurate engine
  try { const stored = storage?.getItem(ENGINE_PREFERENCE_KEY); return stored === "precise" || stored === "standard" ? stored : fallback; } catch { return fallback; } // a stored "cloud" or junk value falls back, so a site without a key never returns "cloud"
}
```

Run: `npx vitest run src/lib/ocr`
Expected: PASS (including the existing tests: in Vitest there is no `NEXT_PUBLIC_DASHSCOPE_API_KEY`, so the default is still standard)

- [ ] **Step 5: Engine option**

In `src/components/receipt/photo-adjustment.tsx`, add the import `import { cloudConfig } from "@/lib/llm/config";`, and at the top of the component body add `const cloud = cloudConfig() !== null;`. Replace the `fieldset` (lines 143-146) with:

```tsx
    <div className="paper"><fieldset className="choice-group"><legend className="field-label">Recognition engine</legend>
      {cloud && <label className={`choice-card${engine === "cloud" ? " selected" : ""}`}><input type="radio" name="ocr-engine" value="cloud" disabled={busy} checked={engine === "cloud"} onChange={() => onEngineChange("cloud")} /><span><b>Cloud AI (most accurate)</b> <small>sends this photo to Alibaba Cloud Qwen; adds Chinese names</small></span></label>}
      <label className={`choice-card${engine === "standard" ? " selected" : ""}`}><input type="radio" name="ocr-engine" value="standard" disabled={busy} checked={engine === "standard"} onChange={() => onEngineChange("standard")} /><span><b>Standard (fast)</b></span></label>
      <label className={`choice-card${engine === "precise" ? " selected" : ""}`}><input type="radio" name="ocr-engine" value="precise" disabled={busy} checked={engine === "precise"} onChange={() => onEngineChange("precise")} /><span><b>Precise</b> <small>first use downloads about 45 MB; stays in this browser</small></span></label>
    </fieldset></div>
```

In the button text on line 147, change `engine === "precise" ? "Use this photo and recognize (precise)" : "Use this photo and recognize"` to:

```tsx
engine === "precise" ? "Use this photo and recognize (precise)" : engine === "cloud" ? "Use this photo and recognize (cloud)" : "Use this photo and recognize"
```

- [ ] **Step 6: Wizard branch**

In `src/components/bill-wizard.tsx`, add the imports:

```ts
import type { ReceiptDraft } from "@/types/receipt";
import type { DishTranslation } from "@/lib/llm/to-draft";
```

Replace the `try` block in `recognizePrepared` (lines 39-47) with:

```tsx
    try {
      await getTranslationService().setOcrBusy(true); // frees the translation engine before OCR; released in finally or by cancel()
      if (!replacing) commitPhoto(selected);
      const onProgress = (message: string, value: number | null) => { if (id === request.current) { setStage(message); setProgress(value); } };
      let draft: ReceiptDraft; let translations: DishTranslation[] = [];
      if (engine === "cloud") { const { recognizeWithCloud } = await import("@/lib/llm/recognize"); ({ draft, translations } = await recognizeWithCloud(image, { signal: abort.signal, onProgress })); }
      else draft = parseReceiptEvidence(await recognizeReceipt(image, { signal: abort.signal, enhanced: enhancedScan.current, engine, onProgress }));
      if (id !== request.current) return;
      if (replacing) commitPhoto(selected);
      else useBillStore.getState().startBill("photo", selected.name);
      useBillStore.getState().setReceiptDraft(draft); useTranslationStore.getState().clearForBill(); setDraftVersion(v => v + 1);
      if (translations.length) { getTranslationService().seed(translations); useTranslationStore.getState().setEnabled(true); } // cloud names come with the draft; the receipt step's translation request then reads them from the cache
    } catch (failure) {
```

(The `catch` / `finally` stay as they are.)

- [ ] **Step 7: Type check, lint, all unit tests**

Run: `npx tsc --noEmit; npm run lint; npm test`
Expected: all three pass with no errors

- [ ] **Step 8: Commit**

```bash
git add src/lib/ocr/client.ts src/lib/ocr/engine-preference.ts src/lib/ocr/engine-preference.test.ts src/components/receipt/photo-adjustment.tsx src/components/bill-wizard.tsx
git commit -m "feat: Cloud AI engine option, default when a key is configured"
```

---

### Task 9: Real-API accuracy evaluation (spends roughly ¥0.03 per run)

**Files:**
- Create: `src/lib/llm/live-eval.test.ts`

- [ ] **Step 1: Write the test** (skipped by default; runs only with `LIVE_LLM=1`)

```ts
import { existsSync, readFileSync } from "node:fs";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { parseCloudConfig } from "./config";
import { requestReceipt } from "./qwen-client";
import { createCloudRecognizer } from "./recognize";
const env: Record<string, string> = existsSync(".env.local") ? Object.fromEntries(readFileSync(".env.local", "utf8").split(/\r?\n/).filter(l => /^[A-Z_]+=/.test(l)).map(l => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)])) : {};
const config = parseCloudConfig({ apiKey: env.NEXT_PUBLIC_DASHSCOPE_API_KEY, baseUrl: env.NEXT_PUBLIC_DASHSCOPE_BASE_URL, model: env.NEXT_PUBLIC_DASHSCOPE_MODEL });
const prepare = async (image: Blob) => `data:image/jpeg;base64,${(await sharp(Buffer.from(await image.arrayBuffer())).resize({ width: 2048, height: 2048, fit: "inside", withoutEnlargement: true }).flatten({ background: "#ffffff" }).jpeg({ quality: 85 }).toBuffer()).toString("base64")}`;
const read = (file: string) => createCloudRecognizer({ config, prepare, request: requestReceipt })(new Blob([readFileSync(`tests/fixtures/receipts/${file}`)]), { signal: new AbortController().signal, onProgress: () => {} });
describe.skipIf(!process.env.LIVE_LLM || !config)("live Qwen receipt accuracy (LIVE_LLM=1 spends API credit)", () => {
  it("reads every Line Thai Cafe item, amount and total, without invented ingredients", async () => {
    const expected = JSON.parse(readFileSync("tests/fixtures/receipts/line-thai-cafe-2026-09-05.expected.json", "utf8")) as { items: { name: string; priceCents: number }[]; subtotalCents: number; taxCents: number; totalCents: number };
    const { draft, translations } = await read("line-thai-cafe-2026-09-05-redacted.png");
    console.log(JSON.stringify({ items: draft.items.map(i => [i.name, i.priceCents]), translations, warnings: draft.warnings }));
    expect(draft.items.map(i => i.priceCents)).toEqual(expected.items.map(i => i.priceCents)); expect(draft.items.map(i => i.name)).toEqual(expected.items.map(i => i.name));
    expect([draft.printedSubtotalCents, draft.taxCents, draft.printedTotalCents]).toEqual([expected.subtotalCents, expected.taxCents, expected.totalCents]);
    expect(translations.find(t => t.name === "Pad Kra Pow")?.text).not.toMatch(/猪/); expect(translations.find(t => t.name === "Brown Sugar Milk")?.text).not.toMatch(/珍珠/);
  }, 120000);
  it("reads the synthetic diner receipt exactly", async () => {
    const expected = JSON.parse(readFileSync("tests/fixtures/receipts/clear-diner.expected.json", "utf8")) as { items: { name: string; priceCents: number }[]; taxCents: number; totalCents: number };
    const { draft } = await read("clear-diner.png");
    expect(draft.items.map(i => [i.name, i.priceCents])).toEqual(expected.items.map(i => [i.name, i.priceCents])); expect([draft.taxCents, draft.printedTotalCents]).toEqual([expected.taxCents, expected.totalCents]);
  }, 120000);
});
```

- [ ] **Step 2: Confirm it's skipped by default**

Run: `npm test`
Expected: PASS, and `live-eval.test.ts` reports 2 skipped

- [ ] **Step 3: Run it against the real API** (requires the key in `.env.local`)

Run: `$env:LIVE_LLM='1'; npx vitest run src/lib/llm/live-eval.test.ts; Remove-Item Env:LIVE_LLM`
Expected: PASS (2 tests). Save the console JSON for Task 11's validation record. If "Fried Tofu (12)" comes back without the "(12)", or a translation invents an ingredient, adjust the matching rule in `RECEIPT_PROMPT` and run again. **Don't loosen the assertions.**

- [ ] **Step 4: Commit**

```bash
git add src/lib/llm/live-eval.test.ts
git commit -m "test(llm): opt-in live accuracy check against real Qwen"
```

---

### Task 10: E2E (fake key + intercepted requests, never spends money)

**Files:**
- Modify: `playwright.config.ts:6,9`
- Create: `tests/e2e/cloud-ocr.spec.ts`

- [ ] **Step 1: Configuration**

In `playwright.config.ts`, add to `use` on line 6 (after `trace`):

```ts
storageState: { cookies: [], origins: [{ origin: `http://127.0.0.1:${port}`, localStorage: [{ name: "bitesplit-ocr-engine", value: "standard" }] }] }, // existing OCR specs keep the on-device engine; cloud-ocr.spec opts out
```

Add `env` to `webServer` on line 9 (process.env takes precedence over `.env.local`, so the dev server never gets the real key):

```ts
env: { NEXT_PUBLIC_DASHSCOPE_API_KEY: "e2e-fake-key", NEXT_PUBLIC_DASHSCOPE_BASE_URL: "https://dashscope.e2e.invalid/compatible-mode/v1", NEXT_PUBLIC_DASHSCOPE_MODEL: "qwen3.5-plus" },
```

Note: `E2E_PRODUCTION=1` uses an existing `next build`, and NEXT_PUBLIC values are inlined at build time. In that case build first with `$env:NEXT_PUBLIC_DASHSCOPE_API_KEY='e2e-fake-key'; $env:NEXT_PUBLIC_DASHSCOPE_BASE_URL='https://dashscope.e2e.invalid/compatible-mode/v1'; npm run build`. Then run Playwright. Even if you forget, the spec's `page.route` intercepts every `/chat/completions` request, so no real request goes out.

- [ ] **Step 2: Write the spec**

```ts
import { test, expect, type Page } from "@playwright/test";
test.use({ storageState: { cookies: [], origins: [] } }); // a fresh browser: the cloud engine is the default when the site has a key
const reply = { items: [
  { printedText: "Pad Kra Pow\nChicken", name: "Pad Kra Pow", nameZh: "打抛饭 (鸡肉)", quantity: null, unitPrice: null, lineTotal: "12.90", modifiers: ["Chicken"] },
  { printedText: "Milk Tea", name: "Milk Tea", nameZh: "奶茶", quantity: null, unitPrice: null, lineTotal: "4.00", modifiers: [] },
], discounts: [], subtotal: "16.90", tax: "1.39", tip: null, total: "18.29", uncertain: [] };
const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization, content-type", "access-control-allow-methods": "POST" };
async function mockQwen(page: Page, answer: { status: number; body: unknown }) {
  const bodies: { model: string; messages: { content: { type: string; image_url?: { url: string } }[] }[] }[] = [];
  await page.route("**/compatible-mode/v1/chat/completions", async route => {
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    bodies.push(route.request().postDataJSON()); await route.fulfill({ status: answer.status, contentType: "application/json", headers: cors, body: JSON.stringify(answer.body) });
  });
  return bodies;
}
async function recognize(page: Page) {
  await page.goto("/"); await page.getByLabel("Upload a receipt", { exact: true }).setInputFiles("tests/fixtures/receipts/clear-diner.png");
  await expect(page.getByRole("radio", { name: /Cloud AI/ })).toBeChecked();
  await page.getByRole("button", { name: /^Use this photo and recognize/ }).click();
}
test("cloud engine fills prices, tax and Chinese names from one Qwen reply", async ({ page }) => {
  const bodies = await mockQwen(page, { status: 200, body: { choices: [{ message: { role: "assistant", content: JSON.stringify(reply) } }] } });
  await recognize(page);
  await expect(page.getByRole("heading", { name: "Check the receipt" })).toBeVisible({ timeout: 30000 });
  await expect(page.getByLabel("Price for Pad Kra Pow", { exact: true })).toHaveValue("12.90"); await expect(page.getByLabel("Price for Milk Tea", { exact: true })).toHaveValue("4.00"); await expect(page.getByLabel("Tax", { exact: true })).toHaveValue("1.39");
  await expect(page.locator(".dish-translation", { hasText: "打抛饭 (鸡肉)" })).toBeVisible(); await expect(page.locator('.dish-translation[data-provider="llm"]')).toHaveCount(2);
  expect(bodies).toHaveLength(1); expect(bodies[0].model).toBe("qwen3.5-plus"); expect(bodies[0].messages[1].content[0].image_url?.url).toMatch(/^data:image\/jpeg;base64,/);
});
test("a rejected key tells the user how to continue", async ({ page }) => {
  await mockQwen(page, { status: 401, body: { error: { code: "invalid_api_key" } } });
  await recognize(page);
  await expect(page.getByText(/Cloud recognition rejected its key/)).toBeVisible({ timeout: 30000 });
});
```

- [ ] **Step 3: Run it**

Run: `npx playwright test tests/e2e/cloud-ocr.spec.ts --project=chromium`
Expected: PASS (2 tests). If the "Price for …" `aria-label` doesn't match, check against `src/components/receipt/receipt-step.tsx:75` (`Price for ${item.name}`).

- [ ] **Step 4: Full regression**

Run: `npx playwright test`
Expected: everything passes, including `ocr-flow.spec.ts` asserting `external` is empty, which shows the on-device engine still never contacts any external host.

- [ ] **Step 5: Commit**

```bash
git add playwright.config.ts tests/e2e/cloud-ocr.spec.ts
git commit -m "test(e2e): cloud engine with a mocked Qwen endpoint"
```

---

### Task 11: Documentation, deployment, and cost protection

**Files:**
- Modify: `src/ARCHITECTURE.md`
- Modify: `README.md`
- Create: `docs/validation/2026-10-22-cloud-llm-ocr.md`

- [ ] **Step 1: ARCHITECTURE.md**

1. Under "What the app is", change "A single-page, client-only receipt splitter. Five wizard steps, no server API:" to "A single-page, client-only receipt splitter. Five wizard steps, no server API of its own:". Add this after "The photo is read by Tesseract.js…":
   > With `NEXT_PUBLIC_DASHSCOPE_API_KEY` set at build time, a third engine, **Cloud AI**, sends the corrected photo from the browser straight to Alibaba Cloud DashScope (`qwen3.5-plus`) and gets back items, amounts and Chinese names in one call. The key is public in the bundle by design; cost is capped on the Alibaba Cloud side.
2. In the "Directory map" `lib/` list, add: `llm/                Cloud engine: DashScope request, prompt/schema, reply validation, draft mapping and ledger recheck (see below).`
3. After the "OCR pipeline" section, add a section:

```markdown
## Cloud engine (`lib/llm/`)

Entry point: `recognizeWithCloud` in `recognize.ts`, called from `bill-wizard.tsx` `recognizePrepared` when the engine is `"cloud"`. It returns a `ReceiptDraft` directly (no `OcrEvidence`), plus Chinese names that are seeded into the translation cache as provider `llm`.

| File | Role |
|---|---|
| `config.ts` | `NEXT_PUBLIC_DASHSCOPE_*` (literal reads, inlined at build). No key → the engine is hidden |
| `upload-image.ts` | JPEG, long edge ≤ 2048 px. A 2.3 MB PNG took 69 s; the 260 KB JPEG took 11 s |
| `prompt.ts` | Prompt + JSON Schema. Copy amounts, never compute; nameZh may not add unprinted ingredients |
| `reply.ts` | Hand validation of the model JSON |
| `to-draft.ts` | Cents via `parseMoney`, discounts `unresolved`, `readingProblem` ledger check, `mergeReadings` |
| `recognize.ts` | One reading; if items miss the printed subtotal/total or an amount is unreadable, one recheck. 90 s timeout |

The same conservative policy applies: disagreements between the two readings blank the amount (`ocr-price`), lines only one reading saw become warnings, never silent additions.
```

4. In the "Where to change things" table, add a row: `| Cloud recognition accuracy or translation wording | `lib/llm/prompt.ts`; verify with `LIVE_LLM=1 npx vitest run src/lib/llm/live-eval.test.ts` |`

- [ ] **Step 2: README.md**

After the sentence ending "No server OCR API is required." (line 29), add:

```markdown
Optional cloud recognition: copy `.env.example` to `.env.local` and set `NEXT_PUBLIC_DASHSCOPE_API_KEY` (Alibaba Cloud Model Studio, China (Beijing) region). The photo adjustment page then offers **Cloud AI (most accurate)**, which sends the corrected photo directly from the browser to Qwen and fills items, amounts and Chinese dish names. The key is embedded in the public JavaScript; protect it with spending limits on the Alibaba Cloud side. Without a key the app stays fully on-device.
```

- [ ] **Step 3: Validation record**

Create `docs/validation/2026-10-22-cloud-llm-ocr.md` with the measurements from the "Background and decisions" table at the top of this plan (CORS preflight results, key region, 6/6 Line Thai accuracy, 69 s → 11 s, flash comparison, the translation hallucination and the prompt fix), plus Task 9's live JSON output and Task 10's results. State explicitly: **there is only one real photo, and broad real-photo accuracy has not been verified**; private photos were not uploaded to any third party.

- [ ] **Step 4: Commit**

```bash
git add src/ARCHITECTURE.md README.md docs/validation/2026-10-22-cloud-llm-ocr.md
git commit -m "docs: cloud LLM engine architecture, setup and validation record"
```

- [ ] **Step 5: Vercel environment variables (done by the user, or by the agent after the user agrees)**

```bash
vercel env add NEXT_PUBLIC_DASHSCOPE_API_KEY production
vercel env add NEXT_PUBLIC_DASHSCOPE_BASE_URL production
vercel env add NEXT_PUBLIC_DASHSCOPE_MODEL production
```

Values: the key, `https://dashscope.aliyuncs.com/compatible-mode/v1`, `qwen3.5-plus`. NEXT_PUBLIC values are inlined at build time, so **you must redeploy after adding them** (`vercel deploy --prod`).

- [ ] **Step 6: Alibaba Cloud cost protection (the user does this in the console; it's the only real protection for a built-in key)**

1. Give this site its **own** API key. Don't share it with other projects, so it can be revoked on its own.
2. Set a budget alert in Alibaba Cloud Billing Center, and keep only a small balance in the account, so a leaked key can't run up a large bill.
3. In the Bailian console, check whether this key/workspace can be restricted to `qwen3.5-plus` only, and whether it supports rate or quota limits. Turn them on if so.
4. If the console shows abnormal call volume: revoke the key → create a new one → `vercel env rm/add` → redeploy.

- [ ] **Step 7: Post-launch check**

On a phone, open the production site, take a photo of a real receipt, choose Cloud AI, and confirm the items, amounts and Chinese names. Record the time in the validation document, then commit.

---

## Self-review

- **Coverage:** every dish recognized and none missed (prompt + ledger re-read, Tasks 2/4/6); most accurate (plus model, JPEG compression, conservative merging, live eval in Task 9); Chinese translation (nameZh + no-invented-ingredient rule + seed, Tasks 2/7/8); pure front end + built-in key (Tasks 1/8/11); the key isn't committed to the repo (`.env*` ignore, `.env.example` template, E2E fake key in Task 10); no-key fallback (`cloudConfig()` returns null → option hidden, default standard).
- **Type consistency:** `CloudConfig`, `LlmReceipt`/`LlmItem`/`LlmDiscount`, `CloudReading`/`DishTranslation`, `requestReceipt(imageUrl, config, { signal, recheck, fetch })`, `createCloudRecognizer({ config, prepare, request })`, `recognizeWithCloud`, `TranslationService.seed(entries)`, `OcrEngine`/`LocalEngine` match across tasks.
- **Out of scope (YAGNI):** server proxy, per-user BYOK, cross-checking cloud results against local OCR, recognizing photos of food (this round only recognizes dishes printed on receipts).
