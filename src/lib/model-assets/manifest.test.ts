import { describe, expect, it } from "vitest";
import { isManifest, bundleUrl } from "./manifest";
const bundle = { id: "translate-enzh", version: "1", license: "x", totalBytes: 1, downloadBytes: 1, extraBytes: 0, files: [{ path: "a.bin", bytes: 1, sha256: "0".repeat(64), role: "model", cache: "cache-api" }], sources: [] };
const ocr = { ...bundle, id: "ocr-precise" };
describe("manifest", () => {
  it("accepts a well-formed manifest and rejects junk", () => {
    expect(isManifest({ version: 1, bundles: { "translate-enzh": bundle, "ocr-precise": ocr } })).toBe(true);
    expect(isManifest({ version: 2, bundles: { "translate-enzh": bundle, "ocr-precise": ocr } })).toBe(false);
    expect(isManifest({ version: 1, bundles: { "translate-enzh": { ...bundle, files: "nope" }, "ocr-precise": ocr } })).toBe(false);
    expect(isManifest({ version: 1, bundles: { "translate-enzh": bundle, "ocr-precise": ocr, extra: { ...bundle, id: "extra" } } })).toBe(false);
    expect(isManifest(null)).toBe(false);
  });
  it("requires every known bundle, so consumers can index bundles[id] safely", () => {
    expect(isManifest({ version: 1, bundles: {} })).toBe(false);
    expect(isManifest({ version: 1, bundles: { "translate-enzh": bundle } })).toBe(false);
    expect(isManifest({ version: 1, bundles: { "ocr-precise": ocr } })).toBe(false);
  });
  it("rejects files with negative sizes or a hash that is not lowercase sha-256 hex", () => {
    const withFile = (file: Record<string, unknown>) => ({ version: 1, bundles: { "translate-enzh": { ...bundle, files: [{ ...bundle.files[0], ...file }] }, "ocr-precise": ocr } });
    expect(isManifest(withFile({ bytes: -1 }))).toBe(false);
    expect(isManifest(withFile({ bytes: 1.5 }))).toBe(false);
    expect(isManifest(withFile({ sha256: "00" }))).toBe(false);
    expect(isManifest(withFile({ sha256: "A".repeat(64) }))).toBe(false);
    expect(isManifest(withFile({ bytes: 0 }))).toBe(true);
  });
  it("builds versioned same-origin urls", () => {
    expect(bundleUrl("https://x.test", bundle as never, "runtime/w.js")).toBe("https://x.test/models/translate-enzh/1/runtime/w.js");
  });
});
