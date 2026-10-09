import { describe, expect, it } from "vitest";
import { isManifest, bundleUrl } from "./manifest";
const bundle = { id: "translate-enzh", version: "1", license: "x", totalBytes: 1, downloadBytes: 1, extraBytes: 0, files: [{ path: "a.bin", bytes: 1, sha256: "00", role: "model", cache: "cache-api" }], sources: [] };
describe("manifest", () => {
  it("accepts a well-formed manifest and rejects junk", () => {
    expect(isManifest({ version: 1, bundles: { "translate-enzh": bundle, "ocr-precise": { ...bundle, id: "ocr-precise" } } })).toBe(true);
    expect(isManifest({ version: 2, bundles: {} })).toBe(false);
    expect(isManifest({ version: 1, bundles: { "translate-enzh": { ...bundle, files: "nope" } } })).toBe(false);
    expect(isManifest(null)).toBe(false);
  });
  it("builds versioned same-origin urls", () => {
    expect(bundleUrl("https://x.test", bundle as never, "runtime/w.js")).toBe("https://x.test/models/translate-enzh/1/runtime/w.js");
  });
});
