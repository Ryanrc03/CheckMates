import type { ModelAssetsManifest, ModelBundleId, ModelBundleManifest } from "./types";
export const MANIFEST_PATH = "/models/manifest.json";
export const BUNDLE_IDS: ModelBundleId[] = ["translate-enzh", "ocr-precise"];
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
function isFile(v: unknown): boolean { return record(v) && typeof v.path === "string" && Number.isSafeInteger(v.bytes) && typeof v.sha256 === "string" && (v.role === "model" || v.role === "runtime") && (v.cache === "cache-api" || v.cache === "http"); }
function isBundle(v: unknown, id: string): v is ModelBundleManifest { return record(v) && v.id === id && typeof v.version === "string" && v.version.length > 0 && typeof v.license === "string" && Number.isSafeInteger(v.totalBytes) && Number.isSafeInteger(v.downloadBytes) && Number.isSafeInteger(v.extraBytes) && Array.isArray(v.files) && v.files.every(isFile) && Array.isArray(v.sources); }
export function isManifest(v: unknown): v is ModelAssetsManifest { return record(v) && v.version === 1 && record(v.bundles) && Object.entries(v.bundles).every(([id, b]) => BUNDLE_IDS.includes(id as ModelBundleId) && isBundle(b, id)); }
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
