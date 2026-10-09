import { bundleUrl, loadManifest } from "./manifest";
import { readRecords, writeRecords } from "./records";
import type { AssetEnv, BundleHandle, BundleProgress, BundleStatus, ModelBundleId, ModelBundleManifest } from "./types";
export const CACHE_PREFIX = "cm-models-";
export const cacheNameFor = (id: ModelBundleId, version: string) => `${CACHE_PREFIX}${id}-v${version}`;
export function browserEnv(): AssetEnv { return { caches: globalThis.caches, storage: window.localStorage, fetch: (input, init) => fetch(input, init), origin: window.location.origin, now: () => Date.now() }; }
const abortError = () => new DOMException("Download canceled.", "AbortError");
async function sha256Hex(buffer: ArrayBuffer): Promise<string> { const digest = await crypto.subtle.digest("SHA-256", buffer); return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join(""); }
async function bundleCacheNames(env: AssetEnv, id: ModelBundleId): Promise<string[]> { return (await env.caches.keys()).filter(name => name.startsWith(`${CACHE_PREFIX}${id}-v`)); }
async function cachedFiles(env: AssetEnv, bundle: ModelBundleManifest): Promise<Set<string>> {
  const name = cacheNameFor(bundle.id, bundle.version); const present = new Set<string>(); if (!(await env.caches.has(name))) return present; // caches.open() would create an empty bucket, which caches.keys()-based status/purge/removal would then mistake for an install
  const cache = await env.caches.open(name);
  for (const file of bundle.files) if (file.cache === "cache-api" && await cache.match(bundleUrl(env.origin, bundle, file.path))) present.add(file.path);
  return present;
}
export async function getBundleStatus(id: ModelBundleId, env: AssetEnv = browserEnv()): Promise<BundleStatus> {
  const bundle = (await loadManifest(env.fetch, env.origin)).bundles[id]; const present = await cachedFiles(env, bundle); const record = readRecords(env.storage).bundles[id];
  const cached = bundle.files.filter(f => f.cache === "cache-api").every(f => present.has(f.path));
  return { id, version: bundle.version, totalBytes: bundle.totalBytes, downloadBytes: bundle.downloadBytes, cached, installedAt: record?.installedAt ?? null, lastUsedAt: record?.lastUsedAt ?? null };
}
async function download(env: AssetEnv, url: string, expectedBytes: number, expectedSha: string, signal: AbortSignal | undefined, onChunk: (received: number) => void): Promise<Response> {
  if (signal?.aborted) throw abortError();
  const response = await env.fetch(url, { signal, cache: "no-store" });
  if (!response.ok || !response.body) throw new Error(`Could not download ${url.split("/").pop()} (HTTP ${response.status}).`);
  const reader = response.body.getReader(); const chunks: Uint8Array<ArrayBuffer>[] = []; let received = 0;
  for (;;) { const { done, value } = await reader.read(); if (done) break; chunks.push(value); received += value.byteLength; onChunk(received); }
  if (received !== expectedBytes) throw new Error(`Downloaded ${url.split("/").pop()} is ${received} bytes; expected ${expectedBytes}.`);
  const blob = new Blob(chunks); if (await sha256Hex(await blob.arrayBuffer()) !== expectedSha) throw new Error(`Downloaded ${url.split("/").pop()} failed its integrity check.`);
  return new Response(blob, { status: 200, headers: { "Content-Type": response.headers.get("Content-Type") ?? "application/octet-stream", "Content-Length": String(received) } });
}
function touchRecord(env: AssetEnv, id: ModelBundleId, version: string): void {
  const records = readRecords(env.storage); const existing = records.bundles[id]; const now = env.now();
  records.bundles[id] = { version, installedAt: existing && existing.version === version ? existing.installedAt : now, lastUsedAt: now }; writeRecords(env.storage, records);
}
export async function ensureBundle(id: ModelBundleId, { signal, onProgress, env = browserEnv() }: { signal?: AbortSignal; onProgress?: (progress: BundleProgress) => void; env?: AssetEnv } = {}): Promise<BundleHandle> {
  const bundle = (await loadManifest(env.fetch, env.origin)).bundles[id]; const name = cacheNameFor(id, bundle.version); const cache = await env.caches.open(name);
  const files = bundle.files.filter(f => f.cache === "cache-api"); const totalBytes = files.reduce((s, f) => s + f.bytes, 0); let loaded = 0;
  onProgress?.({ stage: "checking", loadedBytes: 0, totalBytes });
  for (const file of files) {
    const url = bundleUrl(env.origin, bundle, file.path);
    if (await cache.match(url)) { loaded += file.bytes; onProgress?.({ stage: "downloading", loadedBytes: loaded, totalBytes, file: file.path }); continue; }
    const base = loaded; const response = await download(env, url, file.bytes, file.sha256, signal, received => onProgress?.({ stage: "downloading", loadedBytes: base + received, totalBytes, file: file.path }));
    await cache.put(url, response); loaded += file.bytes;
  }
  for (const stale of await bundleCacheNames(env, id)) if (stale !== name) await env.caches.delete(stale);
  touchRecord(env, id, bundle.version); onProgress?.({ stage: "ready", loadedBytes: totalBytes, totalBytes });
  const url = (path: string) => bundleUrl(env.origin, bundle, path);
  return { id, version: bundle.version, cacheName: name, url,
    bytes: async path => { const hit = await cache.match(url(path)); if (!hit) throw new Error(`${path} is not in the local model cache.`); return hit.arrayBuffer(); },
    fetch: async (input, init) => { const target = typeof input === "string" ? input : input instanceof URL ? input.href : input.url; const hit = await cache.match(target); return hit ?? env.fetch(input, init); },
    touch: () => touchRecord(env, id, bundle.version) };
}
export async function removeBundle(id: ModelBundleId, env: AssetEnv = browserEnv()): Promise<void> {
  for (const name of await bundleCacheNames(env, id)) await env.caches.delete(name);
  const records = readRecords(env.storage); delete records.bundles[id]; writeRecords(env.storage, records);
}
export async function purgeExpiredBundles({ env = browserEnv(), maxAgeDays = 14 }: { env?: AssetEnv; maxAgeDays?: number } = {}): Promise<ModelBundleId[]> {
  const manifest = await loadManifest(env.fetch, env.origin); const records = readRecords(env.storage); const purged: ModelBundleId[] = []; const limit = maxAgeDays * 24 * 60 * 60 * 1000;
  for (const id of Object.keys(manifest.bundles) as ModelBundleId[]) {
    const record = records.bundles[id]; const names = await bundleCacheNames(env, id); if (!names.length && !record) continue;
    const expired = !record || record.version !== manifest.bundles[id].version || env.now() - record.lastUsedAt > limit;
    if (expired) { await removeBundle(id, env); purged.push(id); }
  }
  return purged;
}
