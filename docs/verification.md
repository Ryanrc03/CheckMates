# Verification record — CheckMates

2026-09-29 experience-review follow-up adds quantities, percentage tax/tip, even split, a reversible Everyone toggle, clearer progress, share links/QR codes, currencies and a 320px touch layout check. See [feedback follow-up](validation/feedback-2026-09-29.md).

2026-09-29 V2-A release: the per-photo correction flow was published at [the live demo](https://checkmates-pi.vercel.app) from a clean branch based on public MVP `cc06071`; the earlier reverted V2 experiment commits were not pushed. The release checkout passed 54 unit tests, 29 production-mode Chromium tests, lint, and build. Vercel production deployment `dpl_5T2ibbYmApcJiBbTt8QmQHD7uQaJ` is ready. The homepage, OCR manifest, worker, and English model returned HTTP 200; a live 375px browser session reached the adjustment page before any OCR request and recognized Soup as $8.25 after confirmation. Physical-phone performance and broad real-photo accuracy are still unverified; see [V2-A validation](validation/v2-image-correction.md). The historical MVP record follows.

Date: 2026-09-27. Environment: Windows, Node 24.12.0, npm 11.6.2, Next.js 16.3.6, Chromium 145 (Playwright 1.58.2). Public branch: `main`.

## Commands and evidence

| Check | Result |
| --- | --- |
| `npm.cmd run lint` | PASS, no warnings after excluding generated engine assets and documenting blob previews |
| `npm.cmd test` | PASS, 37 tests across 7 files |
| `node node_modules/typescript/bin/tsc --noEmit --incremental false` | PASS |
| `npm.cmd run build` | PASS, homepage prerendered; OCR asset preparation runs before build |
| `npm.cmd run start -- --port 3200` | PASS, production server ready and homepage responds |
| `$env:E2E_PRODUCTION='1'; npm.cmd run test:e2e` | PASS, 13 browser tests, actual OCR worker (see final run below) |

For the final production browser run on this Windows environment, `npm.cmd run start -- --port 3200` was started in a separate terminal before Playwright. Playwright reused that server and exited with code 0. When Playwright launched the server itself here, all 13 tests reported success but its server teardown did not exit; that runner-only limitation does not affect the app flow.

Coverage includes odd-cent click-order independence, safe-integer bounds and exact formatting, independent tax/tip conservation, null-price drafts, corrupt/unknown cache, action-key stripping, partial input restoration, storage write failures, deletion of assigned participants, returning to edit, denied clipboard, reset then refresh, two synthetic real-engine cases, actual Line Thai photograph, blank/blurred/invalid images, rotation cancellation, reselection, resource failure, timeout and real retry. Timeout uses Playwright's clock to advance the app deadline; OCR results are never mocked.

An independent read-only review found three important parser defects: incomplete first items, service-charge abbreviations, and spelled-out suggested-tip percentages. All were reproduced as failing tests and fixed; the full suite passed afterward. No critical or deferred minor findings remained from that review. A subsequent integer-boundary format regression and visual long-name visibility check were also fixed after observing failures.

## Actual photo versus engine fixtures

The user-provided Line Thai Cafe photograph is published only as a redacted copy; the original remains in an ignored local directory. Browser OCR identified all six charged amounts `[1390,790,400,2580,1290,800]`, subtotal 7250; tax was not identified and had to be entered manually. The printed grand total was not reliably read (raw `7848` without a decimal); it stays unidentified instead of guessing. Background texture produced six extra null-price candidates and some names contained noise. The form flagged these candidates, quantity/each lines, low confidence and missing printed total. It could not advance without explicit review and correction.

The browser test records the redacted-photo draft, manually replaces/corrects the items against the human annotation, explicitly sets tax/tip and completes the split. Final bill: $78.48; A and B: **$39.24 each**. Artifacts: [before correction](validation/before-correction.txt), [after correction](validation/after-correction.txt). No automatic accuracy claim is made for handwritten or arbitrary photos.

`clear-diner.png` and `clear-cafe.png` are independently typeset **synthetic** receipts, not photographs. The unmodified real Tesseract worker identifies their exact item/fee/total values. Their flows finish at $26.41 and $19.82. These prove engine deployment and parsing integration, not broad real-photo accuracy.

**Corpus gap:** the plan requested at least three real photos. Only the user-provided photo, published as a redacted derivative, is available and validated. An additional photograph by FASTILY, [Restaurant Bill 1](https://commons.wikimedia.org/wiki/File:Restaurant_Bill_1_2013-07-08.jpg), was verified as CC BY-SA 3.0, but downloading its original returned HTTP 429. It was not added or claimed as tested. Clear frontal and complex-tip-area real-photo coverage therefore remains incomplete, as allowed to be explicitly recorded in Task 7.

## Production resources, privacy and timing

The real production browser test begins in a fresh context (empty browser cache/IndexedDB), recognizes a cafe image, reattaches a different diner image without changing its draft, then explicitly recognizes again. Recorded cold and warm timings were **944 ms** and **945 ms** in the first complete production run. These are local-machine measurements, not a device performance guarantee. The final timing artifact is [cold/warm OCR](validation/cold-warm-real-ocr.json).

The worker, SIMD LSTM WASM wrapper and English model returned HTTP 200 from the app's own origin. The wrapper embeds its WASM payload; it need not issue a separate `.wasm` request. No external OCR requests or image POSTs were observed in the clear-fixture tests. Model loading failures, cancellation and simulated 120-second timeout all returned to actionable retry/manual UI, and actual retries succeeded. Resource source/version/license/SHA-256 data is in [asset manifest](ocr-assets-manifest.json).

## Layout and limitations

Five steps checked at 375×900 and 1280×900, with screenshots and horizontal-overflow assertions. Keyboard Enter adds friends and activates assignment controls; headings receive focus on step change, invalid fields receive focus after failed receipt submission, and reduced-motion media is supported. Long names wrap in visible participant labels, assignment chips and results. Main controls have at least 44px height. Bottom action bars include safe-area padding and pages retain enough trailing scroll space.

Synthetic tests do not prove all practical OCR layouts. Real-photo noise and missing totals need manual correction. Only Chromium desktop/mobile viewport emulation was exercised; no physical phone camera, Safari or Firefox acceptance is claimed. Images are not persisted. Names and bill data are stored on this device until reset; storage failure is visible. No login, payment or cloud synchronization is provided.

## Deployment verification

The public `main` branch at `9481d04` was pushed to `https://github.com/Ryanrc03/CheckMates` as a new root snapshot, so the original unredacted receipt is absent from remote history. Vercel production deployment `dpl_2FQzwVn75n5srGrQQzQcAq7t5TLB` is ready at https://checkmates-pi.vercel.app. The public homepage, OCR manifest, worker and English model returned HTTP 200. A fresh browser session uploaded `clear-cafe.png` to the deployed site and read Soup as $8.25 through the real worker. GitHub auto-deploy is not connected: Vercel reported that this account needs a GitHub Login Connection. Subsequent changes require CLI deployment until that connection is added.
