import { defineConfig } from "@playwright/test";
const port = Number(process.env.E2E_PORT ?? (process.env.E2E_PRODUCTION ? 3200 : 3100));
export default defineConfig({
  testDir: "./tests/e2e", timeout: 150000, expect: { timeout: 10000 }, workers: 1,
  reporter: [["list"], ["json", { outputFile: "test-results/results.json" }]],
  use: { baseURL: `http://127.0.0.1:${port}`, viewport: { width: 375, height: 812 }, trace: "retain-on-failure" },
  webServer: { command: process.env.E2E_PRODUCTION ? `npm run start -- --port ${port}` : `npm run dev -- --port ${port}`, url: `http://127.0.0.1:${port}`, reuseExistingServer: !process.env.CI, timeout: 120000 },
});
