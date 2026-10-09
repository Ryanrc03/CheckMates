import { test, expect, type Page } from "@playwright/test";
const CJK = /[㐀-鿿]/;
async function openSampleReceipt(page: Page) { await page.goto("/"); await page.getByRole("button", { name: "Try a sample bill" }).click(); await expect(page.getByRole("heading", { name: "Check the receipt" })).toBeVisible(); }
test("glossary names appear instantly and nothing is downloaded before consent", async ({ page }, info) => {
  const origin = new URL(info.project.use.baseURL!).origin; const model: string[] = []; const external: string[] = [];
  page.on("request", req => { if (req.url().includes("/models/translate-enzh/")) model.push(req.url()); if (/^https?:/.test(req.url()) && !req.url().startsWith(origin)) external.push(req.url()); });
  await openSampleReceipt(page); await expect(page.locator(".dish-translation")).toHaveCount(0);
  await page.getByRole("switch", { name: "Show Chinese names" }).check();
  await expect(page.locator(".dish-translation").first()).toHaveText("汉堡"); await expect(page.locator(".dish-translation")).toHaveCount(3);
  await page.getByLabel("Item 1 name").fill("Grilled Octopus"); await expect(page.getByText("One-time download of 57 MB")).toBeVisible();
  expect(model).toEqual([]); expect(external).toEqual([]);
  await page.getByRole("switch", { name: "Show Chinese names" }).uncheck(); await expect(page.locator(".dish-translation")).toHaveCount(0);
});
test("the on-device model downloads once, translates unknown names, survives reload, and can be removed", async ({ page }, info) => {
  test.setTimeout(240000);
  const origin = new URL(info.project.use.baseURL!).origin; const external: string[] = []; let modelRequests = 0;
  const isModelData = (url: string) => url.includes("/models/translate-enzh/") && !url.endsWith(".js"); // the worker script and its glue are plain same-origin scripts (manifest cache: http) fetched on every page load; model and wasm files must come from the Cache API
  page.on("request", req => { if (isModelData(req.url())) modelRequests++; if (/^https?:/.test(req.url()) && !req.url().startsWith(origin)) external.push(req.url()); });
  await openSampleReceipt(page); await page.getByRole("switch", { name: "Show Chinese names" }).check(); await page.getByLabel("Item 1 name").fill("Grilled Octopus");
  await page.getByRole("button", { name: "Download and translate" }).click();
  const label = page.locator(".item-editor").first().locator(".dish-translation"); await expect(label).toHaveText(CJK, { timeout: 180000 }); const first = await label.textContent();
  expect(external).toEqual([]); expect(modelRequests).toBeGreaterThan(0); const afterFirst = modelRequests;
  await expect.poll(() => page.evaluate(() => caches.keys())).toContain("cm-models-translate-enzh-v2.2-b0.6.0");
  await page.reload(); await expect(page.getByRole("switch", { name: "Show Chinese names" })).toBeChecked(); await expect(page.locator(".item-editor").first().locator(".dish-translation")).toHaveText(first!);
  await page.getByLabel("Item 2 name").fill("Smoked Eel Rice Bowl"); await expect(page.locator(".item-editor").nth(1).locator(".dish-translation")).toHaveText(CJK, { timeout: 60000 });
  expect(modelRequests).toBe(afterFirst); // cache hit: no further model downloads
  await page.getByRole("button", { name: "Back", exact: true }).click(); await page.getByText("Offline data").click();
  await page.getByRole("button", { name: /Remove translation model/ }).click(); await expect.poll(() => page.evaluate(() => caches.keys())).not.toContain("cm-models-translate-enzh-v2.2-b0.6.0");
});
test("cancelling the download keeps the form usable", async ({ page }) => {
  await page.route("**/models/translate-enzh/**/model.enzh.intgemm.alphas.bin", async route => { await new Promise(r => setTimeout(r, 3000)); await route.continue().catch(() => {}); });
  await openSampleReceipt(page); await page.getByRole("switch", { name: "Show Chinese names" }).check(); await page.getByLabel("Item 1 name").fill("Grilled Octopus");
  await page.getByRole("button", { name: "Download and translate" }).click(); await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByRole("button", { name: "Download and translate" })).toBeVisible(); await page.getByLabel("Price for Grilled Octopus").fill("9.00"); await expect(page.getByLabel("Price for Grilled Octopus")).toHaveValue("9.00");
});
