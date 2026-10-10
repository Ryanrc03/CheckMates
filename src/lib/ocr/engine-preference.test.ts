import { describe, expect, it } from "vitest";
import { readEnginePreference, writeEnginePreference, ENGINE_PREFERENCE_KEY } from "./engine-preference";
const storage = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) }; };
describe("engine preference", () => {
  it("defaults to standard, persists precise, ignores junk", () => {
    const s = storage(); expect(readEnginePreference(s)).toBe("standard"); writeEnginePreference(s, "precise"); expect(s.getItem(ENGINE_PREFERENCE_KEY)).toBe("precise"); expect(readEnginePreference(s)).toBe("precise");
    s.setItem(ENGINE_PREFERENCE_KEY, "turbo"); expect(readEnginePreference(s)).toBe("standard");
  });
  it("treats a missing or throwing storage as standard and never throws on write", () => {
    expect(readEnginePreference(null)).toBe("standard");
    const broken = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); }, removeItem: () => {} };
    expect(readEnginePreference(broken)).toBe("standard"); expect(() => writeEnginePreference(broken, "precise")).not.toThrow(); expect(() => writeEnginePreference(null, "precise")).not.toThrow();
  });
});
