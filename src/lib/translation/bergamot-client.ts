import type { BundleHandle } from "@/lib/model-assets/types";
export const MODEL_FILES = { model: "model.enzh.intgemm.alphas.bin", lex: "lex.50.50.enzh.s2t.bin", srcvocab: "srcvocab.enzh.spm", trgvocab: "trgvocab.enzh.spm", wasm: "runtime/bergamot-translator-v0.6.0.wasm", worker: "runtime/translator-worker.js" } as const;
export type BergamotEngine = { translate(texts: string[]): Promise<string[]>; dispose(): Promise<void> };
export type BergamotTransport = { postMessage(message: unknown, transfer?: Transferable[]): void; terminate(): void; onmessage: ((event: MessageEvent) => void) | null; onerror: ((event: ErrorEvent) => void) | null };
const canceled = () => new DOMException("Translation canceled.", "AbortError");
// Protocol with vendor/bergamot/translator-worker.js: { id, name, args } -> { id, result } | { id, error: { name, message } }; replies for unknown ids (late, after disposal) are ignored
export async function createBergamotEngine(handle: BundleHandle, options: { signal?: AbortSignal; createTransport?: (url: string) => BergamotTransport } = {}): Promise<BergamotEngine> {
  const transport = (options.createTransport ?? (url => new Worker(/* turbopackIgnore: true */ url)))(handle.url(MODEL_FILES.worker)); // classic worker served from /models/…, never bundled
  let serial = 0; let dead = null as Error | null; const pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
  const failAll = (error: Error) => { dead = error; for (const job of pending.values()) job.reject(error); pending.clear(); };
  transport.onmessage = ({ data }) => { const job = pending.get(data?.id); if (!job) return; pending.delete(data.id); if (data.error) job.reject(new Error(data.error.message || "Translation engine error.")); else job.resolve(data.result); };
  transport.onerror = event => failAll(new Error(event.message || "Translation engine could not load."));
  const call = (name: string, args: unknown, transfer: Transferable[] = []) => new Promise<unknown>((resolve, reject) => { if (dead) return reject(dead); const id = ++serial; pending.set(id, { resolve, reject }); transport.postMessage({ id, name, args }, transfer); });
  const dispose = async () => { if (!dead) failAll(canceled()); transport.terminate(); }; // always terminate: onerror marks the engine dead without freeing the worker, and Worker.terminate() is idempotent
  const onAbort = () => { void dispose(); }; options.signal?.addEventListener("abort", onAbort, { once: true });
  try {
    if (options.signal?.aborted) throw canceled();
    const [wasm, model, lex, srcvocab, trgvocab] = await Promise.all([handle.bytes(MODEL_FILES.wasm), handle.bytes(MODEL_FILES.model), handle.bytes(MODEL_FILES.lex), handle.bytes(MODEL_FILES.srcvocab), handle.bytes(MODEL_FILES.trgvocab)]);
    await call("initialize", { wasm }, [wasm]);
    await call("loadModel", { model, lex, vocabs: [srcvocab, trgvocab], from: "en", to: "zh" }, [model, lex, srcvocab, trgvocab]);
    await call("translate", { texts: ["Fried rice"] }); // warm-up: the first translate call is the slow one
    if (options.signal?.aborted) throw canceled();
  } catch (error) {
    const aborted = dead?.name === "AbortError" ? dead : null; // decide before dispose(), which itself marks the engine dead with an AbortError
    await dispose(); throw aborted ?? error;
  } finally { options.signal?.removeEventListener("abort", onAbort); }
  return { translate: async texts => (await call("translate", { texts })) as string[], dispose };
}
