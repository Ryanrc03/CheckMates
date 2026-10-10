import type { ModelAssetsManifest, ModelBundleId, ModelBundleManifest } from "./types";
export const MANIFEST_PATH = "/models/manifest.json";
export const BUNDLE_IDS: ModelBundleId[] = ["translate-enzh", "ocr-precise"];
const SHA256_HEX = /^[0-9a-f]{64}$/; // bundles.ts compares against lowercase hex, so anything else would fail every download
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const count = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0;
function isFile(v: unknown): boolean { return record(v) && typeof v.path === "string" && count(v.bytes) && typeof v.sha256 === "string" && SHA256_HEX.test(v.sha256) && (v.role === "model" || v.role === "runtime") && (v.cache === "cache-api" || v.cache === "http"); }
function isBundle(v: unknown, id: string): v is ModelBundleManifest { return record(v) && v.id === id && typeof v.version === "string" && v.version.length > 0 && typeof v.license === "string" && count(v.totalBytes) && count(v.downloadBytes) && count(v.extraBytes) && Array.isArray(v.files) && v.files.every(isFile) && Array.isArray(v.sources); }
export function isManifest(v: unknown): v is ModelAssetsManifest {
  if (!record(v) || v.version !== 1 || !record(v.bundles)) return false; const bundles = v.bundles;
  return BUNDLE_IDS.every(id => isBundle(bundles[id], id)) && Object.keys(bundles).every(id => BUNDLE_IDS.includes(id as ModelBundleId)); // every known bundle present, nothing unknown: callers index bundles[id] without checking
}
export function bundleUrl(origin: string, bundle: Pick<ModelBundleManifest, "id" | "version">, path: string): string { return `${origin}/models/${bundle.id}/${bundle.version}/${path}`; }
let cached: Promise<ModelAssetsManifest> | null = null;
export function loadManifest(fetchImpl: typeof fetch, origin: string): Promise<ModelAssetsManifest> {
  if (!cached) cached = fetchImpl(`${origin}${MANIFEST_PATH}`, { cache: "no-cache" }).then(async response => {
    if (!response.ok) throw new Error(`Model manifest unavailable (HTTP ${response.status}).`);
    const json: unknown = await response.json(); if (!isManifest(json)) throw new Error("Model manifest is invalid.");
    return json;
  }).catch(error => { cached = null; throw error; });
  return cached;
}
export function resetManifestCache(): void { cached = null; }
