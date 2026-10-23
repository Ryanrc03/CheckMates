import { describe, expect, it, vi } from "vitest";
import { createTranslationService } from "./service";
import { createTranslationCache, TRANSLATION_CACHE_KEY } from "./cache";
import type { BergamotEngine } from "./bergamot-client";
import type { BundleHandle, BundleStatus } from "@/lib/model-assets/types";
const handle = { id: "translate-enzh", version: "v", cacheName: "c", url: (p: string) => p, bytes: async () => new ArrayBuffer(1), fetch, touch: () => {} } as BundleHandle;
function deps(overrides: Partial<Parameters<typeof createTranslationService>[0]> = {}) {
  const translateCalls: string[][] = []; let disposed = 0;
  const engine: BergamotEngine = { translate: async texts => { translateCalls.push(texts); await new Promise(r => setTimeout(r, 2)); return texts.map(t => `模:${t}`); }, dispose: async () => { disposed++; } };
  const service = createTranslationService({ cache: createTranslationCache(null), ensure: vi.fn(async (_id, o) => { o?.onProgress?.({ stage: "downloading", loadedBytes: 1, totalBytes: 2 }); return handle; }), status: vi.fn(async () => ({ cached: true, downloadBytes: 57, version: "v" } as BundleStatus)), createEngine: vi.fn(async () => engine), capabilities: () => ({ ok: true }), ...overrides });
  return { service, translateCalls, disposed: () => disposed };
}
const opts = (extra: Partial<Parameters<ReturnType<typeof createTranslationService>["translateDishes"]>[1]> = {}) => ({ signal: new AbortController().signal, allowModel: true, ...extra });
describe("translation service", () => {
  it("answers glossary and rule items instantly and sends only unknown cores to the model, deduplicated", async () => {
    const { service, translateCalls } = deps(); const seen: string[] = [];
    const outcome = await service.translateDishes([{ id: "a", name: "Milk Tea" }, { id: "b", name: "No Durian" }, { id: "c", name: "Durian" }, { id: "d", name: "Durian" }], opts({ onItem: i => seen.push(i.id) }));
    expect(outcome.error).toBeNull(); expect(outcome.items.find(i => i.id === "a")).toMatchObject({ translatedText: "奶茶", provider: "glossary" });
    expect(outcome.items.find(i => i.id === "b")).toMatchObject({ translatedText: "不要模:Durian", provider: "model" }); expect(outcome.items.find(i => i.id === "d")?.translatedText).toBe("模:Durian");
    expect(translateCalls).toEqual([["Durian"]]); expect(seen[0]).toBe("a");
  });
  it("returns local results and a null model result without error when allowModel is false", async () => {
    const { service, translateCalls } = deps(); const outcome = await service.translateDishes([{ id: "a", name: "Milk Tea" }, { id: "b", name: "Durian" }], opts({ allowModel: false }));
    expect(outcome.items.map(i => i.id)).toEqual(["a"]); expect(outcome.error).toBeNull(); expect(translateCalls).toEqual([]);
  });
  it("reports a retryable error when the model cannot load but keeps local results", async () => {
    const { service } = deps({ createEngine: vi.fn(async () => { throw new Error("boom"); }) });
    const outcome = await service.translateDishes([{ id: "a", name: "Milk Tea" }, { id: "b", name: "Durian" }], opts());
    expect(outcome.items.map(i => i.id)).toEqual(["a"]); expect(outcome.error).toMatch(/boom/);
  });
  it("queues model work while OCR is busy and disposes the engine when OCR starts", async () => {
    const { service, disposed } = deps(); await service.translateDishes([{ id: "b", name: "Durian" }], opts());
    await service.setOcrBusy(true); expect(disposed()).toBe(1);
    const pending = service.translateDishes([{ id: "c", name: "Mangosteen" }], opts()); let settled = false; void pending.then(() => { settled = true; });
    await new Promise(r => setTimeout(r, 10)); expect(settled).toBe(false);
    await service.setOcrBusy(false); const outcome = await pending; expect(outcome.items[0].translatedText).toBe("模:Mangosteen");
  });
  it("serves a repeated phrase from the cache without calling the model again", async () => {
    const { service, translateCalls } = deps();
    const first = await service.translateDishes([{ id: "b", name: "Durian" }], opts()); const second = await service.translateDishes([{ id: "c", name: "durian " }], opts());
    expect(translateCalls).toEqual([["Durian"]]); expect(first.items[0]).toMatchObject({ translatedText: "模:Durian", provider: "model" }); expect(second.items[0]).toMatchObject({ sourceText: "durian ", translatedText: "模:Durian", provider: "model" });
  });
  it("clearCache empties the service's own cache, so its next save cannot resurrect removed phrases", async () => {
    const map = new Map<string, string>(); const storage = { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v), removeItem: (k: string) => void map.delete(k) };
    const { service, translateCalls } = deps({ cache: createTranslationCache(storage) });
    await service.translateDishes([{ id: "b", name: "Durian" }], opts()); expect(Object.keys(JSON.parse(map.get(TRANSLATION_CACHE_KEY)!).entries)).toEqual(["durian"]);
    service.clearCache(); expect(map.has(TRANSLATION_CACHE_KEY)).toBe(false);
    await service.translateDishes([{ id: "c", name: "Mangosteen" }], opts()); expect(Object.keys(JSON.parse(map.get(TRANSLATION_CACHE_KEY)!).entries)).toEqual(["mangosteen"]); // the in-memory copy went too, not only the storage key
    await service.translateDishes([{ id: "d", name: "durian" }], opts()); expect(translateCalls).toEqual([["Durian"], ["Mangosteen"], ["durian"]]);
  });
  it("cancelTranslations rejects a request waiting behind OCR right away, before any engine work", async () => {
    const ensure = vi.fn(async () => handle); const { service, translateCalls } = deps({ ensure }); await service.setOcrBusy(true);
    const promise = service.translateDishes([{ id: "b", name: "Durian" }], opts()); await new Promise(r => setTimeout(r, 1)); await service.cancelTranslations();
    await expect(promise).rejects.toMatchObject({ name: "AbortError" }); // OCR is still busy here, so the rejection cannot have waited for it
    expect(ensure).not.toHaveBeenCalled(); expect(translateCalls).toEqual([]); await service.setOcrBusy(false);
  });
  it("rejects with AbortError before any engine work when options.signal is already aborted", async () => {
    const ensure = vi.fn(async () => handle); const { service, translateCalls } = deps({ ensure }); const controller = new AbortController(); controller.abort();
    await expect(service.translateDishes([{ id: "b", name: "Durian" }], opts({ signal: controller.signal }))).rejects.toMatchObject({ name: "AbortError" });
    expect(ensure).not.toHaveBeenCalled(); expect(translateCalls).toEqual([]);
  });
  it("cancelTranslations rejects active and queued requests with AbortError", async () => {
    const { service } = deps({ createEngine: vi.fn(async () => { await new Promise(r => setTimeout(r, 50)); throw new Error("too slow"); }) });
    const active = service.translateDishes([{ id: "b", name: "Durian" }], opts()); const queued = service.translateDishes([{ id: "c", name: "Mangosteen" }], opts()); await new Promise(r => setTimeout(r, 1)); await service.cancelTranslations();
    await Promise.all([expect(active).rejects.toMatchObject({ name: "AbortError" }), expect(queued).rejects.toMatchObject({ name: "AbortError" })]);
  });
  it("drops a failed engine so the next request rebuilds it instead of reusing the dead one", async () => {
    let calls = 0; const createEngine = vi.fn(async () => ({ translate: async (texts: string[]) => { if (++calls === 1) throw new Error("worker crashed"); return texts.map(t => `模:${t}`); }, dispose: async () => {} }));
    const { service } = deps({ createEngine });
    expect((await service.translateDishes([{ id: "b", name: "Durian" }], opts())).error).toMatch(/worker crashed/);
    const retry = await service.translateDishes([{ id: "b", name: "Durian" }], opts()); expect(retry.error).toBeNull(); expect(retry.items[0].translatedText).toBe("模:Durian"); expect(createEngine).toHaveBeenCalledTimes(2);
  });
  it("rejects more than 50 items and skips names over 120 characters", async () => {
    const { service } = deps(); await expect(service.translateDishes(Array.from({ length: 51 }, (_, i) => ({ id: String(i), name: "Milk Tea" })), opts())).rejects.toThrow(/50/);
    const outcome = await service.translateDishes([{ id: "x", name: "y".repeat(121) }], opts()); expect(outcome.items).toEqual([]);
  });
  it("reports capabilities from detection and bundle status", async () => {
    const { service } = deps({ capabilities: () => ({ ok: false, reason: "wasm-simd" }) }); expect(await service.getCapabilities()).toMatchObject({ modelAvailable: false, reason: "wasm-simd", modelCached: true, downloadBytes: 57 });
  });
  it("serves seeded cloud translations from its cache before the glossary or the model", async () => {
    const { service, translateCalls } = deps(); service.seed([{ name: "Pad Kra Pow", text: "打抛饭 (鸡肉)" }, { name: "Milk Tea", text: "港式奶茶" }, { name: "  ", text: "空" }, { name: "Rice", text: " " }]);
    const outcome = await service.translateDishes([{ id: "a", name: "pad  kra pow" }, { id: "b", name: "Milk Tea" }], opts());
    expect(outcome.items.find(i => i.id === "a")).toMatchObject({ translatedText: "打抛饭 (鸡肉)", provider: "llm" }); expect(outcome.items.find(i => i.id === "b")?.translatedText).toBe("港式奶茶"); expect(translateCalls).toEqual([]);
  });
});
