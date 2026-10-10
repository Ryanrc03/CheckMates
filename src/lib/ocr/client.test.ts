import { afterEach, expect, it, vi } from "vitest";
import { createReceiptRecognizer, type OcrWorker } from "./client";
afterEach(() => vi.useRealTimers());
type Factory = Parameters<typeof createReceiptRecognizer>[0]["standard"];
const recognizer = (factory: Factory) => createReceiptRecognizer({ standard: factory, precise: factory });
const both = (factory: Factory) => ({ standard: factory, precise: factory });
it("rescans an inconsistent ledger even when all financial fields were identified",async()=>{
 let calls=0;
 const texts=["Soup $20.00\nSubtotal $20.00\nTax $1.05\nTotal $21.65","Subtotal $20.00\nTax $1.65\nTotal $21.65","Subtotal $20.00\nTax $1.65\nTotal $21.65"];
 const run=createReceiptRecognizer(both(async()=>({recognize:async()=>({data:{text:texts[calls++],confidence:90}}),terminate:async()=>{}})),async()=>new Blob());
 const result=await run(new Blob(),{signal:new AbortController().signal,onProgress:()=>{}});
 expect(calls).toBe(3);expect(result.financialScans).toHaveLength(2);
});
it("automatically reads missing financial fields without replacing dish evidence",async()=>{
 let calls=0;const w={recognize:async()=>({data:{text:++calls===1?"Soup $8.00":"Subtotal $8.00\nTax $0.48\nTotal $8.48",confidence:80}}),terminate:vi.fn(async()=>{})};
 const prepare=vi.fn(async()=>new Blob());const run=createReceiptRecognizer(both(async()=>w),prepare);
 const result=await run(new Blob(),{signal:new AbortController().signal,onProgress:()=>{}});
 expect(calls).toBe(2);expect(prepare).toHaveBeenCalledOnce();expect(result.text).toBe("Soup $8.00");expect(result.financialScans?.[0].text).toContain("Tax $0.48");
});
it("cancels a pending automatic tax pass within the same request",async()=>{
 const pendingScan=deferred<{data:{text:string;confidence:number}}>();let calls=0;
 const w={recognize:async()=>++calls===1?{data:{text:"Soup $8.00",confidence:80}}:pendingScan.promise,terminate:vi.fn(async()=>{})};
 const run=createReceiptRecognizer(both(async()=>w),async()=>new Blob()),controller=new AbortController();
 const job=run(new Blob(),{signal:controller.signal,onProgress:()=>{}});
 while(calls<2)await Promise.resolve();controller.abort();await expect(job).rejects.toMatchObject({name:"AbortError"});expect(w.terminate).toHaveBeenCalledOnce();
 pendingScan.resolve({data:{text:"Tax $0.48",confidence:80}});
});
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
function worker(text = "Soup 8.00") { return { recognize: async () => ({ data: { text, confidence: 90 } }), terminate: vi.fn(async () => {}) }; }
it("enhanced scan attempts at most one candidate and shares the existing deadline",async()=>{
 let calls=0;const run=recognizer(async()=>({recognize:async()=>{calls++;return {data:{text:"Soup $8.00",confidence:50}};},terminate:async()=>{}}));
 await run(new Blob(),{signal:new AbortController().signal,onProgress:()=>{},enhanced:true});expect(calls).toBe(2);
});
it("times out a pending enhanced candidate at the original deadline",async()=>{
 vi.useFakeTimers();let calls=0;const candidate=deferred<{data:{text:string;confidence:number}}>();
 const run=recognizer(async()=>({recognize:async()=>++calls===1?{data:{text:"Soup $8.00",confidence:50}}:candidate.promise,terminate:async()=>{}}));
 const pending=run(new Blob(),{signal:new AbortController().signal,onProgress:()=>{},enhanced:true});
 const rejected=expect(pending).rejects.toThrow(/120 seconds/);await vi.advanceTimersByTimeAsync(120000);await rejected;expect(calls).toBe(2);
});
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
