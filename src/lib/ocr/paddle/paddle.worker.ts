/// <reference lib="webworker" />
// Runs the whole PaddleOCR SDK (OpenCV.js + ONNX Runtime) inside this worker so nothing heavy touches the main thread.
// Turbopack bundles it as a classic worker: no top-level await, no import.meta.
import { PaddleOCR } from "@paddleocr/paddleocr-js";
import * as ort from "onnxruntime-web";
import { PADDLE_MODELS, type PaddleInitPayload, type PaddlePredictResult, type PaddleRequest, type PaddleResponse } from "./protocol";
type MatLike = { delete(): void }; type CvLike = { matFromImageData(imageData: ImageData): MatLike };
type SourceMat = { width: number; height: number; mat: MatLike; dispose(): void };
type Engine = Awaited<ReturnType<typeof PaddleOCR.create>>;
let engine: Engine | null = null;
const isImageData = (source: unknown): source is ImageData => !!source && typeof source === "object" && "data" in source && "width" in source && "height" in source;
// The SDK's built-in sourceToMat calls document.createElement("canvas") and cv.imread references HTMLImageElement (ReferenceError in workers).
// WebKit without OffscreenCanvas in workers (iOS before 16.4) gets ImageData decoded on the main thread instead of a Blob.
async function workerSourceToMat(cv: CvLike, source: unknown): Promise<SourceMat> {
  if (isImageData(source)) { const mat = cv.matFromImageData(source); return { width: source.width, height: source.height, mat, dispose() { mat.delete(); } }; }
  if (typeof OffscreenCanvas === "undefined") throw new Error("This browser cannot rasterize images inside a worker.");
  const bitmap = source instanceof ImageBitmap ? source : await createImageBitmap(source as Blob);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height); const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("OffscreenCanvas 2D context unavailable in worker."); ctx.drawImage(bitmap, 0, 0);
  const mat = cv.matFromImageData(ctx.getImageData(0, 0, bitmap.width, bitmap.height));
  return { width: bitmap.width, height: bitmap.height, mat, dispose() { mat.delete(); bitmap.close(); } };
}
// ort.env.logLevel does not silence ORT's 27 "CleanUnusedInitializersAndNodeArgs" console.error lines per session; the per-session logSeverityLevel does.
function quietOrt() {
  const factory = ort.InferenceSession as unknown as { create: (...args: unknown[]) => Promise<unknown>; __checkmatesPatched?: boolean };
  if (factory.__checkmatesPatched) return; const original = factory.create.bind(ort.InferenceSession);
  factory.create = (model: unknown, options?: unknown) => original(model, { logSeverityLevel: 3, ...(options as object) }); factory.__checkmatesPatched = true; ort.env.logLevel = "error";
}
function cacheBackedFetch(cacheName: string): typeof fetch {
  return async (input, init) => { const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url; try { const hit = await (await caches.open(cacheName)).match(url); if (hit) return hit; } catch { /* fall through */ } return fetch(input, init); };
}
async function init(payload: PaddleInitPayload) {
  quietOrt();
  const instance = await PaddleOCR.create({ worker: false, initialize: false, fetch: cacheBackedFetch(payload.cacheName), textDetectionModelName: PADDLE_MODELS.det, textRecognitionModelName: PADDLE_MODELS.rec, textDetectionModelAsset: { url: payload.detUrl }, textRecognitionModelAsset: { url: payload.recUrl }, ortOptions: { backend: "wasm", wasmPaths: payload.wasmPaths, numThreads: 1, proxy: false } });
  (instance as unknown as { sourceToMat: unknown }).sourceToMat = workerSourceToMat; // OcrPipelineRunner stores it as a plain instance field
  const summary = await instance.initialize(); engine = instance; return { backend: summary.backend, elapsedMs: summary.elapsedMs };
}
async function predict(image: Blob | ImageData): Promise<PaddlePredictResult> {
  if (!engine) throw new Error("Engine not initialized."); const [result] = await engine.predict(image as Blob);
  return { items: result.items, metrics: result.metrics }; // OcrResultItem { poly: [number, number][], text, score } already matches OcrBox
}
async function dispose() { if (engine) { await engine.dispose(); engine = null; } return true; }
self.onmessage = async (event: MessageEvent<PaddleRequest>) => {
  const message = event.data; const reply = (response: PaddleResponse) => self.postMessage(response);
  try {
    if (message.type === "init") reply({ id: message.id, ok: true, result: await init(message.payload) });
    else if (message.type === "predict") reply({ id: message.id, ok: true, result: await predict(message.payload) });
    else reply({ id: message.id, ok: true, result: await dispose() });
  } catch (error) { reply({ id: message.id, ok: false, error: error instanceof Error ? error.message : String(error) }); }
};
