import type { StorageLike } from "@/lib/model-assets/types";
import type { TranslationProvider } from "./types";
export const TRANSLATION_CACHE_KEY = "bitesplit-translations";
export const MAX_CACHE_ENTRIES = 300;
export const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export type CacheEntry = { text: string; provider: TranslationProvider; revision: string; at: number };
export type TranslationCache = { get(key: string, revision: string): CacheEntry | null; set(key: string, entry: CacheEntry): void; clear(): void };
type Stored = { version: 1; entries: Record<string, CacheEntry> };
export function createTranslationCache(storage: StorageLike | null, now: () => number = () => Date.now()): TranslationCache {
  let entries: Record<string, CacheEntry> | null = null;
  const load = (): Record<string, CacheEntry> => {
    if (entries) return entries; entries = {};
    try { const raw = storage?.getItem(TRANSLATION_CACHE_KEY); const parsed: unknown = raw ? JSON.parse(raw) : null; const stored = parsed as Stored | null; if (stored && stored.version === 1 && stored.entries && typeof stored.entries === "object") entries = { ...stored.entries }; } catch { entries = {}; }
    return entries;
  };
  const save = () => { try { storage?.setItem(TRANSLATION_CACHE_KEY, JSON.stringify({ version: 1, entries: load() } satisfies Stored)); } catch { /* keep the in-memory copy */ } };
  return {
    get(key, revision) { const entry = load()[key]; if (!entry || entry.revision !== revision || now() - entry.at > CACHE_TTL_MS) return null; entry.at = now(); return entry; },
    set(key, entry) { const all = load(); all[key] = entry; const keys = Object.keys(all); if (keys.length > MAX_CACHE_ENTRIES) { keys.sort((a, b) => all[a].at - all[b].at).slice(0, keys.length - MAX_CACHE_ENTRIES).forEach(k => delete all[k]); } save(); },
    clear() { entries = {}; try { storage?.removeItem(TRANSLATION_CACHE_KEY); } catch { /* ignore */ } },
  };
}
