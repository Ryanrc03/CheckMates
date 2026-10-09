import { describe, expect, it } from "vitest";
import { createTranslationCache, TRANSLATION_CACHE_KEY } from "./cache";
function storage(initial: Record<string, string> = {}) { const map = new Map(Object.entries(initial)); return { map, getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v), removeItem: (k: string) => void map.delete(k) }; }
describe("translation cache", () => {
  it("stores and returns entries for the same revision only", () => {
    const s = storage(); let now = 1000; const cache = createTranslationCache(s, () => now);
    cache.set("milk tea", { text: "奶茶", provider: "glossary", revision: "r1", at: now });
    expect(cache.get("milk tea", "r1")?.text).toBe("奶茶"); expect(cache.get("milk tea", "r2")).toBeNull(); expect(JSON.parse(s.map.get(TRANSLATION_CACHE_KEY)!).version).toBe(1);
    now += 31 * 24 * 3600 * 1000; expect(cache.get("milk tea", "r1")).toBeNull();
  });
  it("keeps at most 300 entries, evicting the least recently used", () => {
    const s = storage(); let now = 0; const cache = createTranslationCache(s, () => ++now);
    for (let i = 0; i < 301; i++) cache.set(`k${i}`, { text: "x", provider: "model", revision: "r", at: now });
    expect(cache.get("k0", "r")).toBeNull(); expect(cache.get("k300", "r")).not.toBeNull();
  });
  it("survives corrupt JSON and storage write failures", () => {
    const s = storage({ [TRANSLATION_CACHE_KEY]: "{not json" }); const cache = createTranslationCache(s, () => 1);
    expect(cache.get("a", "r")).toBeNull(); s.setItem = () => { throw new Error("quota"); };
    cache.set("a", { text: "甲", provider: "model", revision: "r", at: 1 }); expect(cache.get("a", "r")?.text).toBe("甲");
    cache.clear(); expect(cache.get("a", "r")).toBeNull();
  });
});
