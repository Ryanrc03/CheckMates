import { afterEach, expect, it, vi } from "vitest";
import { createReceiptRecognizer, type OcrWorker } from "./client";
afterEach(() => vi.useRealTimers());
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
function worker(text = "Soup 8.00") { return { recognize: async () => ({ data: { text, confidence: 90 } }), terminate: vi.fn(async () => {}) }; }
type Factory = Parameters<typeof createReceiptRecognizer>[0]["standard"];
const recognizer = (factory: Factory) => createReceiptRecognizer({ standard: factory, precise: factory });
it("returns real worker text and progress", async () => {
  const progress: unknown[] = []; const w = worker();
  const run = recognizer(async log => { log({ status: "loading", progress: 0.5 }); return w; });
  expect(await run(new Blob(), { signal: new AbortController().signal, onProgress: (s, p) => progress.push([s, p]) })).toEqual({ text: "Soup 8.00", confidence: 90 });
  expect(progress).toContainEqual(["loading", 0.5]); expect(w.terminate).toHaveBeenCalledOnce();
});
it("routes engine: precise to the precise factory with its own first stage and the abort signal", async () => {
  const stages: string[] = []; const standard = vi.fn(async () => worker("Standard 1.00")); const controller = new AbortController(); let seen: AbortSignal | undefined;
  const run = createReceiptRecognizer({ standard, precise: async (log, signal) => { seen = signal; log({ status: "Downloading precise recognition model", progress: 0.25 }); return worker("Precise 2.00"); } });
  expect((await run(new Blob(), { signal: controller.signal, onProgress: s => void stages.push(s), engine: "precise" })).text).toBe("Precise 2.00");
  expect(stages[0]).toBe("Preparing precise recognition"); expect(stages).toContain("Downloading precise recognition model"); expect(seen).toBe(controller.signal); expect(standard).not.toHaveBeenCalled();
  const plain: string[] = []; expect((await run(new Blob(), { signal: new AbortController().signal, onProgress: s => void plain.push(s) })).text).toBe("Standard 1.00"); expect(plain[0]).toBe("Loading recognition resources");
});
it("cancels initialization promptly and releases a late worker", async () => {
  const init = deferred<OcrWorker>(); const w = worker(); const controller = new AbortController();
  const run = recognizer(() => init.promise); const job = run(new Blob(), { signal: controller.signal, onProgress: () => {} });
  controller.abort(); await expect(job).rejects.toMatchObject({ name: "AbortError" }); init.resolve(w); await Promise.resolve(); await Promise.resolve();
  expect(w.terminate).toHaveBeenCalledOnce();
});
it("supersedes requests and suppresses late progress", async () => {
  const result = deferred<{ data: { text: string; confidence: number } }>(); const first = { ...worker(), recognize: () => result.promise };
  let logger: ((m: { status: string; progress?: number }) => void) | undefined; let count = 0; const progress = vi.fn();
  const run = recognizer(async log => { if (count++ === 0) { logger = log; return first; } return worker("Tea 4.00"); });
  const one = run(new Blob(), { signal: new AbortController().signal, onProgress: progress }); await Promise.resolve();
  const rejected = expect(one).rejects.toMatchObject({ name: "AbortError" });
  const two = run(new Blob(), { signal: new AbortController().signal, onProgress: () => {} }); await rejected;
  const calls = progress.mock.calls.length; logger?.({ status: "late", progress: 1 }); result.resolve({ data: { text: "old", confidence: 1 } });
  expect((await two).text).toBe("Tea 4.00"); expect(progress.mock.calls).toHaveLength(calls);
});
it("handles blank text, initialization failure and timeout", async () => {
  const opts = { signal: new AbortController().signal, onProgress: () => {} };
  await expect(recognizer(async () => worker("  "))(new Blob(), opts)).rejects.toThrow(/text/i);
  await expect(recognizer(async () => { throw Error("missing model"); })(new Blob(), opts)).rejects.toThrow(/missing model/);
  vi.useFakeTimers(); const init = deferred<OcrWorker>(); const run = recognizer(() => init.promise); const pending = run(new Blob(), opts);
  const rejected = expect(pending).rejects.toThrow(/120 seconds/); await vi.advanceTimersByTimeAsync(120000); await rejected;
  const w = worker(); init.resolve(w); await Promise.resolve(); await Promise.resolve(); expect(w.terminate).toHaveBeenCalledOnce();
});
