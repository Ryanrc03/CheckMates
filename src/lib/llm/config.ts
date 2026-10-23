export type CloudConfig = { apiKey: string; baseUrl: string; model: string };
export const DEFAULT_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1"; // China (Beijing); international keys need https://dashscope-intl.aliyuncs.com/compatible-mode/v1
export const DEFAULT_MODEL = "qwen3.5-plus";
export function parseCloudConfig(raw: { apiKey?: string; baseUrl?: string; model?: string }): CloudConfig | null {
  const apiKey = raw.apiKey?.trim(); if (!apiKey) return null;
  const baseUrl = (raw.baseUrl?.trim() || DEFAULT_BASE_URL).replace(/\/+$/, ""); if (!baseUrl.startsWith("https://")) return null;
  return { apiKey, baseUrl, model: raw.model?.trim() || DEFAULT_MODEL };
}
/** NEXT_PUBLIC_ values are inlined into the public bundle at build time, so they must be read by literal name; without a key the cloud engine is hidden. */
export function cloudConfig(): CloudConfig | null {
  return parseCloudConfig({ apiKey: process.env.NEXT_PUBLIC_DASHSCOPE_API_KEY, baseUrl: process.env.NEXT_PUBLIC_DASHSCOPE_BASE_URL, model: process.env.NEXT_PUBLIC_DASHSCOPE_MODEL });
}
