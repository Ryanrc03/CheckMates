import { ensureBundle as defaultEnsure, getBundleStatus as defaultStatus } from "@/lib/model-assets/bundles";
import type { BundleHandle, BundleStatus } from "@/lib/model-assets/types";
import { createBergamotEngine, type BergamotEngine } from "./bergamot-client";
import { createTranslationCache, type TranslationCache } from "./cache";
import { hasWasmSimd, hasWorkers } from "./capabilities";
import { GLOSSARY_VERSION } from "./glossary-data";
import { translationKey } from "./normalize";
import { planTranslation, sanitizeModelOutput, type PhraseTranslation } from "./pipeline";
import { MAX_ITEMS, type TranslateOptions, type TranslateOutcome, type TranslatedItem, type TranslationCapabilities, type TranslationItem, type TranslationService } from "./types";
export const MODEL_VERSION = "translate-enzh@2.2-b0.6.0";
export const REVISION = `${GLOSSARY_VERSION}|${MODEL_VERSION}`;
export type EngineDetection = { ok: boolean; reason?: "wasm-simd" | "worker" };
export type TranslationServiceDeps = { cache?: TranslationCache; ensure?: (id: "translate-enzh", options: { signal?: AbortSignal; onProgress?: (p: { stage: string; loadedBytes: number; totalBytes: number }) => void }) => Promise<BundleHandle>; status?: (id: "translate-enzh") => Promise<BundleStatus>; createEngine?: (handle: BundleHandle, signal: AbortSignal) => Promise<BergamotEngine>; capabilities?: () => EngineDetection };
type Use = { key: string; compose: (output: string) => PhraseTranslation; items: TranslationItem[] }; // one cache key (e.g. "no durian") and every item that spelled it
type ModelGroup = { modelInput: string; uses: Use[] }; // one model call (e.g. "Durian") shared by every key whose core is that phrase
const aborted = () => new DOMException("Translation canceled.", "AbortError");
const detectEngine = (): EngineDetection => !hasWorkers() ? { ok: false, reason: "worker" } : !hasWasmSimd() ? { ok: false, reason: "wasm-simd" } : { ok: true };
export function createTranslationService(deps: TranslationServiceDeps = {}): TranslationService {
  const cache = deps.cache ?? createTranslationCache(typeof window === "undefined" ? null : window.localStorage);
  const ensure = deps.ensure ?? ((id, options) => defaultEnsure(id, options)); const status = deps.status ?? (id => defaultStatus(id));
  const createEngine = deps.createEngine ?? ((handle, signal) => createBergamotEngine(handle, { signal })); const capabilities = deps.capabilities ?? detectEngine;
  let engine: BergamotEngine | null = null; let ocrBusy = false; let resume: (() => void) | null = null; let waiting: Promise<void> = Promise.resolve(); let chain: Promise<void> = Promise.resolve();
  const controllers = new Set<AbortController>();
  const abortAll = () => { for (const c of controllers) c.abort(); controllers.clear(); };
  const disposeEngine = async () => { const current = engine; engine = null; await current?.dispose(); };
  const waitForOcr = (signal: AbortSignal) => new Promise<void>(resolve => { const done = () => { signal.removeEventListener("abort", done); resolve(); }; signal.addEventListener("abort", done, { once: true }); void waiting.then(done); }); // reads `waiting` on each call, so a request sees the promise setOcrBusy(true) installed after it was queued
  const setBusy = async (busy: boolean) => {
    ocrBusy = busy;
    if (busy) { if (!resume) waiting = new Promise<void>(r => { resume = r; }); abortAll(); await disposeEngine(); } // free the ~0.4 GB model before OCR; a repeated "busy" keeps the promise earlier waiters already hold
    else { resume?.(); resume = null; waiting = Promise.resolve(); }
  };
  const getEngine = async (signal: AbortSignal, onProgress: TranslateOptions["onProgress"]) => {
    if (engine) return engine;
    onProgress?.({ stage: "downloading", loadedBytes: 0 });
    const handle = await ensure("translate-enzh", { signal, onProgress: p => onProgress?.({ stage: "downloading", loadedBytes: p.loadedBytes, totalBytes: p.totalBytes }) });
    if (signal.aborted) throw aborted(); onProgress?.({ stage: "initializing" });
    const created = await createEngine(handle, signal); if (signal.aborted) { await created.dispose(); throw aborted(); }
    engine = created; handle.touch(); return created;
  };
  const remember = (key: string, result: PhraseTranslation) => cache.set(key, { text: result.text, provider: result.provider, revision: REVISION, at: Date.now() });
  const toItem = (item: TranslationItem, result: PhraseTranslation): TranslatedItem => ({ id: item.id, sourceText: item.name, translatedText: result.text, provider: result.provider, revision: REVISION });
  return {
    async getCapabilities(): Promise<TranslationCapabilities> {
      const detect = capabilities(); try { const s = await status("translate-enzh"); return { modelAvailable: detect.ok, modelCached: s.cached, downloadBytes: s.downloadBytes, reason: detect.ok ? undefined : detect.reason }; }
      catch { return { modelAvailable: false, modelCached: false, downloadBytes: 0, reason: "manifest" }; }
    },
    async translateDishes(items, options) {
      if (items.length > MAX_ITEMS) throw new Error(`At most ${MAX_ITEMS} items can be translated at once.`);
      const results: TranslatedItem[] = []; const groups = new Map<string, ModelGroup>(); const uses = new Map<string, Use>();
      const emit = (item: TranslationItem, result: PhraseTranslation) => { const out = toItem(item, result); results.push(out); options.onItem?.(out); };
      for (const item of items) {
        const key = translationKey(item.name); if (!key) continue;
        const cached = cache.get(key, REVISION); if (cached) { emit(item, { text: cached.text, provider: cached.provider }); continue; }
        const plan = planTranslation(item.name);
        if (plan.kind === "done") { remember(key, plan.result); emit(item, plan.result); continue; }
        if (plan.kind !== "model") continue;
        const use = uses.get(key); if (use) { use.items.push(item); continue; }
        const next: Use = { key, compose: plan.compose, items: [item] }; uses.set(key, next);
        const inputKey = translationKey(plan.modelInput); const group = groups.get(inputKey); if (group) group.uses.push(next); else groups.set(inputKey, { modelInput: plan.modelInput, uses: [next] });
      }
      if (!groups.size || !options.allowModel) return { items: results, error: null };
      const detect = capabilities(); if (!detect.ok) return { items: results, error: detect.reason === "wasm-simd" ? "This browser cannot run the on-device translation model (WebAssembly SIMD is unavailable)." : "This browser cannot run background translation." };
      const controller = new AbortController(); controllers.add(controller); const stop = () => controller.abort(); if (options.signal.aborted) stop(); else options.signal.addEventListener("abort", stop, { once: true });
      const run = async (): Promise<TranslateOutcome> => {
        options.onProgress?.({ stage: "queued" }); while (ocrBusy && !controller.signal.aborted) await waitForOcr(controller.signal); if (controller.signal.aborted) throw aborted();
        const active = await getEngine(controller.signal, options.onProgress); let completed = 0; const total = groups.size;
        for (const group of groups.values()) {
          if (controller.signal.aborted) throw aborted(); options.onProgress?.({ stage: "translating", completedItems: completed, totalItems: total });
          const [raw] = await active.translate([group.modelInput]); const output = sanitizeModelOutput(raw, group.modelInput); completed++;
          if (!output) continue; for (const use of group.uses) { const result = use.compose(output); remember(use.key, result); for (const item of use.items) emit(item, result); }
        }
        options.onProgress?.({ stage: "ready", completedItems: completed, totalItems: total }); return { items: results, error: null };
      };
      const job = chain.then(run, run); chain = job.then(() => undefined, () => undefined); // one model job at a time, in arrival order, however the previous one ended
      try { return await job; }
      catch (error) {
        if (controller.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) throw aborted();
        await disposeEngine(); // a failed engine would fail every retry; the next request rebuilds it
        return { items: results, error: error instanceof Error ? error.message : "Translation failed. Try again." };
      }
      finally { controllers.delete(controller); options.signal.removeEventListener("abort", stop); }
    },
    setOcrBusy: setBusy,
    seed(entries) { for (const entry of entries) { const key = translationKey(entry.name); const text = entry.text.trim(); if (key && text) remember(key, { text, provider: "llm" }); } },
    async cancelTranslations() { abortAll(); await disposeEngine(); },
    clearCache: () => cache.clear(), // the service owns the cache instance: clearing another instance would leave this one's in-memory copy to re-persist on its next save
    dispose: disposeEngine,
  };
}
let singleton: TranslationService | null = null;
export function getTranslationService(): TranslationService { return singleton ??= createTranslationService(); }
