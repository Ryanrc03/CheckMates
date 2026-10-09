import { create } from "zustand";
import type { StorageLike } from "@/lib/model-assets/types";
import { getTranslationService } from "@/lib/translation/service";
import { translationKey } from "@/lib/translation/normalize";
import type { TranslatedItem, TranslationItem, TranslationProgress, TranslationService } from "@/lib/translation/types";
export const TRANSLATION_ENABLED_KEY = "bitesplit-translation-enabled";
export type TranslationStoreState = {
  enabled: boolean; results: Record<string, TranslatedItem>; pending: Record<string, true>; progress: TranslationProgress | null; busy: boolean; error: string | null; needsDownload: boolean; downloadBytes: number; modelAllowed: boolean; modelUnavailableReason: string | null;
  setEnabled: (enabled: boolean) => void; request: (items: TranslationItem[]) => Promise<void>; allowModelAndRequest: (items: TranslationItem[]) => Promise<void>; cancel: () => void; clearForBill: () => void; invalidate: (id: string) => void;
};
export function createTranslationStore(service: TranslationService, storage: StorageLike | null) {
  let generation = 0; let controller: AbortController | null = null;
  const read = () => { try { return storage?.getItem(TRANSLATION_ENABLED_KEY) === "1"; } catch { return false; } };
  return create<TranslationStoreState>((set, get) => {
    const run = async (items: TranslationItem[], allowModel: boolean) => {
      if (!get().enabled) return;
      const id = ++generation; controller?.abort(); controller = new AbortController(); const signal = controller.signal;
      const current = new Map(items.map(i => [i.id, translationKey(i.name)]));
      const kept = Object.fromEntries(Object.entries(get().results).filter(([key, r]) => current.get(key) === translationKey(r.sourceText)));
      const pending = Object.fromEntries(items.filter(i => !kept[i.id] && translationKey(i.name)).map(i => [i.id, true as const]));
      set({ results: kept, pending, error: null, busy: true, needsDownload: false });
      try {
        const capabilities = await service.getCapabilities(); if (id !== generation) return;
        const useModel = (allowModel || capabilities.modelCached) && capabilities.modelAvailable; // a cached model needs no consent: nothing is downloaded
        set({ downloadBytes: capabilities.downloadBytes, modelUnavailableReason: capabilities.modelAvailable ? null : capabilities.reason ?? "unavailable" });
        const outcome = await service.translateDishes(items.filter(i => !kept[i.id]), { signal, allowModel: useModel, onProgress: progress => { if (id === generation) set({ progress }); },
          onItem: item => { if (id !== generation || current.get(item.id) !== translationKey(item.sourceText)) return; set(state => { const next = { ...state.pending }; delete next[item.id]; return { results: { ...state.results, [item.id]: item }, pending: next }; }); } });
        if (id !== generation) return;
        const unresolved = items.some(i => translationKey(i.name) && !get().results[i.id]);
        set({ pending: {}, progress: null, busy: false, error: outcome.error, needsDownload: unresolved && !useModel && capabilities.modelAvailable && !outcome.error });
      } catch (error) { if (id !== generation) return; set({ pending: {}, progress: null, busy: false, error: error instanceof DOMException && error.name === "AbortError" ? null : error instanceof Error ? error.message : "Translation failed." }); }
    };
    return {
      enabled: read(), results: {}, pending: {}, progress: null, busy: false, error: null, needsDownload: false, downloadBytes: 0, modelAllowed: false, modelUnavailableReason: null,
      setEnabled: enabled => { try { storage?.setItem(TRANSLATION_ENABLED_KEY, enabled ? "1" : "0"); } catch { /* ignore */ } set({ enabled }); if (!enabled) get().cancel(); },
      request: items => run(items, get().modelAllowed),
      allowModelAndRequest: async items => { set({ modelAllowed: true, needsDownload: false }); await run(items, true); },
      cancel: () => { generation++; controller?.abort(); controller = null; void service.cancelTranslations(); const unresolved = Object.keys(get().pending).length > 0; set({ pending: {}, progress: null, busy: false, modelAllowed: false, needsDownload: unresolved }); }, // consent was for this download; the next one is asked for again
      clearForBill: () => { generation++; controller?.abort(); controller = null; set({ results: {}, pending: {}, progress: null, busy: false, error: null, needsDownload: false }); },
      invalidate: id => set(state => { const results = { ...state.results }; delete results[id]; return { results }; }),
    };
  });
}
const serverService: TranslationService = { getCapabilities: async () => ({ modelAvailable: false, modelCached: false, downloadBytes: 0 }), translateDishes: async () => ({ items: [], error: null }), setOcrBusy: async () => {}, cancelTranslations: async () => {}, dispose: async () => {} };
export const useTranslationStore = createTranslationStore(typeof window === "undefined" ? serverService : getTranslationService(), typeof window === "undefined" ? null : window.localStorage);
