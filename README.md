# CheckMates

[Live demo](https://checkmates-pi.vercel.app) ? [Source on GitHub](https://github.com/Ryanrc03/CheckMates)

A mobile-first receipt splitter: photo → adjustable correction → real OCR → review → friends → assignments → exact amounts and a copyable summary. English interface, USD, no account or payment processing.

## Run locally

Use Node.js 24 and npm. On Windows PowerShell, use `npm.cmd` if script policy blocks `npm.ps1`.

```sh
npm ci
npm run dev
```

Open http://localhost:3000. `predev` prepares the pinned OCR assets automatically.

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
- `src/lib/money.ts`, `split.ts`, `share.ts`: pure integer-cent calculations and summary text.
- `src/lib/ocr/`: image decoding, real Tesseract worker lifecycle, conservative text parsing, and printed-total reconciliation.
- `src/lib/receipt-image/`: per-photo tilt and page-boundary suggestions, perspective correction, and manual adjustment before OCR.
- `src/types/`: confirmed bills, unconfirmed receipt drafts, and raw editor state.
- `tests/e2e/`: full user journeys and actual Chromium OCR, including failure recovery.
- `tests/fixtures/receipts/`: redacted real photo, explicit synthetic engine fixtures, human annotations and provenance.

Amounts are nonnegative safe integer cents. Shared items divide evenly; leftover cents follow the bill's stable participant order, regardless of click order. Tax and tip are allocated independently in proportion to item shares using exact BigInt largest remainders. No rounding loss: the individual item, tax, tip and grand totals reconcile. A zero subtotal with nonzero extras is rejected.

## Real OCR and privacy

JPEG/PNG/WebP files up to 15 MiB are decoded in the browser. Each photo gets its own correction preview before OCR; users can adjust four corners, fine-tune the angle, rotate 90°, or keep the original. The confirmed image is limited to six million pixels. Photos never go to an OCR backend, and are not stored in localStorage.

The engine is Tesseract.js **6.0.1**, locked core **6.1.2**, and English model package `@tesseract.js-data/eng` **1.0.0**, `4.0.0_best_int`. `npm run prepare:ocr` copies worker/WASM/traineddata files from installed packages and emits SHA-256, source and license metadata in `public/ocr/manifest.json`. See [OCR assets](docs/ocr-assets.md).

The application owns the native worker from construction and uses the pinned engine's initialization protocol. This permits termination during model loading, including initialization errors; the upstream 6.0.1 high-level factory does not expose that early ownership. Engine code and recognition output are unmodified. All resource URLs are on the app's own origin. The first visit needs a network connection to download app/engine/model resources; the model may then be cached by the browser. This is not an offline PWA guarantee.

OCR creates a draft, never a final bill. Missing prices/tax remain blank. Suggested tips are excluded; charged gratuity and your additional tip are separate fields. Original recognized text, printed totals, discrepancy and review notes remain visible. Users must check uncertain lines and explain mismatched totals before continuing. Failed or blank recognition leads to retry/manual entry, never sample data.

## Local models

Two optional features download models into this browser only; dish names and photos never leave the device.

- **Show Chinese names** (receipt and assignment steps): dish names are translated by a built-in glossary and modifier rules first (negations, quantities, abbreviations such as `Chkn`/`Ndl`/`w/o`); names the glossary does not know can be translated by Mozilla's Firefox Translations en→zh-Hans model running in a Web Worker (bergamot-translator v0.6.0, MPL-2.0) after a one-time 57 MB download that you confirm. Translations are machine output for reference; the printed names stay editable and unchanged.
- **Precise recognition** (engine choice on the photo-adjustment page): PaddleOCR PP-OCRv5 mobile (Apache-2.0) with onnxruntime-web (MIT) runs in a dedicated worker after a one-time download of about 58 MB; its text boxes are rebuilt into receipt lines and parsed by the same conservative parser as the standard Tesseract engine.

Model files are pinned by SHA-256 in `scripts/prepare-model-assets.mjs`, copied to the ignored `public/models/` by `npm run prepare:models` (runs before `dev`/`build`), and listed with licenses in [docs/model-assets.md](docs/model-assets.md). In the browser they live in the Cache API, expire after 14 days without use, and can be removed from the home page's **Offline data** section; iOS may also remove them after 7 days without use. Verified on desktop Chromium only; iPhone and Android behaviour is not yet validated (see [docs/validation/v3-translation-quality.md](docs/validation/v3-translation-quality.md)).

## Recovery

The `bitesplit-session` localStorage entry has schema version 1. It stores items, names, assignments, current step, source filename, raw OCR draft/warnings, and unfinished editor text. It excludes photos, object URLs, worker state, progress, and calculated results. After refresh, reattach a photo to preview it without replacing edits. Recognition must be explicitly restarted. Invalid cache is discarded safely; a failed write shows a warning but editing continues. Start a new bill replaces the saved session with an empty one.

## Verification and limits

See [verification record](docs/verification.md) for exact checks, real-photo extraction/corrections, and production timing. Two typeset images exercise the actual OCR engine and are **not** real-photo accuracy evidence. The redacted Line Thai Cafe photograph is separately tested end to end. The requested three-photo corpus is not complete; an attempted additional licensed source download returned HTTP 429.

Clear printed English restaurant receipts are the supported target. Automatic page-boundary detection is conservative; weak edges, folds, textured backgrounds, blurry text, handwritten tips, foreign currencies, multilingual receipts, discounts and complex service fees may require manual correction. Real-phone performance and a broader real-photo accuracy set remain to be validated. No automatic quantity multiplication, currency conversion, payment, cloud sync or account is provided.
