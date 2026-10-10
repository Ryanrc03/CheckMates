import { ensureBundle } from "@/lib/model-assets/bundles";
import type { BundleHandle } from "@/lib/model-assets/types";
import type { OcrWorker } from "../client";
import { PADDLE_MODELS, type PaddlePredictResult, type PaddleRequest, type PaddleResponse } from "./protocol";
import { spatialRows } from "./spatial";
export type PaddleTransport = { postMessage(message: PaddleRequest): void; terminate(): void; onmessage: ((event: MessageEvent<PaddleResponse>) => void) | null; onerror: ((event: ErrorEvent) => void) | null };
type Logger = (message: { status: string; progress?: number }) => void;
type PaddleCall = PaddleRequest extends infer R ? R extends PaddleRequest ? Omit<R, "id"> : never : never; // distributive: a plain Omit over the union would drop payload
const canceled = () => new DOMException("Recognition canceled", "AbortError");
const hint = (message: string) => `Precise recognition failed: ${message}. Try the standard engine or enter items manually.`;
export function createPaddleWorker(handle: BundleHandle, logger: Logger, createTransport: () => PaddleTransport = () => new Worker(new URL("./paddle.worker.ts", import.meta.url), { type: "module" })): OcrWorker {
  let transport: PaddleTransport | null = null; let serial = 0; let dead: Error | null = null; let ready: Promise<void> | null = null;
  const pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
  const failAll = (error: Error) => { dead = error; for (const job of pending.values()) job.reject(error); pending.clear(); };
  const call = (message: PaddleCall) => new Promise<unknown>((resolve, reject) => {
    if (dead) return reject(dead);
    if (!transport) { transport = createTransport(); transport.onmessage = ({ data }) => { const job = pending.get(data.id); if (!job) return; pending.delete(data.id); if (data.ok) job.resolve(data.result); else job.reject(new Error(hint(data.error))); }; transport.onerror = event => failAll(new Error(hint(event.message || "worker could not load"))); }
    const id = ++serial; pending.set(id, { resolve, reject }); transport.postMessage({ ...message, id } as PaddleRequest);
  });
  const initialize = () => ready ??= (async () => { logger({ status: "Starting precise recognition" }); await call({ type: "init", payload: { cacheName: handle.cacheName, detUrl: handle.url(PADDLE_MODELS.detFile), recUrl: handle.url(PADDLE_MODELS.recFile), wasmPaths: handle.url(PADDLE_MODELS.ortDir) } }); handle.touch(); })();
  return {
    async recognize(image) {
      await initialize(); logger({ status: "Recognizing (precise)" });
      const result = await call({ type: "predict", payload: image }) as PaddlePredictResult; const rows = spatialRows(result.items);
      return { data: { text: rows.text, confidence: Math.round(rows.meanScore * 100), lines: rows.lines.map(l => ({ text: l.text, confidence: Math.round(l.confidence * 100), bbox: l.bbox, words: [] })) } };
    },
    async terminate() { if (!dead) failAll(canceled()); transport?.terminate(); transport = null; }, // always terminate: onerror marks the adapter dead without freeing the worker
  };
}
export async function createPreciseWorker(logger: Logger, signal?: AbortSignal): Promise<OcrWorker> {
  const handle = await ensureBundle("ocr-precise", { signal, onProgress: p => logger({ status: p.stage === "ready" ? "Starting precise recognition" : "Downloading precise recognition model", progress: p.totalBytes ? p.loadedBytes / p.totalBytes : undefined }) });
  return createPaddleWorker(handle, logger);
}
