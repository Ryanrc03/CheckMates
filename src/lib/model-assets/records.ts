import type { BundleRecord, ModelBundleId, StorageLike } from "./types";
export const RECORDS_KEY = "bitesplit-model-assets";
export type BundleRecords = { version: 1; bundles: Partial<Record<ModelBundleId, BundleRecord>> };
const empty = (): BundleRecords => ({ version: 1, bundles: {} });
export function readRecords(storage: StorageLike): BundleRecords {
  try { const raw = storage.getItem(RECORDS_KEY); if (!raw) return empty(); const parsed: unknown = JSON.parse(raw); if (!parsed || typeof parsed !== "object" || (parsed as { version?: unknown }).version !== 1) return empty(); const bundles = (parsed as { bundles?: unknown }).bundles; return { version: 1, bundles: bundles && typeof bundles === "object" ? bundles as BundleRecords["bundles"] : {} }; } catch { return empty(); }
}
export function writeRecords(storage: StorageLike, records: BundleRecords): boolean { try { storage.setItem(RECORDS_KEY, JSON.stringify(records)); return true; } catch { return false; } }
