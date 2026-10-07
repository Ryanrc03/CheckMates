import { test, expect, type Page } from "@playwright/test";
const fixture = (name: string) => `tests/fixtures/receipts/${name}`;
async function useAdjustedPhoto(page: Page) {
  await expect(page.getByRole("heading", { name: "Adjust your photo" })).toBeVisible();
  await page.getByRole("button", { name: "Use this photo and recognize" }).click();
  await expect(page.getByRole("heading", { name: "Adjust your photo" })).toBeHidden();
}
async function completeSharedBill(page: Page, total: string) {
  const review = page.getByRole("checkbox"); if (await review.count()) await review.check();
  await page.getByRole("button", { name: "Add friends" }).click();
  for (const name of ["A", "B"]) { await page.getByLabel("Friend's name").fill(name); await page.getByLabel("Friend's name").press("Enter"); }
  await page.getByRole("button", { name: "Assign items" }).click();
  for (const button of await page.getByRole("button", { name: "Everyone", exact: true }).all()) await button.click();
  await page.getByRole("button", { name: "See the split" }).click(); await expect(page.getByTestId("bill-total")).toContainText(total);
}
for (const [name, firstItem, firstPrice, tax, total] of [["clear-diner", "Burger", "14.95", "2.01", "$26.41"], ["clear-cafe", "Soup", "8.25", "1.32", "$19.82"]]) {
  test(`real browser worker reads ${name} and finishes a bill`, async ({ page }, info) => {
    const origin = new URL(info.project.use.baseURL!).origin;
    const external: string[] = []; const errors: string[] = []; const assets: string[] = []; const posts: string[] = [];
    page.on("request", req => { if (req.method() === "POST") posts.push(req.url()); if (/^https?:/.test(req.url()) && !req.url().startsWith(origin)) external.push(req.url()); });
    page.on("response", res => { if (res.url().includes("/ocr/")) { assets.push(res.url()); if (res.status() >= 400) errors.push(res.url()); } });
    await page.goto("/"); const started = Date.now(); await page.getByLabel("Upload a receipt", { exact: true }).setInputFiles(fixture(`${name}.png`)); await useAdjustedPhoto(page);
    await expect(page.getByRole("heading", { name: "Check the receipt" })).toBeVisible({ timeout: 120000 });
    await expect(page.getByLabel(`Price for ${firstItem}`, { exact: true })).toHaveValue(firstPrice); await expect(page.getByLabel("Tax", { exact: true })).toHaveValue(tax);
    const inputs = await page.locator('[aria-label^="Price for"]').evaluateAll(nodes => nodes.map(n => (n as HTMLInputElement).value));
    await info.attach("ocr-timing", { body: JSON.stringify({ elapsedMs: Date.now() - started, assets, external, errors, inputs }), contentType: "application/json" });
    expect(assets.some(url => url.endsWith("worker.min.js"))).toBe(true); expect(errors).toEqual([]); expect(external).toEqual([]); expect(posts).toEqual([]);
    await page.reload(); await expect(page.getByLabel(`Price for ${firstItem}`, { exact: true })).toHaveValue(firstPrice);
    await page.getByLabel("Reattach receipt photo").setInputFiles(fixture(`${name}.png`)); await expect(page.getByRole("heading", { name: "Adjust your photo" })).toBeVisible(); await page.getByRole("button", { name: "Back", exact: true }).click(); await expect(page.getByLabel(`Price for ${firstItem}`, { exact: true })).toHaveValue(firstPrice);
    await completeSharedBill(page, total);
  });
}
test("Line Thai redacted photo: recognize exact amounts and split 78.48 without edits", async ({ page }, info) => {
  await page.goto("/"); await page.getByLabel("Upload a receipt", { exact: true }).setInputFiles(fixture("line-thai-cafe-2026-09-05-redacted.png")); await useAdjustedPhoto(page);
  await expect(page.getByRole("heading", { name: "Check the receipt" })).toBeVisible({ timeout: 120000 });
  await page.getByText("Original recognized text", { exact: true }).click();
  const before = await page.locator("main").innerText(); await info.attach("before-correction", { body: before, contentType: "text/plain" });
  const prices = await page.locator('[aria-label^="Price for"]').evaluateAll(nodes => nodes.map(n => (n as HTMLInputElement).value));
  expect(prices).toEqual(["13.90","7.90","4.00","25.80","12.90","8.00"]);
  await expect(page.getByLabel("Tax", {exact:true})).toHaveValue("5.98");
  await completeSharedBill(page, "$78.48"); await expect(page.getByTestId("share-A")).toContainText("$39.24"); await expect(page.getByTestId("share-B")).toContainText("$39.24");
  await info.attach("after-correction", { body: await page.locator("main").innerText(), contentType: "text/plain" });
});
test("blank image and invalid file keep manual entry available", async ({ page }) => {
  await page.goto("/"); await page.getByLabel("Upload a receipt", { exact: true }).setInputFiles({ name: "bad.png", mimeType: "image/png", buffer: Buffer.from("not an image") });
  await expect(page.locator("main").getByRole("alert")).toContainText("could not be opened");
  await page.getByLabel("Choose another receipt photo").setInputFiles(fixture("blank.png")); await useAdjustedPhoto(page);
  await expect(page.locator("main").getByRole("alert")).toContainText("No text found", { timeout: 120000 }); await page.getByRole("button", { name: "Enter items manually" }).click();
  await expect(page.locator('[aria-label^="Price for"]')).toHaveCount(0); await page.getByRole("button", { name: "Add item", exact: true }).click();
  await page.getByLabel("Item 1 name").fill("Manual soup"); await page.getByLabel("Price for Manual soup").fill("8.00"); await page.getByLabel("Tax", { exact: true }).fill("0");
  await completeSharedBill(page, "$8.00");
});
test("cancel, reselect, rotate, and reset ignore late recognition", async ({ page }) => {
  await page.goto("/");
  await page.route("**/ocr/eng.traineddata.gz", async route => { await new Promise(r => setTimeout(r, 1800)); await route.continue().catch(() => {}); });
  await page.getByLabel("Upload a receipt", { exact: true }).setInputFiles(fixture("clear-diner.png")); await useAdjustedPhoto(page); await page.getByRole("button", { name: "Cancel recognition" }).click();
  await expect(page.getByLabel("Upload a receipt", { exact: true })).toBeVisible();
  await page.getByLabel("Upload a receipt", { exact: true }).setInputFiles(fixture("clear-cafe.png")); await useAdjustedPhoto(page); await expect(page.getByLabel("Price for Soup")).toHaveValue("8.25", { timeout: 120000 });
  await page.getByRole("button", { name: "Adjust or rotate photo" }).click(); await page.getByRole("button", { name: "Rotate 90°", exact: true }).click(); await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(page.getByLabel("Price for Soup")).toHaveValue("8.25");
  await page.getByRole("button", { name: "Back", exact: true }).click(); await page.getByRole("button", { name: "Try a sample bill" }).click();
  await expect(page.getByLabel("Price for Burger")).toHaveValue("14.95"); await page.reload(); await expect(page.getByLabel("Price for Burger")).toHaveValue("14.95");
});
test("model failure and timeout both allow retry with a real worker", async ({ page }) => {
  await page.goto("/"); await page.route("**/ocr/eng.traineddata.gz", route => route.abort("failed"));
  await page.getByLabel("Upload a receipt", { exact: true }).setInputFiles(fixture("clear-diner.png")); await useAdjustedPhoto(page);
  await expect(page.getByRole("button", { name: "Retry recognition" })).toBeVisible({ timeout: 120000 });
  await expect(page.getByRole("button", { name: "Enter items manually" })).toBeVisible();
  await page.unroute("**/ocr/eng.traineddata.gz"); await page.getByRole("button", { name: "Retry recognition" }).click();
  await useAdjustedPhoto(page);
  await expect(page.getByLabel("Price for Burger")).toHaveValue("14.95", { timeout: 120000 });
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await page.clock.install();
  await page.route("**/ocr/worker.min.js", async route => { await new Promise(r => setTimeout(r, 2500)); await route.continue().catch(() => {}); });
  page.on("dialog", dialog => dialog.accept());
  await page.getByLabel("Upload a receipt", { exact: true }).setInputFiles(fixture("clear-cafe.png")); await useAdjustedPhoto(page); await expect(page.getByText("Loading recognition resources")).toBeVisible();
  await page.clock.fastForward(120001); await expect(page.locator("main").getByRole("alert")).toContainText("120 seconds");
  await expect(page.getByLabel("Price for Burger")).toHaveValue("14.95");
  await page.unroute("**/ocr/worker.min.js"); await page.getByLabel("Reattach receipt photo").setInputFiles(fixture("clear-cafe.png")); await useAdjustedPhoto(page);
  await expect(page.getByLabel("Price for Soup")).toHaveValue("8.25", { timeout: 120000 });
});
test("blurred receipt exposes manual review without sample substitution", async ({ page }) => {
  await page.goto("/"); await page.getByLabel("Upload a receipt", { exact: true }).setInputFiles(fixture("blurred.png")); await useAdjustedPhoto(page);
  await expect(page.getByRole("button", { name: "Enter items manually" }).or(page.getByRole("heading", { name: "Check the receipt" }))).toBeVisible({ timeout: 120000 });
  if (await page.getByRole("button", { name: "Enter items manually" }).count()) await page.getByRole("button", { name: "Enter items manually" }).click();
  await expect(page.getByText("Your photo · review required", { exact: true })).toBeVisible();
  await expect(page.getByText("Sample bill · editable", { exact: true })).toHaveCount(0);
});
test("cold then warm recognition measures real resource loads", async ({ page }, info) => {
  const assets: { url: string; status: number }[] = [];
  page.context().on("response", response => { if (response.url().includes("/ocr/")) assets.push({ url: response.url(), status: response.status() }); });
  await page.goto("/"); const coldStart = Date.now(); await page.getByLabel("Upload a receipt", { exact: true }).setInputFiles(fixture("clear-cafe.png")); await useAdjustedPhoto(page);
  await expect(page.getByLabel("Price for Soup")).toHaveValue("8.25", { timeout: 120000 }); const coldMs = Date.now() - coldStart;
  await page.getByLabel("Reattach receipt photo").setInputFiles(fixture("clear-diner.png")); await expect(page.getByRole("heading", { name: "Adjust your photo" })).toBeVisible();
  page.on("dialog", d => d.accept()); const warmStart = Date.now(); await useAdjustedPhoto(page);
  await expect(page.getByLabel("Price for Burger")).toHaveValue("14.95", { timeout: 120000 }); const warmMs = Date.now() - warmStart;
  expect(coldMs).toBeLessThan(120000); expect(warmMs).toBeLessThan(120000); expect(assets.every(a => a.status < 400)).toBe(true);
  await info.attach("cold-warm-real-ocr", { body: JSON.stringify({ coldMs, warmMs, assets }), contentType: "application/json" });
});
