import { defineConfig, devices } from "@playwright/test";
const port = Number(process.env.E2E_PORT ?? (process.env.E2E_PRODUCTION ? 3200 : 3100));
export default defineConfig({
  testDir: "./tests/e2e", timeout: 150000, expect: { timeout: 10000 }, workers: 1,
  reporter: [["list"], ["json", { outputFile: "test-results/results.json" }]],
  use: { baseURL: `http://127.0.0.1:${port}`, viewport: { width: 375, height: 812 }, trace: "retain-on-failure",
    storageState: { cookies: [], origins: [{ origin: `http://127.0.0.1:${port}`, localStorage: [{ name: "bitesplit-ocr-engine", value: "standard" }] }] }, // existing OCR specs keep the on-device engine; cloud-ocr.spec opts out
  },
  // WebKit (the engine behind every iOS browser) runs the OCR specs: the precise engine once crashed iOS tabs by exhausting memory, and this build also lacks OffscreenCanvas in workers.
  projects: [{ name: "chromium", use: { browserName: "chromium" } }, { name: "webkit", use: { ...devices["iPhone 14"], browserName: "webkit" }, testMatch: /(precise-ocr|ocr-flow)\.spec\.ts$/ }],
  webServer: { command: process.env.E2E_PRODUCTION ? `npm run start -- --port ${port}` : `npm run dev -- --port ${port}`, url: `http://127.0.0.1:${port}`, reuseExistingServer: !process.env.CI, timeout: 120000,
    env: { NEXT_PUBLIC_DASHSCOPE_API_KEY: "e2e-fake-key", NEXT_PUBLIC_DASHSCOPE_BASE_URL: "https://dashscope.e2e.invalid/compatible-mode/v1", NEXT_PUBLIC_DASHSCOPE_MODEL: "qwen3.5-plus" } },
});
