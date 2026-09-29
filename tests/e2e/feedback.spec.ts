import { test, expect, type Page } from "@playwright/test";

/** The exact scenario from the 2026-09-29 experience review: 4 dishes, 8.25% tax, 18% tip, 3 friends. */
async function reviewedReceipt(page: Page) {
  await page.goto("/"); await page.getByRole("button", { name: "Try a sample bill" }).click();
  await page.getByRole("button", { name: "Add item", exact: true }).click();
  await page.getByLabel("Item 4 name").fill("Chicken Salad"); await page.getByLabel("Price for Chicken Salad").fill("12.50");
  await page.getByRole("button", { name: "Tax as percent" }).click(); await page.getByLabel("Tax", { exact: true }).fill("8.25");
  await page.getByRole("group", { name: "Quick tip" }).getByRole("button", { name: "18%" }).click();
}
async function addFriends(page: Page, names: string[]) {
  for (const name of names) { await page.getByLabel("Friend's name").fill(name); await page.getByLabel("Friend's name").press("Enter"); }
}

test("percent tax, quick tip, readable friend count, reversible Everyone and exact shares", async ({ page }) => {
  await reviewedReceipt(page);
  await expect(page.getByText("% of items = $3.04")).toBeVisible();
  await expect(page.getByText("% of items = $6.64")).toBeVisible();
  await expect(page.getByRole("button", { name: "18%" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".grand-total")).toContainText("$46.58");
  await page.getByRole("button", { name: "Add friends" }).click();
  await addFriends(page, ["Alice", "Bob", "Carol"]);
  await expect(page.getByTestId("friend-count")).toHaveText("3 friends at the table");
  await page.getByRole("button", { name: "Assign items" }).click();
  for (const [dish, friend] of [["Burger", "Alice"], ["Fries", "Bob"], ["Lemonade", "Carol"]]) await page.getByRole("group", { name: `Assign ${dish}` }).getByRole("button", { name: friend, exact: true }).click();
  const salad = page.getByRole("group", { name: "Assign Chicken Salad" }); const everyone = salad.getByRole("button", { name: "Everyone", exact: true });
  await everyone.click(); await expect(everyone).toHaveAttribute("aria-pressed", "true");
  await everyone.click(); await expect(everyone).toHaveAttribute("aria-pressed", "false"); await expect(salad.getByText("Choose at least one friend")).toBeVisible();
  await everyone.click();
  await page.getByRole("button", { name: "See the split" }).click();
  await expect(page.getByTestId("share-Alice")).toContainText("$24.14"); await expect(page.getByTestId("share-Bob")).toContainText("$12.77"); await expect(page.getByTestId("share-Carol")).toContainText("$9.67");
  await expect(page.getByTestId("bill-total")).toContainText("$46.58");
  // Percentages are kept after confirming, so later price edits recalculate tax and tip.
  await page.getByRole("navigation", { name: "Bill progress" }).getByRole("button", { name: /Receipt/ }).click();
  await expect(page.getByLabel("Tax", { exact: true })).toHaveValue("8.25"); await expect(page.getByLabel("Added tip")).toHaveValue("18");
  // 37.95 + 8.25% (3.13) + 18% (6.83)
  await page.getByLabel("Price for Burger").fill("16.00"); await expect(page.locator(".grand-total")).toContainText("$47.91");
});

test("progress shows done steps as checks and lets you jump back", async ({ page }) => {
  await reviewedReceipt(page); await page.getByRole("button", { name: "Add friends" }).click();
  await addFriends(page, ["A", "B"]); await page.getByRole("button", { name: "Split evenly" }).click();
  const progress = page.getByRole("navigation", { name: "Bill progress" });
  await expect(progress.locator("li.done")).toHaveCount(4); await expect(progress.locator('li[aria-current="step"]')).toContainText("Result");
  await page.getByRole("button", { name: "Change split" }).click();
  await expect(progress.locator("li.done")).toHaveCount(3); await expect(progress.locator('li[aria-current="step"]')).toContainText("Split");
  await expect(progress.locator("li.done").first()).toContainText("Start"); await expect(progress.locator("li.done").nth(1)).toContainText("Receipt");
  await expect(progress.getByRole("button", { name: /Result/ })).toBeVisible();
  await progress.getByRole("button", { name: /Friends/ }).click(); await expect(page.getByRole("heading", { name: "Who's in?" })).toBeVisible();
});

test("quantity multiplies the line and even split divides the whole bill", async ({ page }) => {
  await page.goto("/"); await page.getByRole("button", { name: "Try a sample bill" }).click();
  await page.getByLabel("Quantity for Lemonade").fill("2");
  await expect(page.getByText("2 × $3.50 = $7.00")).toBeVisible(); await expect(page.locator(".totals-line").first()).toContainText("$27.90");
  await page.getByLabel("Quantity for Fries").fill("0"); await page.getByRole("button", { name: "Add friends" }).click();
  await expect(page.getByLabel("Quantity for Fries")).toHaveAttribute("aria-invalid", "true"); await page.getByLabel("Quantity for Fries").fill("1");
  await page.getByRole("button", { name: "Add friends" }).click(); await addFriends(page, ["A", "B", "C"]);
  await page.getByRole("button", { name: "Split evenly" }).click();
  // 27.90 + 2.01 tax = 29.91 → 9.97 each
  for (const name of ["A", "B", "C"]) await expect(page.getByTestId(`share-${name}`)).toContainText("$9.97");
  await page.getByTestId("share-A").locator("summary").click(); await expect(page.getByTestId("share-A")).toContainText("Split evenly");
  await page.getByRole("button", { name: "Change split" }).click(); await page.getByRole("button", { name: "By dish" }).click();
  await expect(page.getByText("0 of 3 items assigned")).toBeVisible(); await expect(page.getByRole("heading", { name: /Lemonade/ })).toContainText("× 2");
});

test("currency, share link and QR code round-trip to a read-only view", async ({ page, context }) => {
  await page.addInitScript(() => { Object.defineProperty(navigator, "clipboard", { value: { writeText: async (text: string) => { (window as unknown as { copied: string }).copied = text; } } }); });
  await page.goto("/"); await page.getByRole("button", { name: "Try a sample bill" }).click();
  await page.getByLabel("Currency").selectOption("EUR"); await expect(page.locator(".grand-total")).toContainText("€26.41");
  await page.getByRole("button", { name: "Add friends" }).click(); await addFriends(page, ["Zoë", "小明"]);
  await page.getByRole("button", { name: "Split evenly" }).click();
  await expect(page.getByTestId("share-Zoë")).toContainText("€13.21");
  await page.getByText("Show QR code").click(); await expect(page.getByRole("img", { name: "QR code for the split link" })).toBeVisible();
  await page.getByRole("button", { name: "Copy link" }).click(); await expect(page.getByRole("button", { name: "Link copied" })).toBeVisible();
  const link = await page.evaluate(() => (window as unknown as { copied: string }).copied);
  expect(link).toMatch(/#share=[A-Za-z0-9_-]+$/);
  await page.getByRole("button", { name: "Copy summary" }).click();
  expect(await page.evaluate(() => (window as unknown as { copied: string }).copied)).toContain(`View the split: ${link}`);

  const friend = await context.newPage(); await friend.goto(link);
  await expect(friend.getByRole("heading", { name: "Here’s the split" })).toBeVisible();
  await expect(friend.getByTestId("shared-小明")).toContainText("€13.20"); await expect(friend.getByTestId("shared-total")).toContainText("€26.41");
  await friend.getByRole("button", { name: "Split your own bill" }).click(); await expect(friend).not.toHaveURL(/#share=/);
  await expect(friend.getByTestId("share-Zoë")).toContainText("€13.21");
  await friend.goto("/#share=broken"); await expect(friend.getByText("That split link is incomplete or damaged.")).toBeVisible();
});

test.describe("small phone", () => {
  test.use({ viewport: { width: 320, height: 640 }, isMobile: true, hasTouch: true });
  test("every step fits 320px with touch-sized controls", async ({ page }, info) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    async function check(step: string) {
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${step} overflows`).toBe(true);
      const small = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>("main button, main input:not([type=checkbox]):not([type=file]), main select, main summary")]
        .filter(el => el.offsetParent !== null).map(el => ({ el, box: el.getBoundingClientRect() }))
        .filter(({ box }) => box.height < 44 || box.width < 24).map(({ el, box }) => `${el.tagName} "${el.getAttribute("aria-label") ?? el.textContent?.trim()}" ${Math.round(box.width)}×${Math.round(box.height)}`));
      expect(small, `${step} has small touch targets`).toEqual([]);
      await page.screenshot({ path: info.outputPath(`${step}-320.png`), fullPage: true });
    }
    await page.goto("/"); await check("home");
    await page.getByRole("button", { name: "Try a sample bill" }).click(); await page.getByLabel("Quantity for Lemonade").fill("2");
    await page.getByRole("button", { name: "Tax as percent" }).click(); await page.getByLabel("Tax", { exact: true }).fill("8.25"); await page.getByRole("button", { name: "20%" }).click(); await check("receipt");
    await page.getByRole("button", { name: "Add friends" }).click(); await addFriends(page, ["Alexandra", "Bartholomew"]); await check("people");
    await page.getByRole("button", { name: "Assign items" }).click();
    await page.getByRole("group", { name: "Assign Burger" }).getByRole("button", { name: "Everyone", exact: true }).tap(); await check("split");
    await page.getByRole("button", { name: "Split evenly" }).tap(); await check("split-even");
    await page.getByRole("button", { name: "See the split" }).tap(); await page.getByText("Show QR code").tap(); await check("result");
  });
});
