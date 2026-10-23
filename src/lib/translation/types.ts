export type TranslationProvider = "glossary" | "rule" | "model" | "llm";
export type TranslationItem = { id: string; name: string };
export type TranslatedItem = { id: string; sourceText: string; translatedText: string; provider: TranslationProvider; revision: string };
export type TranslationStage = "queued" | "awaiting-download" | "downloading" | "initializing" | "translating" | "ready";
export type TranslationProgress = { stage: TranslationStage; loadedBytes?: number; totalBytes?: number; completedItems?: number; totalItems?: number };
export type TranslationCapabilities = { modelAvailable: boolean; modelCached: boolean; downloadBytes: number; reason?: "wasm-simd" | "worker" | "manifest" };
export type TranslateOptions = { signal: AbortSignal; allowModel: boolean; onProgress?: (progress: TranslationProgress) => void; onItem?: (item: TranslatedItem) => void };
export type TranslateOutcome = { items: TranslatedItem[]; error: string | null };
export type TranslationService = {
  getCapabilities(): Promise<TranslationCapabilities>;
  translateDishes(items: TranslationItem[], options: TranslateOptions): Promise<TranslateOutcome>;
  /** Stores names translated elsewhere (cloud recognition) so the next request for the same names is a cache hit. */
  seed(entries: { name: string; text: string }[]): void;
  setOcrBusy(busy: boolean): Promise<void>;
  cancelTranslations(): Promise<void>;
  clearCache(): void;
  dispose(): Promise<void>;
};
export const MAX_ITEMS = 50;
export const MAX_SOURCE_LENGTH = 120;
