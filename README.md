# CheckMates

[Live demo](https://checkmates-pi.vercel.app) ? [Source on GitHub](https://github.com/Ryanrc03/CheckMates)

A mobile-first receipt splitter: photo → adjustable correction → real OCR → review → friends → assignments → exact amounts, item-by-item explanations, and a copyable summary. English interface, USD, no account or payment processing.

## Run locally

Use Node.js 24 and npm. On Windows PowerShell, use `npm.cmd` if script policy blocks `npm.ps1`.

```sh
npm ci
npm run dev
```

Open http://localhost:3000. `predev` prepares the pinned OCR assets automatically.

To try the split explanation locally, choose **Try a sample bill**, review the editable amounts, add friends, assign every item, then open each person's **View breakdown** on the result page. The colored bar compares each person's items, tax and tip on one shared scale. Expand a card to check each dish and the exact cent allocation. The public demo above still shows the last deployed version until this branch is approved and deployed.

```sh
npm run lint
npm test
npx playwright install chromium
npm run test:e2e
npm run build
npm start
```

`prebuild` copies OCR resources to `public/ocr`. Deploy that directory together with the Next.js output. Missing assets or unexpected versions make preparation fail. No server OCR API is required.

## How it works

- `src/components/`: one five-step client wizard and reusable controls.
- `src/store/useBillStore.ts`: Zustand actions, validated versioned recovery, and reset.
- `src/lib/money.ts`, `split.ts`, `share.ts`: pure integer-cent calculations, exact allocation details and summary text.
- `src/lib/ocr/`: image decoding, real Tesseract worker lifecycle, conservative text parsing, and printed-total reconciliation.
- `src/lib/receipt-image/`: per-photo tilt and page-boundary suggestions, perspective correction, and manual adjustment before OCR.
- `src/types/`: confirmed bills, unconfirmed receipt drafts, and raw editor state.
- `tests/e2e/`: full user journeys and actual Chromium OCR, including failure recovery.
- `tests/fixtures/receipts/`: redacted real photo, explicit synthetic engine fixtures, human annotations and provenance.

Amounts are nonnegative safe integer cents. Each dish can split equally, by integer ratio, or by consumed units (for example six wings split 2/2/1/1). Consumed units must exactly cover the user-entered total; unfinished edits block the result. Receipt order quantities are kept separately and never set consumed units automatically. Leftover cents follow the bill's stable participant order, regardless of click order. Tax and tip are allocated independently in proportion to item shares using exact BigInt largest remainders. No rounding loss: the individual item, tax, tip and grand totals reconcile. A zero subtotal with nonzero extras is rejected.

## Real OCR and privacy

JPEG/PNG/WebP files up to 15 MiB are decoded in the browser. Each photo gets its own correction preview before OCR; users can adjust four corners, fine-tune the angle, rotate 90°, or keep the original. The confirmed image is limited to six million pixels. Photos never go to an OCR backend, and are not stored in localStorage.

The engine is Tesseract.js **6.0.1**, locked core **6.1.2**, and English model package `@tesseract.js-data/eng` **1.0.0**, `4.0.0_best_int`. `npm run prepare:ocr` copies worker/WASM/traineddata files from installed packages and emits SHA-256, source and license metadata in `public/ocr/manifest.json`. See [OCR assets](docs/ocr-assets.md).

The application owns the native worker from construction and uses the pinned engine's initialization protocol. This permits termination during model loading, including initialization errors; the upstream 6.0.1 high-level factory does not expose that early ownership. Engine code and recognition output are unmodified. All resource URLs are on the app's own origin. The first visit needs a network connection to download app/engine/model resources; the model may then be cached by the browser. This is not an offline PWA guarantee.

OCR retains validated line and word coordinates. A manual Enhanced scan may run one extra layout candidate within the same 120-second cancellation budget; it is not enabled by default because the three photos showed no consistent accuracy gain. Alternative text remains available, and differing prices stay blank for confirmation.

Missing subtotal, tax or total now triggers a targeted financial scan automatically: the lower receipt region is enlarged and its lighting flattened, then read with sparse layout; a smaller footer pass is used if total remains missing. These passes share the same worker, cancellation and 120-second deadline. They update financial fields only, retaining their source text and leaving conflicting amounts blank. The three supplied originals now extract all nine financial fields correctly without manual correction; see [financial OCR validation](docs/validation/2026-10-06-financial-ocr.md). This evidence is limited to those three images, rather than a guarantee for every receipt.

OCR creates a draft, never a final bill. Order quantities, unit prices, tax codes, included options, and discount evidence are shown beside each item. Included grocery discounts are not subtracted twice; uncertain discount interpretation requires an explicit choice between printed line total and subtracting the listed discount. Missing prices/tax remain blank. Suggested tips are excluded; charged gratuity and your additional tip are separate fields. Original recognized text, printed totals, discrepancy and review notes remain visible. Users must check uncertain lines and explain mismatched totals before continuing. Failed or blank recognition leads to retry/manual entry, never sample data.

## Recovery

Use **Reset bill** in the header from any step to clear the receipt, people, amounts, unfinished allocations and photo adjustments and return to Start. It also cancels recognition so late output cannot restore the previous bill. Browser refresh continues to restore the current saved draft; use Reset bill when starting a different bill.

The `bitesplit-session` localStorage entry has schema version 2. Version 1 assignments migrate automatically to equal allocations; applied weights and unfinished allocation inputs survive refresh. It stores items, names, assignments, current step, source filename, raw OCR draft/warnings, and unfinished editor text. It excludes photos, object URLs, worker state, progress, and calculated results. After refresh, reattach a photo to preview it without replacing edits. Recognition must be explicitly restarted. Invalid cache is discarded safely; a failed write shows a warning but editing continues. Start a new bill replaces the saved session with an empty one.

## Verification and limits

See [verification record](docs/verification.md) for exact checks, real-photo extraction/corrections, and production timing. Two typeset images exercise the actual OCR engine and are **not** real-photo accuracy evidence. The redacted Line Thai Cafe photograph is separately tested end to end. Three additional user-provided photos have been measured locally, with independent redacted annotations. See [weighted split and receipt upgrade validation](docs/validation/2026-10-06-weighted-split-receipts.md). Private photos and raw OCR logs stay outside Git.

Clear printed English restaurant receipts are the supported target. Automatic page-boundary detection is conservative; weak edges, folds, textured backgrounds, blurry text, handwritten tips, foreign currencies, multilingual receipts, discounts and complex service fees may require manual correction. Real-phone performance and a broader real-photo accuracy set remain to be validated. Printed line totals are never multiplied again by order quantities. Currency conversion, payment, cloud sync and accounts are not provided.
