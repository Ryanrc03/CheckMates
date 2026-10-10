import type { OcrWorker } from "./client";
import { normalizeOcrLines } from "./normalizeLines";
type Progress = { status: string; progress?: number };
type Transport = { postMessage: (message: unknown) => void; terminate: () => void; onmessage: ((event: MessageEvent) => void) | null; onerror: ((event: ErrorEvent) => void) | null };

/** Own the native worker before initialization. Tesseract 6.0.1's createWorker
 * does not expose termination until initialization succeeds, and can leave its
 * initialization promise pending after loadLanguage failure. This adapter uses
 * that pinned worker's load/loadLanguage/initialize/recognize protocol directly.
 * OCR itself is the unmodified, same-origin Tesseract.js worker + WASM engine.
 */
export function createBrowserWorker(logger: (message: Progress) => void, transport: Transport = new Worker("/ocr/worker.min.js"), origin = window.location.origin): OcrWorker {
  let serial = 0; let stopped = false;
  let initialized: Promise<void> | null = null;
  const jobs = new Map<string, { resolve: (data: unknown) => void; reject: (error: Error) => void }>();
  function failAll(error: Error) { for (const job of jobs.values()) job.reject(error); jobs.clear(); }
  transport.onmessage = ({ data }) => {
    if (stopped) return;
    if (data.status === "progress") { logger(data.data as Progress); return; }
    const job = jobs.get(data.jobId); if (!job) return;
    jobs.delete(data.jobId);
    if (data.status === "resolve") job.resolve(data.data);
    else job.reject(new Error(`Recognition resource or engine error: ${String(data.data)}. Retry or enter items manually.`));
  };
  transport.onerror = event => failAll(new Error(event.message || "Recognition worker could not load. Retry or enter items manually."));
  function send(action: string, payload: unknown): Promise<unknown> {
    if (stopped) return Promise.reject(new DOMException("Recognition canceled", "AbortError"));
    const jobId = `bitesplit-${++serial}`;
    return new Promise((resolve, reject) => { jobs.set(jobId, { resolve, reject }); transport.postMessage({ workerId: "bitesplit", jobId, action, payload }); });
  }
  return {
    async recognize(image, scan) {
      initialized ??= (async () => {
        await send("load", { options: { lstmOnly: true, corePath: `${origin}/ocr`, logging: false } });
        await send("loadLanguage", { langs: "eng", options: { langPath: `${origin}/ocr`, cachePath: "bitesplit-eng-1.0.0-best-int", cacheMethod: "write", gzip: true, lstmOnly: true } });
        await send("initialize", { langs: "eng", oem: 1, config: {} });
      })();
      await initialized;
      const bytes = new Uint8Array(await image.arrayBuffer());
      const data = await send("recognize", { image: bytes, options: scan?.pageSegMode ? {tessedit_pageseg_mode:String(scan.pageSegMode)} : {}, output: { text: true, blocks: true } }) as { text: string; confidence: number; blocks?:unknown };
      const lines=normalizeOcrLines(data.blocks);
      return { data: {text:data.text,confidence:data.confidence,...(lines.length?{lines}:{})} };
    },
    async terminate() { if (!stopped) { stopped = true; transport.terminate(); failAll(new DOMException("Recognition canceled", "AbortError")); transport.onmessage = null; transport.onerror = null; } },
  };
}
