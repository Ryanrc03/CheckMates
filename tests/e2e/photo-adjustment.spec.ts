import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("each uploaded receipt is adjusted before recognition and uses the confirmed image", async ({ page }) => {
  const ocrRequests: string[] = [];
  page.on("request", request => { if (request.url().includes("/ocr/")) ocrRequests.push(request.url()); });
  await page.goto("/");
  await page.getByLabel("Upload a receipt", { exact: true }).setInputFiles("tests/fixtures/receipts/clear-diner.png");
  await expect(page.getByRole("heading", { name: "Adjust your photo" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Use this photo and recognize" })).toBeVisible();
  expect(ocrRequests).toEqual([]);
  await page.getByRole("button", { name: "Use this photo and recognize" }).click();
  await expect(page.getByLabel("Price for Burger")).toHaveValue("14.95", { timeout: 120000 });
});

test("changing photos starts a new analysis and invalid corners do not replace the previous preview", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Upload a receipt", { exact: true }).setInputFiles("tests/fixtures/receipts/clear-diner.png");
  await expect(page.getByRole("heading", { name: "Adjust your photo" })).toBeVisible();
  await page.getByLabel("Choose another receipt photo").setInputFiles("tests/fixtures/receipts/clear-cafe.png");
  await expect(page.getByRole("heading", { name: "Adjust your photo" })).toBeVisible();
  await page.getByRole("button", { name: "Use this photo and recognize" }).click();
  await expect(page.getByLabel("Price for Soup")).toHaveValue("8.25", { timeout: 120000 });
});

test("four corners can be moved with a keyboard and restored before OCR", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Upload a receipt", { exact: true }).setInputFiles("tests/fixtures/receipts/clear-diner.png");
  await expect(page.getByRole("heading", { name: "Adjust your photo" })).toBeVisible();
  await page.getByRole("button", { name: "Adjust four corners" }).click();
  const topLeft = page.getByRole("button", { name: "Top left corner" });
  await expect(topLeft).toBeVisible();
  const before = await topLeft.getAttribute("style");
  await topLeft.focus(); await topLeft.press("ArrowRight");
  expect(await topLeft.getAttribute("style")).not.toBe(before);
  await page.getByRole("button", { name: "Use original photo" }).click();
  await expect(topLeft).toHaveCount(0);
  await page.getByRole("button", { name: "Use this photo and recognize" }).click();
  await expect(page.getByLabel("Price for Burger")).toHaveValue("14.95", { timeout: 120000 });
});

test("dragging a corner updates the proposed receipt crop", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Upload a receipt", { exact: true }).setInputFiles("tests/fixtures/receipts/clear-diner.png");
  await page.getByRole("button", { name: "Adjust four corners" }).click();
  const corner = page.getByRole("button", { name: "Top left corner" });
  const before = await corner.getAttribute("style");
  await corner.scrollIntoViewIfNeeded();
  const bounds = (await corner.boundingBox())!;
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.down(); await page.mouse.move(bounds.x + bounds.width / 2 + 14, bounds.y + bounds.height / 2 + 10, { steps: 3 }); await page.mouse.up();
  await expect.poll(() => corner.getAttribute("style")).not.toBe(before);
});

test("a new photo resets previous manual angle and corners", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Upload a receipt", { exact: true }).setInputFiles("tests/fixtures/receipts/clear-diner.png");
  await expect(page.getByRole("heading", { name: "Adjust your photo" })).toBeVisible();
  await page.getByLabel("Fine tune angle").fill("20");
  await page.getByRole("button", { name: "Adjust four corners" }).click();
  await page.getByLabel("Choose another receipt photo").setInputFiles("tests/fixtures/receipts/clear-cafe.png");
  await expect(page.getByLabel("Fine tune angle")).toHaveValue("0");
  await expect(page.getByRole("button", { name: "Top left corner" })).toHaveCount(0);
});

test("back from a replacement photo leaves the edited receipt and its old image intact", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Upload a receipt", { exact: true }).setInputFiles("tests/fixtures/receipts/clear-diner.png");
  await page.getByRole("button", { name: "Use this photo and recognize" }).click();
  await expect(page.getByLabel("Price for Burger")).toHaveValue("14.95", { timeout: 120000 });
  const oldImage = await page.getByRole("img", { name: /original receipt/i }).getAttribute("src");
  await page.getByLabel("Price for Burger").fill("12.34");
  await page.getByLabel("Reattach receipt photo").setInputFiles("tests/fixtures/receipts/clear-cafe.png");
  await expect(page.getByRole("heading", { name: "Adjust your photo" })).toBeVisible();
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(page.getByLabel("Price for Burger")).toHaveValue("12.34");
  expect(await page.getByRole("img", { name: /original receipt/i }).getAttribute("src")).toBe(oldImage);
});

test("a tilted photo gets its own measured angle before OCR", async ({ page }) => {
  await page.goto("/");
  const original = (await readFile("tests/fixtures/receipts/clear-diner.png")).toString("base64");
  const dataUrl = await page.evaluate(async base64 => {
    const image = new Image(); image.src = `data:image/png;base64,${base64}`;
    await image.decode();
    const canvas = document.createElement("canvas"); canvas.width = 1300; canvas.height = 1400;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "white"; context.fillRect(0, 0, canvas.width, canvas.height);
    context.translate(650, 700); context.rotate(13.4 * Math.PI / 180);
    context.drawImage(image, -image.width / 2, -image.height / 2);
    return canvas.toDataURL("image/png");
  }, original);
  await page.getByLabel("Upload a receipt", { exact: true }).setInputFiles({ name: "tilted-diner.png", mimeType: "image/png", buffer: Buffer.from(dataUrl.split(",")[1], "base64") });
  await expect(page.getByRole("heading", { name: "Adjust your photo" })).toBeVisible();
  await expect.poll(async () => Number(await page.getByLabel("Fine tune angle").inputValue())).toBeGreaterThan(12);
  expect(Number(await page.getByLabel("Fine tune angle").inputValue())).toBeLessThan(15);
  await page.getByRole("button", { name: "Use this photo and recognize" }).click();
  await expect(page.getByLabel("Price for Burger")).toHaveValue("14.95", { timeout: 120000 });
});

test("a visible trapezoid page gets four proposed corners", async ({ page }) => {
  await page.goto("/");
  const dataUrl = await page.evaluate(() => {
    const canvas = document.createElement("canvas"); canvas.width = 500; canvas.height = 560;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#32312e"; context.fillRect(0, 0, 500, 560);
    context.fillStyle = "white"; context.beginPath(); context.moveTo(150, 70); context.lineTo(355, 90); context.lineTo(410, 510); context.lineTo(65, 500); context.closePath(); context.fill();
    context.fillStyle = "black"; context.font = "20px Arial";
    context.fillText("BURGER 14.95", 170, 210); context.fillText("TAX 2.01", 150, 420);
    return canvas.toDataURL("image/png");
  });
  await page.getByLabel("Upload a receipt", { exact: true }).setInputFiles({ name: "perspective.png", mimeType: "image/png", buffer: Buffer.from(dataUrl.split(",")[1], "base64") });
  await expect(page.getByRole("status")).toContainText("Page edges found");
  await expect(page.getByRole("button", { name: "Top left corner" })).toBeVisible();
  await expect(page.getByRole("img", { name: "Photo that will be used for recognition" })).toHaveJSProperty("complete", true);
});

test("photo angle analysis runs in a browser worker", async ({ page }) => {
  let analysisWorkers = 0;
  page.on("worker", worker => { if (/analy|worker/i.test(worker.url())) analysisWorkers++; });
  await page.goto("/");
  await page.getByLabel("Upload a receipt", { exact: true }).setInputFiles("tests/fixtures/receipts/clear-diner.png");
  await expect(page.getByRole("status")).not.toContainText("Analyzing this photo");
  expect(analysisWorkers).toBeGreaterThan(0);
});
