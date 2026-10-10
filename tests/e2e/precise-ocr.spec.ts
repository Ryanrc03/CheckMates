import { test, expect } from "@playwright/test";
const fixture = (name: string) => `tests/fixtures/receipts/${name}`;
test("precise engine downloads once, recognizes the diner receipt, and reuses the cache", async ({ page }, info) => {
  test.setTimeout(300000);
  const origin = new URL(info.project.use.baseURL!).origin; const external: string[] = []; let bundleRequests = 0;
  page.on("request", req => { if (req.url().includes("/models/ocr-precise/")) bundleRequests++; if (/^https?:/.test(req.url()) && !req.url().startsWith(origin)) external.push(req.url()); });
  await page.goto("/"); await page.getByLabel("Upload a receipt", { exact: true }).setInputFiles(fixture("clear-diner.png"));
  await expect(page.getByRole("heading", { name: "Adjust your photo" })).toBeVisible(); await page.getByLabel(/^Precise/).check(); await page.getByRole("button", { name: "Use this photo and recognize (precise)" }).click();
  await expect(page.getByRole("status")).toContainText(/Downloading precise recognition model|Starting precise recognition|Recognizing/, { timeout: 60000 });
  await expect(page.getByRole("heading", { name: "Check the receipt" })).toBeVisible({ timeout: 240000 });
  await expect(page.getByLabel("Price for Burger", { exact: true })).toHaveValue("14.95"); await expect(page.getByLabel("Price for Fries", { exact: true })).toHaveValue("5.95"); await expect(page.getByLabel("Price for Lemonade", { exact: true })).toHaveValue("3.50"); await expect(page.getByLabel("Tax", { exact: true })).toHaveValue("2.01");
  await expect(page.getByText("Printed total")).toContainText("$26.41"); expect(external).toEqual([]); expect(bundleRequests).toBeGreaterThan(0);
  await expect.poll(() => page.evaluate(() => caches.keys())).toContain("cm-models-ocr-precise-vppocrv5m-ort1.24.3");
  const before = bundleRequests; await page.getByRole("button", { name: "Recognize again" }).click(); await expect(page.getByLabel(/^Precise/)).toBeChecked();
  page.once("dialog", d => d.accept()); await page.getByRole("button", { name: "Use this photo and recognize (precise)" }).click();
  await expect(page.getByLabel("Price for Burger", { exact: true })).toHaveValue("14.95", { timeout: 240000 });
  expect(bundleRequests - before).toBeLessThanOrEqual(2); // only runtime files via HTTP cache revalidation, model tars come from Cache API
});
test("cancelling a precise download returns to the start", async ({ page }) => {
  await page.route("**/models/ocr-precise/**/*.tar", async route => { await new Promise(r => setTimeout(r, 4000)); await route.continue().catch(() => {}); });
  await page.goto("/"); await page.getByLabel("Upload a receipt", { exact: true }).setInputFiles(fixture("clear-diner.png")); await page.getByLabel(/^Precise/).check(); await page.getByRole("button", { name: "Use this photo and recognize (precise)" }).click();
  await page.getByRole("button", { name: "Cancel recognition" }).click(); await expect(page.getByLabel("Upload a receipt", { exact: true })).toBeVisible();
});
