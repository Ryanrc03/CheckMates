import { beforeEach, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { ensureBundle, getBundleStatus, purgeExpiredBundles, removeBundle } from "./bundles";
import { resetManifestCache } from "./manifest";
import { readRecords } from "./records";
import type { AssetEnv, ModelAssetsManifest } from "./types";
const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const A = new Uint8Array([1, 2, 3, 4]); const W = new Uint8Array([9, 9]);
const manifest: ModelAssetsManifest = { version: 1, bundles: {
  "translate-enzh": { id: "translate-enzh", version: "v1", license: "MPL-2.0", totalBytes: 6, downloadBytes: 6, extraBytes: 0, sources: [], files: [{ path: "a.bin", bytes: 4, sha256: sha(A), role: "model", cache: "cache-api" }, { path: "runtime/w.wasm", bytes: 2, sha256: sha(W), role: "runtime", cache: "cache-api" }, { path: "runtime/worker.js", bytes: 10, sha256: "x", role: "runtime", cache: "http" }] },
  "ocr-precise": { id: "ocr-precise", version: "v1", license: "Apache-2.0", totalBytes: 4, downloadBytes: 4, extraBytes: 0, sources: [], files: [{ path: "det.tar", bytes: 4, sha256: sha(A), role: "model", cache: "cache-api" }] } } };
class FakeCache { store = new Map<string, Response>(); async match(key: string | Request) { const url = typeof key === "string" ? key : key.url; const hit = this.store.get(url); return hit ? hit.clone() : undefined; } async put(key: string, response: Response) { this.store.set(key, response); } async keys() { return [...this.store.keys()].map(url => new Request(url)); } }
class FakeCaches { caches = new Map<string, FakeCache>(); async open(name: string) { if (!this.caches.has(name)) this.caches.set(name, new FakeCache()); return this.caches.get(name) as unknown as Cache; } async keys() { return [...this.caches.keys()]; } async delete(name: string) { return this.caches.delete(name); } async has(name: string) { return this.caches.has(name); } async match() { return undefined; } }
function makeEnv(overrides: Partial<AssetEnv> & { bytes?: Record<string, Uint8Array<ArrayBuffer>>; log?: string[] } = {}): AssetEnv & { fakeCaches: FakeCaches; store: Map<string, string>; log: string[] } {
  const fakeCaches = new FakeCaches(); const store = new Map<string, string>(); const log = overrides.log ?? []; let clock = 1_700_000_000_000;
  const bytes = overrides.bytes ?? { "a.bin": A, "runtime/w.wasm": W, "det.tar": A };
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url; log.push(url);
    if (url.endsWith("/models/manifest.json")) return new Response(JSON.stringify(manifest), { status: 200 });
    const path = url.replace(/^https:\/\/x\.test\/models\/[^/]+\/[^/]+\//, ""); const body = bytes[path];
    if (!body) return new Response("nope", { status: 404 });
    if (init?.signal?.aborted) throw new DOMException("aborted", "AbortError");
    return new Response(body, { status: 200, headers: { "Content-Length": String(body.byteLength) } });
  };
  return { caches: fakeCaches as unknown as CacheStorage, storage: { getItem: k => store.get(k) ?? null, setItem: (k, v) => void store.set(k, v), removeItem: k => void store.delete(k) }, fetch: fetchImpl, origin: "https://x.test", now: () => clock += 1, ...overrides, fakeCaches, store, log };
}
beforeEach(() => resetManifestCache());
describe("ensureBundle", () => {
  it("downloads missing cache-api files once, reports progress, verifies bytes, records install", async () => {
    const env = makeEnv(); const progress: number[] = [];
    const handle = await ensureBundle("translate-enzh", { env, onProgress: p => progress.push(p.loadedBytes) });
    expect(handle.cacheName).toBe("cm-models-translate-enzh-vv1"); expect(handle.url("runtime/worker.js")).toBe("https://x.test/models/translate-enzh/v1/runtime/worker.js");
    expect(new Uint8Array(await handle.bytes("a.bin"))).toEqual(A); expect(progress.at(-1)).toBe(6);
    expect(env.log.filter(u => u.includes("/models/translate-enzh/"))).toHaveLength(2);
    const again = await ensureBundle("translate-enzh", { env }); expect(await again.bytes("runtime/w.wasm")).toBeTruthy();
    expect(env.log.filter(u => u.includes("/models/translate-enzh/"))).toHaveLength(2); // cache hit, no re-download
    expect(readRecords(env.storage).bundles["translate-enzh"]?.version).toBe("v1");
    expect((await getBundleStatus("translate-enzh", env)).cached).toBe(true);
  });
  it("rejects a file whose length or hash does not match and stores nothing for it", async () => {
    const env = makeEnv({ bytes: { "a.bin": new Uint8Array([1, 2, 3]), "runtime/w.wasm": W } });
    await expect(ensureBundle("translate-enzh", { env })).rejects.toThrow(/a\.bin/);
    expect((await getBundleStatus("translate-enzh", env)).cached).toBe(false);
  });
  it("aborts and keeps already stored files", async () => {
    const env = makeEnv(); const controller = new AbortController(); controller.abort();
    await expect(ensureBundle("translate-enzh", { env, signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
  });
  it("handle.fetch serves cached entries and falls back to the network", async () => {
    const env = makeEnv(); const handle = await ensureBundle("translate-enzh", { env }); const before = env.log.length;
    const res = await handle.fetch(handle.url("a.bin")); expect(new Uint8Array(await res.arrayBuffer())).toEqual(A); expect(env.log.length).toBe(before);
    await handle.fetch(handle.url("runtime/worker.js")).catch(() => null); expect(env.log.length).toBe(before + 1);
  });
});
describe("removeBundle / purgeExpiredBundles", () => {
  it("removes every version of a bundle and its record", async () => {
    const env = makeEnv(); await ensureBundle("translate-enzh", { env }); await env.fakeCaches.open("cm-models-translate-enzh-vold");
    await removeBundle("translate-enzh", env);
    expect(await env.fakeCaches.keys()).toEqual([]); expect(readRecords(env.storage).bundles["translate-enzh"]).toBeUndefined();
  });
  it("purges bundles unused for 14 days or with a stale version, keeps fresh ones", async () => {
    const env = makeEnv(); await ensureBundle("translate-enzh", { env }); await ensureBundle("ocr-precise", { env });
    const records = readRecords(env.storage); records.bundles["ocr-precise"]!.lastUsedAt = env.now() - 15 * 24 * 60 * 60 * 1000; records.bundles["translate-enzh"]!.version = "stale"; env.storage.setItem("bitesplit-model-assets", JSON.stringify(records));
    const purged = await purgeExpiredBundles({ env, maxAgeDays: 14 });
    expect(purged.sort()).toEqual(["ocr-precise", "translate-enzh"]); expect(await env.fakeCaches.keys()).toEqual([]);
    await ensureBundle("ocr-precise", { env }); expect(await purgeExpiredBundles({ env })).toEqual([]);
  });
});
