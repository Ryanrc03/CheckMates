# src/ architecture

Map of the CheckMates source for agents and contributors. Read this before changing code; the root [README](../README.md) covers product behavior and commands, and [docs/](../docs/) holds design specs and validation records.

## What the app is

A single-page, client-only receipt splitter. Five wizard steps, no server API:

```
home ──► receipt ──► people ──► split ──► result
 photo     review      friends    who ate     exact cents,
 + adjust  OCR draft              what        breakdown, copy
```

The photo is read by Tesseract.js running in a browser Web Worker. Bill data persists in `localStorage`; photos never do.

## Directory map

```
app/                  Next.js App Router shell. page.tsx renders <BillWizard/> only.
components/
  bill-wizard.tsx     Wizard controller: step routing, photo lifecycle, OCR requests/cancellation.
  home/               Step 1: take/upload photo, sample bill, manual entry. Also exports PhotoInput.
  receipt/            photo-adjustment.tsx (corner/angle/rotate UI before OCR),
                      receipt-step.tsx (Step 2 review form), receipt-line-details.tsx.
  people/             Step 3. Also exports personColor(id).
  split/              Step 4. item-allocation-editor.tsx = equal / ratio / quantity editor.
  result/             Step 5. person-breakdown.tsx (cent-by-cent trace), share-composition.tsx (bar).
  ui/                 shadcn/ui primitives (button, input, card, ...). Generic; no business logic.
store/
  useBillStore.ts     Zustand store: every bill mutation, persistence, hydration, reset.
lib/                  Pure logic (no React). Everything here is unit tested.
  money.ts            parseMoney / formatMoney / moneyInput (USD text <-> integer cents).
  allocation.ts       allocateCents: BigInt largest-remainder allocation.
  item-allocation.ts  Per-item shares for equal / ratio / quantity + validation.
  split.ts            explainSplitBill (full bill + trace), splitBill, allocateCentsDetailed.
  share.ts            Copyable summary text.
  session.ts          Runtime validation of persisted state, v1->v2 migration, step gating.
  receipt.ts          Sample bill and empty bill factories.
  ocr/                Recognition + receipt parsing pipeline (see below).
  receipt-image/      Photo analysis and perspective/tilt correction (see below).
types/
  bill.ts             Confirmed domain model: Bill, ReceiptItem, ItemAllocation, SplitResult.
  receipt.ts          Unconfirmed OCR draft (ReceiptDraft), raw editor state, BillSession.
  receipt-details.ts  Per-line OCR evidence: quantity, unit price, tax code, discounts, review codes.
  split-detail.ts     AllocationTrace / BillBreakdown used by the result explanation.
  ocr.ts              OcrEvidence, OcrLine, Bbox.
```

## Core data model

- `ReceiptDraft` (`types/receipt.ts`) is what OCR produces. Prices and financial fields may be `null` (unknown). It is never a bill.
- `Bill` (`types/bill.ts`) is what the user confirms on the receipt step. All amounts are non-null integer cents.
- `ItemAllocation` is a tagged union:
  - `{ mode: "equal", personIds }`
  - `{ mode: "ratio", shares: [{ personId, units }] }`
  - `{ mode: "quantity", totalUnits, unitLabel, shares }`: shares must sum exactly to `totalUnits`.
- `AllocationEdit` (string-valued) holds in-progress editor input. Pending edits block the result step.

## Money invariants (do not break)

1. Amounts are nonnegative safe-integer **cents**. Never use floats for money.
2. `allocateCents(total, weights)` in `lib/allocation.ts` uses BigInt largest remainders. Ties go to the earlier participant in **bill.people order**, so click order never changes who gets the extra cent.
3. `explainSplitBill` in `lib/split.ts` splits each item by its allocation, then allocates tax and tip **independently** in proportion to each person's item subtotal.
4. Every person's items, tax, tip and total must sum exactly to the bill. Tests assert this.
5. A zero subtotal with nonzero tax or tip is rejected.

`allocateCents` (allocation.ts) and `allocateCentsDetailed` (split.ts) implement the same algorithm; the second also returns a trace. Change both together, or merge them.

## State and persistence

- `store/useBillStore.ts`: `createBillStore(storage)` takes an injectable storage so tests can fake it. Every mutation goes through `change()`, which bumps a revision and calls `persist()`.
- The storage key is `bitesplit-session` (legacy project name; keep it, or migrate it deliberately). The stored shape is `{ version: 2, state }`.
- Loading goes through `migrateSession` → `restoreSession` in `lib/session.ts`. Every field is validated, and invalid cache is discarded rather than trusted. If you add a field to `BillSession`, update `persist()`, `restoreSession`, the validators, and `session.test.ts`.
- `availableStep` decides whether a step can be entered: the receipt must be confirmed, there must be at least one person, every item must be validly assigned, and no allocation edits may be pending.
- Not persisted: photos, object URLs, the OCR worker, progress, and computed results.

## OCR pipeline (`lib/ocr/`)

Entry point: `recognizeReceipt` in `client.ts`, called from `bill-wizard.tsx` `recognizePrepared`.

| Step | File | Role |
|---|---|---|
| 1 | `client.ts` | Orchestrates one recognition: 120 s deadline, AbortSignal cancellation, optional Enhanced scan, automatic financial rescans |
| 2 | `worker.ts` | Owns the raw Tesseract worker (`/ocr/worker.min.js`, same origin) and speaks its load/loadLanguage/initialize/recognize protocol directly so it can be terminated during init |
| 3 | `normalizeLines.ts` | Validates Tesseract blocks into `OcrLine[]` with bboxes |
| 4 | `classifyLines.ts` | Merges label and amount fragments on the same row by geometry; assigns a role per line (item, tax, total, tip, discount, metadata, ...) using regexes |
| 5 | `parseReceipt.ts` | `parseReceiptText` → `ReceiptDraft` with items, financial fields, details, and warnings |
| 6 | `resolveAmounts.ts` | Decides whether discounts are already included in the line price; ambiguous discounts become `unresolved` |
| 7 | `retry.ts` | `parseReceiptEvidence`: when primary and alternate scans disagree, the field becomes `null` with a warning. `chooseReceiptCandidate` ranks scans |
| 8 | `financial-image.ts` | Crops the lower receipt, deskews, enlarges, and flattens lighting for the subtotal/tax/total rescan |
| 9 | `financial-evidence.ts` | Pairs financial labels with amounts by geometry and merges rescans into the draft |
| 10 | `reconcile.ts` | Used by `receipt-step.tsx`: compares the user-edited bill with the printed subtotal and total |

`preprocess.ts` (`prepareReceiptImage`) is currently unused; `receipt-image/render.ts` replaced it.

**Parsing policy: conservative, evidence-preserving.**
- If unsure, leave the value `null` and add a warning. Never guess.
- Never derive tax as total − subtotal, never assume a tax rate, and never multiply a printed line total by its quantity.
- Conflicting readings blank the field. Tax may only be overwritten when two financial scans agree and the printed ledger reconciles.
- Suggested tips are ignored. Charged gratuity and the user's added tip are separate.
- Keep raw text (`rawText`, `alternateRawText`, `financialRawText`, `sourceLines`) so the user can audit.

These rules are deliberate and backed by real-photo regressions (`docs/validation/`). Do not relax them to make one receipt pass.

## Photo correction (`lib/receipt-image/`)

| File | Role |
|---|---|
| `analyze.ts` | `findBrightPage` (paper corners on a darker background) and `analyzeReceiptImage` (tilt via projection profile over −45°..45°, then 0.1° refinement) |
| `analyze.worker.ts` | Runs the analysis off the main thread on a ≤1024×1024 preview |
| `suggest.ts` | `residualTextAngle`: tilt remaining after the corner correction |
| `geometry.ts` | Quad validation; homography from four corners (8×8 linear solve) |
| `render.ts` | `renderCorrection`: quarter turns → perspective warp (bilinear) → fine rotation, capped at 6 MP |

UI: `components/receipt/photo-adjustment.tsx`. Adjustments are kept per `File` in `bill-wizard.tsx`, so reopening the same photo restores its corners and angle.

## Concurrency and cancellation

- `bill-wizard.tsx` increments `request.current` on every new recognition or cancel. Results whose id is stale are dropped, so a late OCR result can never overwrite a newer bill.
- `client.ts` races the work against a stop promise (abort or timeout) and always terminates the worker in `finally`.
- Reset bill cancels recognition, releases object URLs, and calls `resetBill()`.

## Where to change things

| Task | Start here |
|---|---|
| New split mode | `types/bill.ts` ItemAllocation → `item-allocation.ts` → `session.ts` isAllocation → `item-allocation-editor.tsx` → `share.ts` |
| New receipt line pattern | `classifyLines.ts` role regexes, then `parseReceipt.ts`; add a case to `parseReceipt.test.ts` / `complex-receipts.test.ts` |
| Financial field misread | `financial-evidence.ts` / `financial-image.ts`; check `docs/validation/2026-10-06-financial-ocr.md` first |
| New persisted field | `types/receipt.ts` BillSession → `useBillStore.ts` persist/initial → `session.ts` restoreSession |
| Result display | `components/result/*`; the data comes from `explainSplitBill` |

## Tests

- Unit tests (Vitest): `src/**/*.test.ts`, next to the code. Run them with `npm test`.
- E2E tests (Playwright, 375×812 viewport): `tests/e2e/`. `E2E_PRODUCTION=1` runs them against `npm start` on port 3200; otherwise they run against dev on 3100. Private real-photo specs are skipped unless `PRIVATE_RECEIPTS_DIR` is set.
- Ground-truth fixtures and their provenance live in `tests/fixtures/receipts/`. Expected values are human annotations, not engine output.
- Workflow used so far: reproduce a bug as a failing test, then fix it.

## Conventions and gotchas

- This is Next.js 16 with breaking changes. Read `node_modules/next/dist/docs/` before writing Next-specific code (see `AGENTS.md`).
- Node 24 / npm 11. The lockfile fails `npm ci` under npm 10.
- `public/ocr/` is generated by `scripts/prepare-ocr-assets.mjs` (runs on `predev` and `prebuild`) and gitignored. Asset versions are pinned and checked.
- The code style is dense: many statements per line, short names. Match the surrounding style in small edits; refactor deliberately, not incidentally.
- Imports use the `@/` alias for `src/`.
- UI copy is English and amounts are USD. Error messages tell the user what to do next.
