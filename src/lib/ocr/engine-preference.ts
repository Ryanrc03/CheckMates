import type { StorageLike } from "@/lib/model-assets/types";
import type { OcrEngine } from "./client";
export const ENGINE_PREFERENCE_KEY = "bitesplit-ocr-engine";
export function readEnginePreference(storage: StorageLike | null = typeof window === "undefined" ? null : window.localStorage): OcrEngine { try { return storage?.getItem(ENGINE_PREFERENCE_KEY) === "precise" ? "precise" : "standard"; } catch { return "standard"; } }
export function writeEnginePreference(storage: StorageLike | null, engine: OcrEngine): void { try { storage?.setItem(ENGINE_PREFERENCE_KEY, engine); } catch { /* ignore */ } }
