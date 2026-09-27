type ProgressMessage = { status: string; progress?: number };
export type OcrWorker = { recognize: (image: Blob) => Promise<{ data: { text: string; confidence: number } }>; terminate: () => Promise<unknown> };
type Options = { signal: AbortSignal; onProgress: (stage: string, progress: number | null) => void };
type Factory = (logger: (message: ProgressMessage) => void) => Promise<OcrWorker>;
const aborted = () => new DOMException("Recognition canceled. You can select another photo or enter items manually.", "AbortError");

export function createReceiptRecognizer(factory: Factory) {
  let cancelActive: (() => void) | null = null;
  return async (image: Blob, { signal, onProgress }: Options): Promise<{ text: string; confidence: number }> => {
    cancelActive?.();
    if (signal.aborted) throw aborted();
    let ended = false; let worker: OcrWorker | null = null; let terminated = false;
    const release = () => { if (worker && !terminated) { terminated = true; void worker.terminate().catch(() => {}); } };
    let rejectStop!: (error: Error) => void;
    const stop = new Promise<never>((_, reject) => { rejectStop = reject; });
    const cancel = () => { ended = true; release(); rejectStop(aborted()); };
    cancelActive = cancel; signal.addEventListener("abort", cancel, { once: true });
    const timer = setTimeout(() => { ended = true; release(); rejectStop(new Error("Recognition exceeded 120 seconds. Try a smaller, clearer photo or enter items manually.")); }, 120000);
    const work = (async () => {
      onProgress("Loading recognition resources", null);
      worker = await factory(message => { if (!ended) onProgress(message.status, typeof message.progress === "number" && Number.isFinite(message.progress) ? Math.max(0, Math.min(1, message.progress)) : null); });
      if (ended) { release(); throw aborted(); }
      const { data } = await worker.recognize(image);
      if (ended) throw aborted();
      if (!data.text.trim()) throw new Error("No text found. Try a clearer receipt photo or enter items manually.");
      return { text: data.text, confidence: data.confidence };
    })();
    try { return await Promise.race([work, stop]); }
    finally { ended = true; clearTimeout(timer); signal.removeEventListener("abort", cancel); release(); if (cancelActive === cancel) cancelActive = null; }
  };
}
export const recognizeReceipt = createReceiptRecognizer(async logger => {
  const { createBrowserWorker } = await import("./worker");
  return createBrowserWorker(logger);
});
