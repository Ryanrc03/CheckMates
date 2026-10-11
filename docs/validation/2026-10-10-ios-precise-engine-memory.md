# 2026-10-10 Precise engine crashed iOS tabs: WebGPU ORT build exhausts JavaScriptCore memory

## Symptom

On an iPhone (Chrome for iOS, which uses the system WebKit), tapping **Use this photo and recognize (precise)** on the deployed site showed Chrome's "Can't open this page" screen: the web content process was killed by iOS. Desktop Chromium, the whole unit suite and the production e2e run were green.

## Reproduction (desktop WebKit, iPhone 14 emulation)

Playwright WebKit 26 cannot emulate the iOS memory limit, but it runs the same JavaScriptCore engine. Process memory (`tasklist` on `WebKitWebProcess.exe`) was sampled every 500 ms while the real precise flow ran against `next start`, and again while single steps ran in an isolated worker.

| Step in an isolated worker | WebKit working set, 60 s after the step |
| --- | --- |
| Compile + instantiate ORT 1.24.3 `ort-wasm-simd-threaded.jsep.wasm` (25 MB, WebGPU build) | ~260 MB, flat |
| Instantiate OpenCV.js 4.10 (7.6 MB wasm, 128 MB initial heap) | ~265 MB, flat |
| Create the det + rec `InferenceSession`s with the **jsep** build | 2.9 GB after 10 s, 3.5 GB after 60 s, peak 3.8 GB |
| Create the det + rec `InferenceSession`s with the **wasm-only** build (`ort-wasm-simd-threaded.wasm`, 12 MB) | ~380 MB, flat, peak 540 MB |

The real flow matched the third row: memory climbed from the moment the worker started, reached 1.8 GB when `init` replied and kept climbing to 3.8 GB after the worker had been terminated. Chromium runs the same flow in 11 s at a fraction of that. iOS kills a web content process long before 3 GB, which is exactly the crash the phone showed.

`@paddleocr/paddleocr-js` imports the default `onnxruntime-web` entry, which since ORT 1.19 is the WebGPU-capable bundle and loads the jsep wasm even when only the wasm backend is used.

## Fix

- `next.config.ts` resolves `onnxruntime-web` to `onnxruntime-web/wasm` for the whole bundle, so the SDK and our worker use the wasm-only runtime.
- The `ocr-precise` bundle (now version `ppocrv5m-ort1.24.3-wasm`) ships `ort-wasm-simd-threaded.wasm` + `.mjs` instead of the jsep files; first download drops from about 58 MB to about 45 MB. Users who already installed the old bundle download the new version on next use; the old cache is removed by the existing version cleanup.
- Second WebKit finding: this WebKit build (and iOS before 16.4) has no `OffscreenCanvas` in workers, so `predict` failed with "Can't find variable: OffscreenCanvas". The engine now decodes the photo on the main thread and posts `ImageData` when `OffscreenCanvas` is missing.

## Result (same WebKit setup)

| Check | Before | After |
| --- | --- | --- |
| Real precise flow on `clear-diner.png` | never finished; worker error, 3.8 GB peak | "Check the receipt" after 7 s, Burger 14.95 / Fries 5.95 / Lemonade 3.50 |
| Peak `WebKitWebProcess` working set over baseline | +3.8 GB | +0.78 GB |

Playwright now has a `webkit` project (iPhone 14 descriptor) that runs `precise-ocr.spec.ts` and `ocr-flow.spec.ts`, so a regression of either finding fails CI-style runs. A real-device check on an iPhone is still required: the remaining ~0.8 GB peak is dominated by OpenCV.js's fixed 128 MB heap plus the model sessions, and older 3 GB-RAM phones may still be tight.
