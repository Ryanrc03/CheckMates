import { expect, test, type Page } from "@playwright/test";

async function openSampleReceipt(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Try a sample bill" }).click();
  await expect(page.getByRole("heading", { name: "Check the receipt" })).toBeVisible();
}

async function addFriends(page: Page, names: string[]) {
  await page.getByRole("button", { name: "Add friends" }).click();
  for (const name of names) { await page.getByLabel("Friend's name").fill(name); await page.getByLabel("Friend's name").press("Enter"); }
}

// Text at least 12px, touch targets at least 44px, no sideways scroll. Decorative aria-hidden subtrees and sr-only text are skipped.
async function audit(page: Page, step: string) {
  const report = await page.evaluate(() => {
    const visible = (el: Element) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden" && !el.closest("[aria-hidden=true], .sr-only"); };
    const small = [...document.querySelectorAll("main *")].filter(el => visible(el) && [...el.childNodes].some(n => n.nodeType === Node.TEXT_NODE && n.textContent!.trim()) && parseFloat(getComputedStyle(el).fontSize) < 12).map(el => `${el.tagName}.${el.className}: ${el.textContent!.trim().slice(0, 30)}`);
    const targets = [...document.querySelectorAll("main button, main select, main summary, main input:not([type=checkbox]):not([type=radio]):not([type=file]), main label:has(> input[type=file])")].filter(visible)
      .map(el => ({ el, r: el.getBoundingClientRect() })).filter(({ el, r }) => r.height < 43.5 || (el.matches("button") && r.width < 43.5))
      .map(({ el, r }) => `${el.tagName} "${(el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 30)}" ${Math.round(r.width)}x${Math.round(r.height)}`);
    return { small, targets, overflow: document.documentElement.scrollWidth > innerWidth };
  });
  expect(report.small, `${step}: text below 12px`).toEqual([]);
  expect(report.targets, `${step}: touch targets below 44px`).toEqual([]);
  expect(report.overflow, `${step}: horizontal overflow`).toBe(false);
}

test("receipt amounts share one right edge", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await openSampleReceipt(page);
  const edges = await page.locator(".receipt-editor .money").evaluateAll(els => els.map(el => Math.round(el.getBoundingClientRect().right)));
  expect(edges.length).toBeGreaterThanOrEqual(8);
  expect(Math.max(...edges) - Math.min(...edges)).toBeLessThanOrEqual(1);
});

test("header, content and bottom bar share one column on desktop", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openSampleReceipt(page);
  const box = (selector: string) => page.locator(selector).first().evaluate(el => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right }; });
  const main = await box("main"), brand = await box(".brand"), reset = await box(".reset-bill");
  const first = await box(".bottom-actions-inner > :first-child"), last = await box(".bottom-actions-inner > :last-child");
  for (const left of [brand.left, first.left]) expect(Math.abs(left - main.left)).toBeLessThanOrEqual(1);
  for (const right of [reset.right, last.right]) expect(Math.abs(right - main.right)).toBeLessThanOrEqual(1);
});

test("every step keeps 12px text, 44px targets and no overflow at 375px", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Try a sample bill" })).toBeVisible();
  await audit(page, "home");
  await page.getByRole("button", { name: "Try a sample bill" }).click();
  await audit(page, "receipt");
  await addFriends(page, ["Alex", "Christopher Montgomery"]);
  await audit(page, "people");
  await page.getByRole("button", { name: "Assign items" }).click();
  for (const button of await page.getByRole("button", { name: "Everyone", exact: true }).all()) await button.click();
  await audit(page, "split");
  await page.getByRole("button", { name: "See the split" }).click();
  await page.locator(".person-result summary").first().click();
  await audit(page, "result");
});

test("photo adjustment shows the step bar, the bottom bar and the same rules", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  await page.getByLabel("Upload a receipt", { exact: true }).setInputFiles("tests/fixtures/receipts/clear-cafe.png");
  await expect(page.getByRole("heading", { name: "Adjust your photo" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Bill progress" })).toBeVisible();
  await expect(page.locator(".bottom-actions").getByRole("button", { name: /^Use this photo and recognize/ })).toBeVisible();
  await audit(page, "adjust");
});

test("friend rows show each name once in six distinct colors and rename in place", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await openSampleReceipt(page);
  const names = ["Ann", "Ben", "Cat", "Dan", "Eve", "Fay"];
  await addFriends(page, names);
  const rows = page.locator(".friend-row");
  await expect(rows).toHaveCount(6);
  for (const [i, name] of names.entries()) {
    await expect(rows.nth(i).getByText(name, { exact: true })).toHaveCount(1);
    await expect(rows.nth(i).locator("input")).toHaveCount(0);
  }
  const colors = await rows.evaluateAll(els => els.map(el => getComputedStyle(el).backgroundColor));
  expect(new Set(colors).size).toBe(6);
  await page.getByRole("button", { name: "Rename Ben" }).click();
  await page.getByLabel("New name for Ben").fill("Benji");
  await page.getByLabel("New name for Ben").press("Enter");
  await expect(rows.nth(1).getByText("Benji", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Rename Benji" })).toBeFocused();
  await page.getByRole("button", { name: "Rename Cat" }).click();
  await page.getByLabel("New name for Cat").fill("Nope");
  await page.getByLabel("New name for Cat").press("Escape");
  await expect(rows.nth(2).getByText("Cat", { exact: true })).toBeVisible();
});
