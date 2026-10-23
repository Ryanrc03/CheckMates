# Verification record — CheckMates

2026-10-22 V4 cloud recognition (branch `claude/v4-recipe-api-keys-dc6b48`, not deployed yet): an optional Cloud AI engine sends the corrected photo from the browser to Alibaba Cloud Qwen (`qwen3.5-plus`). `npm test` passed 247 tests (2 live skipped); the Playwright suite passed 73 on chromium and webkit with a mocked endpoint. A live run on the one redacted real photo read 6/6 items and all totals exactly; broad real-photo accuracy and physical-phone timing are unverified. See [cloud LLM record](validation/2026-10-22-cloud-llm-ocr.md).

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

## 2026-10-10 V3 local translation + precise OCR (branch `feat/v3-local-translation-precise-ocr`, not deployed)

Environment: Windows 11, Node 24.12.0, Next.js 16.3.6 (Turbopack), Chromium 145 (Playwright 1.58.2). Desktop verification only; no iPhone or Android run yet.

| Check | Result |
| --- | --- |
| `npm run lint` | PASS (old `.worktrees/` build output is now ignored) |
| `npx tsc --noEmit --incremental false` | PASS |
| `npm test` | PASS, 139 tests across 20 files |
| `npm run build` | PASS; `prepare:models` verified both bundles against pinned SHA-256 |
| `E2E_PRODUCTION=1 npx playwright test` | PASS, 34 production-mode Chromium tests (real bergamot model download + translation + removal; real PaddleOCR precise recognition of `clear-diner.png` with cache reuse; cancellation paths) |
| `curl -I /models/translate-enzh/2.2-b0.6.0/runtime/translator-worker.js` | `Cache-Control: public, max-age=31536000, immutable` |
| `node scripts/translation-quality.mjs` | PASS (deterministic negation/quantity checks); see [v3-translation-quality.md](validation/v3-translation-quality.md): probe set 47/50 exact (42 glossary, 6 rule, 2 model), hold-out 8/20 exact with 16 model outputs, 0 untranslated |

Limits: all timings and storage behaviour are desktop numbers; the 7-day iOS purge, Website Data listing, memory ceilings and WebAssembly SIMD availability on real phones remain to be measured before any release. Model outputs are machine translations for reference only.

## 2026-10-10 Merge `origin/main` (weighted split, OCR evidence) into `feat/v3-local-translation-precise-ocr` (commit `6aa1f99`, deployed)

Environment: Windows 11, Node 24, Next.js 16.3.6 (Turbopack), Chromium (Playwright). Desktop verification only.

| Check | Result |
| --- | --- |
| `npm run lint` | PASS |
| `npx tsc --noEmit --incremental false` | PASS |
| `npm test` | PASS, 196 tests across 30 files (V3 139 + origin's allocation, session v2, OCR financial/normalize/retry/fixture suites) |
| `npm run build` | PASS |
| `E2E_PRODUCTION=1 npx playwright test` | PASS, 56 passed + 6 skipped (private photos); re-run of the 6 with `PRIVATE_RECEIPTS_DIR=.private/receipt-upgrade/2026-10-06` PASS, 62/62 total |
| `node scripts/translation-quality.mjs --base http://127.0.0.1:3200` | PASS; probe 47/50 exact, hold-out 8/20 exact, 0 untranslated (unchanged from the V3 record) |
| Manual, 375px | Sample bill → Show Chinese names → split step shows the allocation editor (Equal/Ratio/Quantity) with Chinese labels under each item; Reset bill button in the header returns home; Offline data rows list both models |

Notes: the precise (PaddleOCR) engine returns `OcrEvidence` with lines and intentionally skips the Tesseract-only enhanced and financial re-scans. On Windows `prepare:models` rewrites `docs/model-assets-manifest.json` with CRLF-inflated byte counts for the vendored bergamot JS; that diff is a checkout artifact and was not committed.

Deployment: branch pushed to GitHub and published with the Vercel CLI (`vercel deploy --prod`). Production deployment `dpl_6VM7y4bFGqWw8B7jdnMEYb61WwK1` is ready at https://checkmates-pi.vercel.app; the homepage, `/models/manifest.json` and the bergamot translator worker returned HTTP 200, and a live browser session showed the sample bill with Chinese dish names and no console errors. GitHub auto-deploy is still not connected.

PR [#6](https://github.com/Ryanrc03/CheckMates/pull/6) merged into `main` as `d499ff1`; production was redeployed from `main` as `dpl_3RFFTZZfNikunTwKwE6XKnJuZB4P` (ready, same checks green: homepage, model manifest and translator worker HTTP 200, live sample bill with Chinese names, Reset bill, no console errors).

## 2026-10-10 iOS fix: precise engine on the wasm-only ORT build (branch `fix/ios-precise-engine-memory`)

Trigger: on an iPhone the deployed precise engine killed the tab ("Can't open this page" in Chrome for iOS). Root cause and measurements: [2026-10-10-ios-precise-engine-memory.md](validation/2026-10-10-ios-precise-engine-memory.md).

| Check | Result |
| --- | --- |
| `npm run lint`, `npx tsc --noEmit --incremental false` | PASS |
| `npm test` | PASS, 197 tests across 30 files (new: engine posts ImageData when the page cannot rasterize in a worker) |
| `npm run build` | PASS; `ocr-precise` bundle is now `ppocrv5m-ort1.24.3-wasm` (12 MB `ort-wasm-simd-threaded.wasm` + glue, no jsep files) |
| `E2E_PRODUCTION=1 npx playwright test` (chromium + new webkit project, private photos supplied) | PASS, 72/72: 62 chromium, 10 webkit (`precise-ocr`, `ocr-flow` on the iPhone 14 descriptor) |
| WebKit precise flow memory (`WebKitWebProcess` working set over baseline) | +0.78 GB peak, finishes in 7 s; before the fix +3.8 GB and never finished |

Limit: still desktop WebKit, not a phone. The first real-iPhone run after deployment is the acceptance test.

Deployment: PR [#7](https://github.com/Ryanrc03/CheckMates/pull/7) merged as `9cf5627`; production redeployed from `main` as `dpl_4ojemgFFPqc2q9oi8eo2wcriGayk` (ready). The live manifest serves `ppocrv5m-ort1.24.3-wasm`, both runtime files return HTTP 200, and the WebKit precise flow against https://checkmates-pi.vercel.app finished in 9 s with the correct prices and +0.81 GB peak.

## 2026-10-11 UI visual alignment + LAN dev fixes (branch `feat/ui-visual-alignment`)

Environment: Windows 11, Node v24.12.0, npm 11.6.2, Next.js 16.3.6 (Turbopack), Playwright 1.58.2 (Chromium + WebKit). Desktop verification plus the built-in browser at the machine's LAN addresses; no real-phone run yet.

Trigger: on an iPhone, opening `next dev` by LAN address (http://10.0.0.217:3000) stayed on "Getting your table ready…", and once that was fixed the precise engine failed with "Cannot read properties of undefined (reading 'open')". The UI visual alignment work on this branch is recorded in [2026-10-11-ui-visual-alignment.md](validation/2026-10-11-ui-visual-alignment.md).

Root causes: (1) Next 16 answers the HMR socket and dev fonts with 403 for any host not in `allowedDevOrigins` (only 127.0.0.1 was listed) and the page then never hydrates; `10.0.0.*` is now allowed. (2) Plain http on a LAN IP is not a secure context: `caches`, `crypto.subtle` and `crypto.randomUUID` are undefined, so precise recognition, translation and offline data cannot run there at all (browser limitation, production https unaffected), and `crypto.randomUUID` made adding an item or a friend throw. `browserEnv()` now fails with a message that says to open the site over https, ids come from `lib/id.ts`, and `npm run dev:https` serves the dev server with a local certificate (gitignored `certificates/`).

| Check | Result |
| --- | --- |
| `npx eslint` on the changed files | PASS |
| `npx tsc --noEmit` | PASS |
| `npm test` | PASS, 209 tests across 33 files |
| `npm run build` | PASS |
| `E2E_PRODUCTION=1 npx playwright test` | PASS, 71 passed + 6 skipped (private photos); `precise-ocr` passed on chromium and webkit |
| Built-in browser, http://10.0.0.217:3100 | Blocked before the config change (403 on `/_next/hmr` and `/__nextjs_font/*`, page never hydrated); hydrates after it |
| Built-in browser, http://10.0.0.68:3100 (fresh origin, insecure context) | Offline data shows the secure-connection message; sample bill → add item → Add friends → add a friend works without errors |

Limit: the first real-iPhone run, over https in development or against production after deployment, is still the acceptance test for the precise engine on a phone.

Deployment: PR [#8](https://github.com/Ryanrc03/CheckMates/pull/8) merged as `9ede6ee`; production redeployed from `main` as `dpl_3CDwWPBg8LWZEmW7xKxoKTsJyzck` (ready). Live checks at https://checkmates-pi.vercel.app: homepage and `/models/manifest.json` HTTP 200, precise runtime `ort-wasm-simd-threaded.wasm` HTTP 200 with `Cache-Control: public, max-age=31536000, immutable`, and the homepage hydrates in the built-in browser with no console errors. The first real-iPhone run against this deployment is still the acceptance test for the precise engine on a phone.
