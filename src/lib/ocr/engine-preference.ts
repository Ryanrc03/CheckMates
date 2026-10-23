import type { StorageLike } from "@/lib/model-assets/types";
import { cloudConfig } from "@/lib/llm/config";
import type { OcrEngine } from "./client";
export const ENGINE_PREFERENCE_KEY = "bitesplit-ocr-engine";
export function readEnginePreference(storage: StorageLike | null = typeof window === "undefined" ? null : window.localStorage, cloudAvailable = cloudConfig() !== null): OcrEngine {
  const fallback: OcrEngine = cloudAvailable ? "cloud" : "standard"; // with a key, a fresh browser starts on the most accurate engine
  try { const stored = storage?.getItem(ENGINE_PREFERENCE_KEY); return stored === "precise" || stored === "standard" ? stored : fallback; } catch { return fallback; } // a stored "cloud" or junk value falls back, so a site without a key never returns "cloud"
}
export function writeEnginePreference(storage: StorageLike | null, engine: OcrEngine): void { try { storage?.setItem(ENGINE_PREFERENCE_KEY, engine); } catch { /* ignore */ } }
