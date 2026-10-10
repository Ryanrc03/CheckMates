import { describe, expect, it, vi } from "vitest";
import { createTranslationStore } from "./useTranslationStore";
import type { TranslateOptions, TranslateOutcome, TranslationService, TranslatedItem } from "@/lib/translation/types";
function fakeService(overrides: Partial<TranslationService> = {}): TranslationService & { calls: number } {
  const service = { calls: 0,
    getCapabilities: async () => ({ modelAvailable: true, modelCached: false, downloadBytes: 57000000 }),
    translateDishes: async (items, options) => { service.calls++; const out: TranslatedItem[] = items.filter(i => i.name === "Milk Tea").map(i => ({ id: i.id, sourceText: i.name, translatedText: "奶茶", provider: "glossary" as const, revision: "r" })); out.forEach(o => options.onItem?.(o)); if (options.allowModel) { const model = items.filter(i => i.name !== "Milk Tea").map(i => ({ id: i.id, sourceText: i.name, translatedText: "模", provider: "model" as const, revision: "r" })); model.forEach(o => options.onItem?.(o)); return { items: [...out, ...model], error: null }; } return { items: out, error: null }; },
    setOcrBusy: async () => {}, cancelTranslations: async () => {}, clearCache: () => {}, dispose: async () => {}, ...overrides } as TranslationService & { calls: number };
  return service;
}
const storage = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) }; };
describe("translation store", () => {
  it("persists the toggle, shows local results, and asks for download when the model is needed but not allowed", async () => {
    const s = storage(); const store = createTranslationStore(fakeService(), s);
    store.getState().setEnabled(true); expect(s.getItem("bitesplit-translation-enabled")).toBe("1");
    await store.getState().request([{ id: "a", name: "Milk Tea" }, { id: "b", name: "Durian" }]);
    expect(store.getState().results.a?.translatedText).toBe("奶茶"); expect(store.getState().results.b).toBeUndefined(); expect(store.getState().needsDownload).toBe(true); expect(store.getState().downloadBytes).toBe(57000000);
  });
  it("allows the model after consent and keeps only results whose source matches the current name", async () => {
    const store = createTranslationStore(fakeService(), storage()); store.getState().setEnabled(true);
    await store.getState().allowModelAndRequest([{ id: "b", name: "Durian" }]); expect(store.getState().results.b?.translatedText).toBe("模"); expect(store.getState().needsDownload).toBe(false);
    store.getState().invalidate("b"); expect(store.getState().results.b).toBeUndefined();
  });
  it("uses an already cached model without asking for a download", async () => {
    const service = fakeService({ getCapabilities: async () => ({ modelAvailable: true, modelCached: true, downloadBytes: 57000000 }) }); const allowed: boolean[] = []; const inner = service.translateDishes;
    service.translateDishes = (items, options) => { allowed.push(options.allowModel); return inner(items, options); };
    const store = createTranslationStore(service, storage()); store.getState().setEnabled(true);
    await store.getState().request([{ id: "b", name: "Durian" }]); expect(allowed).toEqual([true]); expect(store.getState().results.b?.translatedText).toBe("模"); expect(store.getState().needsDownload).toBe(false);
  });
  it("ignores results from a superseded request", async () => {
    let release: (() => void) | null = null; let calls = 0;
    const slow = fakeService({ translateDishes: async (items, options) => { if (calls++) return { items: [], error: null }; await new Promise<void>(r => { release = r; }); options.onItem?.({ id: items[0].id, sourceText: items[0].name, translatedText: "旧", provider: "model", revision: "r" }); return { items: [], error: null }; } });
    const store = createTranslationStore(slow, storage()); store.getState().setEnabled(true);
    const first = store.getState().request([{ id: "a", name: "Durian" }]); await vi.waitFor(() => { if (!release) throw new Error("first request has not reached the service yet"); });
    await store.getState().request([{ id: "a", name: "Mango" }]); release!(); await first;
    expect(store.getState().results.a).toBeUndefined(); expect(store.getState().busy).toBe(false);
  });
  it("queues a newer request behind a model download instead of restarting it, and supersedes only the queued run", async () => {
    const calls: TranslateOptions[] = []; const done: number[] = []; let release: (() => void) | null = null; let chain: Promise<void> = Promise.resolve(); const canceled = () => new DOMException("Translation canceled.", "AbortError");
    const queued = fakeService({ translateDishes: (items, options) => { const n = calls.push(options); const job = chain.then(async () => { // like the real service: one model job at a time, in arrival order, each checking its signal
      if (options.signal.aborted) throw canceled();
      if (n === 1) { options.onProgress?.({ stage: "downloading", loadedBytes: 0, totalBytes: 10 }); await new Promise<void>(r => { release = r; }); options.onProgress?.({ stage: "initializing" }); }
      options.onProgress?.({ stage: "translating", completedItems: 0, totalItems: 1 }); if (options.signal.aborted) throw canceled();
      items.forEach(i => options.onItem?.({ id: i.id, sourceText: i.name, translatedText: `模${n}`, provider: "model", revision: "r" })); done.push(n); return { items: [], error: null }; }); chain = job.then(() => undefined, () => undefined); return job; } });
    const store = createTranslationStore(queued, storage()); store.getState().setEnabled(true);
    const first = store.getState().allowModelAndRequest([{ id: "a", name: "Durian" }]); await vi.waitFor(() => { if (!release) throw new Error("not downloading yet"); });
    const second = store.getState().request([{ id: "a", name: "Mango" }]); await vi.waitFor(() => expect(calls).toHaveLength(2));
    expect(calls.map(c => c.signal.aborted)).toEqual([false, false]);
    calls[0].onProgress?.({ stage: "downloading", loadedBytes: 5, totalBytes: 10 }); expect(store.getState()).toMatchObject({ busy: true, progress: { stage: "downloading", loadedBytes: 5, totalBytes: 10 } }); // the superseded download keeps reporting
    const third = store.getState().request([{ id: "a", name: "Papaya" }]); await vi.waitFor(() => expect(calls).toHaveLength(3));
    expect(calls.map(c => c.signal.aborted)).toEqual([false, true, false]); // the queued run is cheap to drop; the download is not
    release!(); await Promise.all([first, second, third]);
    expect(calls[0].signal.aborted).toBe(true); expect(done).toEqual([3]); // once the model is warm the loader bows out and only the newest names are translated
    expect(store.getState()).toMatchObject({ busy: false, progress: null, pending: {}, results: { a: { sourceText: "Papaya", translatedText: "模3" } } });
  });
  it("cancel also stops a download that a newer request queued behind", async () => {
    const signals: AbortSignal[] = [];
    const slow = fakeService({ translateDishes: (_items, options) => new Promise<TranslateOutcome>((_, reject) => { if (signals.push(options.signal) === 1) options.onProgress?.({ stage: "downloading", loadedBytes: 0, totalBytes: 10 }); options.signal.addEventListener("abort", () => reject(new DOMException("Translation canceled.", "AbortError")), { once: true }); }) });
    const store = createTranslationStore(slow, storage()); store.getState().setEnabled(true);
    const first = store.getState().allowModelAndRequest([{ id: "a", name: "Durian" }]); await vi.waitFor(() => expect(store.getState().progress?.stage).toBe("downloading"));
    const second = store.getState().request([{ id: "a", name: "Mango" }]); await vi.waitFor(() => expect(signals).toHaveLength(2)); expect(signals[0].aborted).toBe(false);
    store.getState().cancel(); await Promise.all([first, second]);
    expect(signals.map(s => s.aborted)).toEqual([true, true]); expect(store.getState()).toMatchObject({ busy: false, progress: null, pending: {}, modelAllowed: false, needsDownload: true, error: null });
  });
  it("cancelling withdraws model consent and offers the download again for the items still pending", async () => {
    let release: (() => void) | null = null;
    const slow = fakeService({ translateDishes: async (items, options) => { if (!options.allowModel) return { items: [], error: null }; options.onProgress?.({ stage: "downloading", loadedBytes: 0, totalBytes: 10 }); await new Promise<void>((_, reject) => { release = () => reject(new DOMException("Translation canceled.", "AbortError")); options.signal.addEventListener("abort", release, { once: true }); }); return { items: [], error: null }; } });
    const store = createTranslationStore(slow, storage()); store.getState().setEnabled(true);
    const run = store.getState().allowModelAndRequest([{ id: "a", name: "Durian" }]); await vi.waitFor(() => { if (!release) throw new Error("not downloading yet"); });
    expect(store.getState().busy).toBe(true); expect(store.getState().progress?.stage).toBe("downloading"); expect(store.getState().pending.a).toBe(true);
    store.getState().cancel(); await run;
    expect(store.getState()).toMatchObject({ busy: false, progress: null, pending: {}, modelAllowed: false, needsDownload: true, error: null });
  });
  it("forgetModel withdraws consent, disposes the engine, empties the phrase cache, and asks for the download again", async () => {
    let cancelled = 0; let cleared = 0; const service = fakeService({ cancelTranslations: async () => { cancelled++; }, clearCache: () => { cleared++; } });
    const store = createTranslationStore(service, storage()); store.getState().setEnabled(true);
    await store.getState().allowModelAndRequest([{ id: "b", name: "Durian" }]); expect(store.getState()).toMatchObject({ modelAllowed: true, results: { b: { translatedText: "模" } } });
    store.getState().forgetModel(); expect(cancelled).toBe(1); expect(cleared).toBe(1);
    expect(store.getState()).toMatchObject({ modelAllowed: false, results: {}, pending: {}, busy: false, progress: null, error: null, needsDownload: false });
    await store.getState().request([{ id: "b", name: "Durian" }]); expect(store.getState().results.b).toBeUndefined(); expect(store.getState().needsDownload).toBe(true); // the removed model is neither used silently nor re-downloaded without consent
  });
  it("does nothing while disabled and clears for a new bill", async () => {
    const service = fakeService(); const store = createTranslationStore(service, storage()); await store.getState().request([{ id: "a", name: "Milk Tea" }]); expect(service.calls).toBe(0);
    store.getState().setEnabled(true); await store.getState().request([{ id: "a", name: "Milk Tea" }]); expect(store.getState().results.a).toBeTruthy(); store.getState().clearForBill(); expect(store.getState().results).toEqual({});
  });
});
