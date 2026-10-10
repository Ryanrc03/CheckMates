# Local model assets

`npm run prepare:models` (runs in `predev`/`prebuild`) downloads pinned files into the ignored `public/models/<bundle>/<version>/`
and writes `public/models/manifest.json` (snapshot: `docs/model-assets-manifest.json`). Every downloaded file is verified against
a SHA-256 recorded in `scripts/prepare-model-assets.mjs`; a mismatch fails the build. Downloads are cached in `.model-assets-cache/`.

| Bundle | Version | Stored in Cache API | First-use download | License |
| --- | --- | --- | --- | --- |
| translate-enzh (Mozilla Firefox Translations en→zh-Hans v2.2 + bergamot-translator v0.6.0 wasm) | 2.2-b0.6.0 | 56.9 MB | 57.0 MB | MPL-2.0 |
| ocr-precise (PaddleOCR PP-OCRv5 mobile det/rec ONNX + onnxruntime-web 1.24.3 wasm) | ppocrv5m-ort1.24.3 | 21.5 MB | ~58 MB incl. 25 MB ORT wasm and ~11 MB recognition module | Apache-2.0 / MIT |

Browser side: `src/lib/model-assets/` stores `cache: "cache-api"` files in `cm-models-<bundle>-v<version>` after the user opts in,
records install/last-use times in localStorage `bitesplit-model-assets`, purges bundles unused for 14 days or with a stale version on
start-up (never in `pagehide`), and the home page lists downloaded bundles with a Remove button. Runtime code files are plain static
files with `Cache-Control: immutable`. All requests are same-origin; dish names never leave the device. Verified on desktop Chromium
only; iOS Safari behaviour (7-day ITP purge, Website Data listing) is documented in the 2026-10-09 research spec and not yet tested.
