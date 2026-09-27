# OCR assets and pinned adapter

`npm ci` installs the locked npm packages. `npm run prepare:ocr` copies assets to the ignored `public/ocr/` directory and writes a manifest with filename, package, version, source, license, bytes and SHA-256. Production builds invoke this command automatically and reject missing or unexpected versions.

| Component | Version / source | License |
| --- | --- | --- |
| Tesseract.js worker | 6.0.1, https://github.com/naptha/tesseract.js/tree/v6.0.1 | Apache-2.0 |
| tesseract.js-core | 6.1.2, npm lockfile integrity | Apache-2.0 |
| English traineddata | @tesseract.js-data/eng 1.0.0, 4.0.0_best_int, https://github.com/naptha/tessdata | MIT package metadata; upstream tessdata Apache-2.0 |

The generated worker license is copied alongside resources. All four core wrappers and their WASM files are copied, so Tesseract selects the compatible implementation. Language data is gzip-compressed, served at `/ocr/eng.traineddata.gz`. Requests are same-origin; no CDN or OCR backend receives the image.

The application owns a native worker before initialization. `src/lib/ocr/worker.ts` implements only the pinned `load`, `loadLanguage`, `initialize`, `recognize` request/response protocol from Tesseract.js 6.0.1 `src/createWorker.js` and `src/worker-script/index.js`. The high-level 6.0.1 factory can leave its initialization promise pending after language-loading failure and exposes termination only after successful initialization. Explicit ownership avoids that lifecycle limitation without changing OCR engine output. Review this adapter and rerun real browser tests before upgrading the engine.

Runtime SHA-256 values for this delivery are recorded in `docs/ocr-assets-manifest.json` and regenerated in `public/ocr/manifest.json` for each preparation.
