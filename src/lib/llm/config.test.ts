import { describe, expect, it } from "vitest";
import { DEFAULT_BASE_URL, DEFAULT_MODEL, parseCloudConfig } from "./config";
describe("cloud config", () => {
  it("is off without a key and fills the Beijing endpoint and qwen3.5-plus by default", () => {
    expect(parseCloudConfig({})).toBeNull(); expect(parseCloudConfig({ apiKey: "  " })).toBeNull();
    expect(parseCloudConfig({ apiKey: " k " })).toEqual({ apiKey: "k", baseUrl: DEFAULT_BASE_URL, model: DEFAULT_MODEL });
  });
  it("trims a trailing slash, keeps a chosen model and rejects non-https endpoints", () => {
    expect(parseCloudConfig({ apiKey: "k", baseUrl: "https://x.test/v1/", model: "qwen3.7-plus" })).toEqual({ apiKey: "k", baseUrl: "https://x.test/v1", model: "qwen3.7-plus" });
    expect(parseCloudConfig({ apiKey: "k", baseUrl: "http://x.test/v1" })).toBeNull();
  });
});
