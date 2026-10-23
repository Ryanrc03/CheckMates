import { create } from "zustand";
import type { StorageLike } from "@/lib/model-assets/types";
import { getTranslationService } from "@/lib/translation/service";
import { translationKey } from "@/lib/translation/normalize";
import type { TranslatedItem, TranslationItem, TranslationProgress, TranslationService, TranslationStage } from "@/lib/translation/types";
export const TRANSLATION_ENABLED_KEY = "bitesplit-translation-enabled";
export type TranslationStoreState = {
  enabled: boolean; results: Record<string, TranslatedItem>; pending: Record<string, true>; progress: TranslationProgress | null; busy: boolean; error: string | null; needsDownload: boolean; downloadBytes: number; modelAllowed: boolean; modelUnavailableReason: string | null;
  setEnabled: (enabled: boolean) => void; request: (items: TranslationItem[]) => Promise<void>; allowModelAndRequest: (items: TranslationItem[]) => Promise<void>; cancel: () => void; clearForBill: () => void; forgetModel: () => void; invalidate: (id: string) => void;
};
export function createTranslationStore(service: TranslationService, storage: StorageLike | null) {
  let generation = 0; let controller: AbortController | null = null; let loader: AbortController | null = null; // loader: the run downloading or starting the model; a newer request queues behind it in the service (one model job at a time) instead of aborting a 57 MB transfer that resumes only per completed file
  const loading = (stage: TranslationStage) => stage === "downloading" || stage === "initializing";
  const abortAll = () => { controller?.abort(); loader?.abort(); controller = loader = null; };
  const read = () => { try { return storage?.getItem(TRANSLATION_ENABLED_KEY) === "1"; } catch { return false; } };
  return create<TranslationStoreState>((set, get) => {
    const run = async (items: TranslationItem[], allowModel: boolean) => {
      if (!get().enabled) return;
      const id = ++generation; if (controller !== loader) controller?.abort(); const mine = controller = new AbortController(); const signal = mine.signal;
      const current = new Map(items.map(i => [i.id, translationKey(i.name)]));
      const kept = Object.fromEntries(Object.entries(get().results).filter(([key, r]) => current.get(key) === translationKey(r.sourceText)));
      const pending = Object.fromEntries(items.filter(i => !kept[i.id] && translationKey(i.name)).map(i => [i.id, true as const]));
      set({ results: kept, pending, error: null, busy: true, needsDownload: false });
      try {
        const capabilities = await service.getCapabilities(); if (id !== generation) return;
        const useModel = (allowModel || capabilities.modelCached) && capabilities.modelAvailable; // a cached model needs no consent: nothing is downloaded
        set({ downloadBytes: capabilities.downloadBytes, modelUnavailableReason: capabilities.modelAvailable ? null : capabilities.reason ?? "unavailable" });
        const outcome = await service.translateDishes(items.filter(i => !kept[i.id]), { signal, allowModel: useModel,
          onProgress: progress => { // a superseded loader keeps reporting (and holding the Cancel button) while the model loads, then bows out: the newest run owns the warm engine
            if (signal.aborted) return;
            if (loading(progress.stage)) loader = mine; else if (loader === mine) { loader = null; if (controller !== mine) { mine.abort(); return; } }
            if (get().busy) set({ progress });
          },
          onItem: item => { if (id !== generation || current.get(item.id) !== translationKey(item.sourceText)) return; set(state => { const next = { ...state.pending }; delete next[item.id]; return { results: { ...state.results, [item.id]: item }, pending: next }; }); } });
        if (id !== generation) return;
        const unresolved = items.some(i => translationKey(i.name) && !get().results[i.id]);
        set({ pending: {}, progress: null, busy: false, error: outcome.error, needsDownload: unresolved && !useModel && capabilities.modelAvailable && !outcome.error });
      } catch (error) { if (id !== generation) return; set({ pending: {}, progress: null, busy: false, error: error instanceof DOMException && error.name === "AbortError" ? null : error instanceof Error ? error.message : "Translation failed." }); }
      finally { if (loader === mine) loader = null; }
    };
    return {
      enabled: read(), results: {}, pending: {}, progress: null, busy: false, error: null, needsDownload: false, downloadBytes: 0, modelAllowed: false, modelUnavailableReason: null,
      setEnabled: enabled => { try { storage?.setItem(TRANSLATION_ENABLED_KEY, enabled ? "1" : "0"); } catch { /* ignore */ } set({ enabled }); if (!enabled) get().cancel(); },
      request: items => run(items, get().modelAllowed),
      allowModelAndRequest: async items => { set({ modelAllowed: true, needsDownload: false }); await run(items, true); },
      cancel: () => { generation++; abortAll(); void service.cancelTranslations(); const unresolved = Object.keys(get().pending).length > 0; set({ pending: {}, progress: null, busy: false, modelAllowed: false, needsDownload: unresolved }); }, // consent was for this download; the next one is asked for again
      clearForBill: () => { generation++; abortAll(); set({ results: {}, pending: {}, progress: null, busy: false, error: null, needsDownload: false }); },
      forgetModel: () => { get().cancel(); get().clearForBill(); service.clearCache(); }, // the model was removed: withdraw consent and drop the warm engine (cancel) before emptying the phrase cache, so no in-flight job can write old entries back
      invalidate: id => set(state => { const results = { ...state.results }; delete results[id]; return { results }; }),
    };
  });
}
const serverService: TranslationService = { getCapabilities: async () => ({ modelAvailable: false, modelCached: false, downloadBytes: 0 }), translateDishes: async () => ({ items: [], error: null }), seed: () => {}, setOcrBusy: async () => {}, cancelTranslations: async () => {}, clearCache: () => {}, dispose: async () => {} };
export const useTranslationStore = createTranslationStore(typeof window === "undefined" ? serverService : getTranslationService(), typeof window === "undefined" ? null : window.localStorage);
