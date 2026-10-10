import { beforeEach, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { ensureBundle, getBundleStatus, purgeExpiredBundles, removeBundle } from "./bundles";
import { resetManifestCache } from "./manifest";
import { readRecords, writeRecords } from "./records";
import type { AssetEnv, ModelAssetsManifest, ModelBundleId } from "./types";
const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const A = new Uint8Array([1, 2, 3, 4]); const W = new Uint8Array([9, 9]); const DAY = 24 * 60 * 60 * 1000;
const manifest: ModelAssetsManifest = { version: 1, bundles: {
  "translate-enzh": { id: "translate-enzh", version: "v1", license: "MPL-2.0", totalBytes: 6, downloadBytes: 6, extraBytes: 0, sources: [], files: [{ path: "a.bin", bytes: 4, sha256: sha(A), role: "model", cache: "cache-api" }, { path: "runtime/w.wasm", bytes: 2, sha256: sha(W), role: "runtime", cache: "cache-api" }, { path: "runtime/worker.js", bytes: 10, sha256: "0".repeat(64), role: "runtime", cache: "http" }] },
  "ocr-precise": { id: "ocr-precise", version: "v1", license: "Apache-2.0", totalBytes: 4, downloadBytes: 4, extraBytes: 0, sources: [], files: [{ path: "det.tar", bytes: 4, sha256: sha(A), role: "model", cache: "cache-api" }] } } };
class FakeCache { store = new Map<string, Response>(); async match(key: string | Request) { const url = typeof key === "string" ? key : key.url; const hit = this.store.get(url); return hit ? hit.clone() : undefined; } async put(key: string, response: Response) { this.store.set(key, response); } async keys() { return [...this.store.keys()].map(url => new Request(url)); } }
class FakeCaches { caches = new Map<string, FakeCache>(); async open(name: string) { if (!this.caches.has(name)) this.caches.set(name, new FakeCache()); return this.caches.get(name) as unknown as Cache; } async keys() { return [...this.caches.keys()]; } async delete(name: string) { return this.caches.delete(name); } async has(name: string) { return this.caches.has(name); } async match() { return undefined; } }
type TestEnv = AssetEnv & { fakeCaches: FakeCaches; store: Map<string, string>; log: string[] };
function makeEnv(overrides: Partial<AssetEnv> & { bytes?: Record<string, Uint8Array<ArrayBuffer>>; log?: string[] } = {}): TestEnv {
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
const BASE = "https://x.test/models/translate-enzh/v1/"; const BUCKET = "cm-models-translate-enzh-vv1";
const modelFetches = (env: TestEnv) => env.log.filter(u => u.startsWith(BASE)).map(u => u.slice(BASE.length));
const bucketFiles = (env: TestEnv) => [...(env.fakeCaches.caches.get(BUCKET)?.store.keys() ?? [])].map(u => u.slice(BASE.length));
const record = (env: TestEnv) => readRecords(env.storage).bundles["translate-enzh"];
const ageRecord = (env: TestEnv, id: ModelBundleId, days: number) => { const records = readRecords(env.storage); records.bundles[id]!.lastUsedAt = env.now() - days * DAY; writeRecords(env.storage, records); };
/** Downloads translate-enzh but aborts as soon as a.bin (the first file) has fully arrived, so it is stored and runtime/w.wasm is never fetched. */
async function abortAfterFirstFile(env: TestEnv) { const controller = new AbortController(); await expect(ensureBundle("translate-enzh", { env, signal: controller.signal, onProgress: p => { if (p.stage === "downloading" && p.file === "a.bin" && p.loadedBytes === 4) controller.abort(); } })).rejects.toMatchObject({ name: "AbortError" }); }
beforeEach(() => resetManifestCache());
describe("ensureBundle", () => {
  it("downloads missing cache-api files once, reports progress, verifies bytes, records install", async () => {
    const env = makeEnv(); const progress: number[] = [];
    const handle = await ensureBundle("translate-enzh", { env, onProgress: p => progress.push(p.loadedBytes) });
    expect(handle.cacheName).toBe(BUCKET); expect(handle.url("runtime/worker.js")).toBe(`${BASE}runtime/worker.js`);
    expect(new Uint8Array(await handle.bytes("a.bin"))).toEqual(A); expect(progress.at(-1)).toBe(6);
    expect(modelFetches(env)).toEqual(["a.bin", "runtime/w.wasm"]);
    const again = await ensureBundle("translate-enzh", { env }); expect(await again.bytes("runtime/w.wasm")).toBeTruthy();
    expect(modelFetches(env)).toHaveLength(2); // cache hit, no re-download
    expect(record(env)?.version).toBe("v1");
    expect((await getBundleStatus("translate-enzh", env)).cached).toBe(true);
  });
  it("rejects a file whose length does not match and leaves no bucket or record behind", async () => {
    const env = makeEnv({ bytes: { "a.bin": new Uint8Array([1, 2, 3]), "runtime/w.wasm": W } });
    await expect(ensureBundle("translate-enzh", { env })).rejects.toThrow(/a\.bin is 3 bytes; expected 4/);
    expect(await env.fakeCaches.keys()).toEqual([]); expect(record(env)).toBeUndefined(); expect((await getBundleStatus("translate-enzh", env)).cached).toBe(false);
  });
  it("rejects a file of the right length whose sha-256 does not match and stores nothing for it", async () => {
    const env = makeEnv({ bytes: { "a.bin": new Uint8Array([1, 2, 3, 5]), "runtime/w.wasm": W } });
    await expect(ensureBundle("translate-enzh", { env })).rejects.toThrow(/a\.bin failed its integrity check/);
    expect(await env.fakeCaches.keys()).toEqual([]); expect(record(env)).toBeUndefined(); expect((await getBundleStatus("translate-enzh", env)).cached).toBe(false);
    const later = makeEnv({ bytes: { "a.bin": A, "runtime/w.wasm": new Uint8Array([9, 8]) } }); // corrupted second file: the good first file stays, the bad one is not stored
    await expect(ensureBundle("translate-enzh", { env: later })).rejects.toThrow(/w\.wasm failed its integrity check/);
    expect(bucketFiles(later)).toEqual(["a.bin"]); expect((await getBundleStatus("translate-enzh", later)).cached).toBe(false);
  });
  it("aborting mid-download keeps the stored files through a purge on the next page load, and the next call resumes from them", async () => {
    const env = makeEnv(); await env.fakeCaches.open("cm-models-translate-enzh-vold");
    await abortAfterFirstFile(env);
    expect(await env.fakeCaches.keys()).toEqual([BUCKET]); expect(bucketFiles(env)).toEqual(["a.bin"]); // the retired version is gone, the partial stays
    expect(record(env)?.version).toBe("v1"); expect((await getBundleStatus("translate-enzh", env)).cached).toBe(false); // recorded so it ages out like an install, but not installed
    expect(modelFetches(env)).toEqual(["a.bin"]); // the abort is noticed before the second fetch starts
    expect(await purgeExpiredBundles({ env })).toEqual([]); expect(bucketFiles(env)).toEqual(["a.bin"]); // BillWizard purges on mount; a fresh partial must survive it
    const handle = await ensureBundle("translate-enzh", { env }); expect(new Uint8Array(await handle.bytes("runtime/w.wasm"))).toEqual(W);
    expect(modelFetches(env)).toEqual(["a.bin", "runtime/w.wasm"]); // resumed: a.bin was not fetched again
    expect(record(env)?.version).toBe("v1"); expect((await getBundleStatus("translate-enzh", env)).cached).toBe(true);
  });
  it("rejects with AbortError before fetching anything when the signal is already aborted, leaving no bucket or record", async () => {
    const env = makeEnv(); const controller = new AbortController(); controller.abort();
    await expect(ensureBundle("translate-enzh", { env, signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
    expect(modelFetches(env)).toEqual([]); expect(await env.fakeCaches.keys()).toEqual([]); expect(record(env)).toBeUndefined();
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
    expect(await env.fakeCaches.keys()).toEqual([]); expect(record(env)).toBeUndefined();
  });
  it("purges bundles unused for 14 days or with a stale version, keeps fresh ones", async () => {
    const env = makeEnv(); await ensureBundle("translate-enzh", { env }); await ensureBundle("ocr-precise", { env });
    ageRecord(env, "ocr-precise", 15); const records = readRecords(env.storage); records.bundles["translate-enzh"]!.version = "stale"; writeRecords(env.storage, records);
    const purged = await purgeExpiredBundles({ env, maxAgeDays: 14 });
    expect(purged.sort()).toEqual(["ocr-precise", "translate-enzh"]); expect(await env.fakeCaches.keys()).toEqual([]);
    await ensureBundle("ocr-precise", { env }); expect(await purgeExpiredBundles({ env })).toEqual([]);
  });
  it("ages out a partial download on the same 14-day clock as an install", async () => {
    const env = makeEnv(); await abortAfterFirstFile(env); ageRecord(env, "translate-enzh", 13);
    expect(await purgeExpiredBundles({ env })).toEqual([]); expect(bucketFiles(env)).toEqual(["a.bin"]);
    ageRecord(env, "translate-enzh", 15);
    expect(await purgeExpiredBundles({ env })).toEqual(["translate-enzh"]); expect(await env.fakeCaches.keys()).toEqual([]); expect(record(env)).toBeUndefined();
  });
  it("keeps a record-less bucket at the current version (its record was lost) for the next call to resume, but purges record-less stale versions", async () => {
    const env = makeEnv(); await env.fakeCaches.open("cm-models-ocr-precise-vold");
    env.fakeCaches.caches.set(BUCKET, new FakeCache()); await env.fakeCaches.caches.get(BUCKET)!.put(`${BASE}a.bin`, new Response(A));
    expect(await purgeExpiredBundles({ env })).toEqual(["ocr-precise"]); expect(await env.fakeCaches.keys()).toEqual([BUCKET]);
    await ensureBundle("translate-enzh", { env }); expect(modelFetches(env)).toEqual(["runtime/w.wasm"]); expect(record(env)?.version).toBe("v1");
  });
  it("getBundleStatus never creates a cache bucket, so purge ignores bundles that were never installed", async () => {
    const env = makeEnv(); expect((await getBundleStatus("translate-enzh", env)).cached).toBe(false);
    expect(await env.fakeCaches.keys()).toEqual([]); expect(await purgeExpiredBundles({ env })).toEqual([]);
    await ensureBundle("translate-enzh", { env }); await removeBundle("translate-enzh", env); expect((await getBundleStatus("translate-enzh", env)).cached).toBe(false);
    expect(await env.fakeCaches.keys()).toEqual([]); // removal must not be undone by the status refresh that follows it
  });
});
