import { test, expect, type Page } from "@playwright/test";

async function reachResult(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Try a sample bill" }).click();
  await page.getByLabel("Price for Burger").fill("10.01");
  await page.getByRole("button", { name: "Remove Lemonade" }).click();
  await page.getByLabel("Price for Fries").fill("5.00");
  await page.getByLabel("Tax", { exact: true }).fill("1.51");
  await page.getByLabel("Added tip").fill("3.02");
  await page.getByRole("button", { name: "Add friends" }).click();
  for (const name of ["A", "B"]) {
    await page.getByLabel("Friend's name").fill(name);
    await page.getByLabel("Friend's name").press("Enter");
  }
  await page.getByRole("button", { name: "Assign items" }).click();
  const shared = page.getByRole("group", { name: "Assign Burger" });
  await shared.getByRole("button", { name: "B", exact: true }).click();
  await shared.getByRole("button", { name: "A", exact: true }).click();
  await page.getByRole("group", { name: "Assign Fries" }).getByRole("button", { name: "B", exact: true }).click();
  await page.getByRole("button", { name: "See the split" }).click();
}

test("result explanation shows item and fee calculations", async ({ page }) => {
  await reachResult(page);
  const a = page.getByTestId("share-A");
  const b = page.getByTestId("share-B");
  await expect(a).toContainText("$6.52");
  await expect(b).toContainText("$13.02");
  await a.locator("summary").click();
  await expect(a).toContainText("Burger");
  await expect(a).toContainText("$5.01");
  await expect(a).toContainText("Base $5.00 + remaining $0.01 = $5.01");
  await expect(a).toContainText("Base $0.50 + remaining $0.00 = $0.50");
  await expect(a).toContainText("Base $1.00 + remaining $0.01 = $1.01");
  await b.locator("summary").click();
  await expect(b).toContainText("Fries");
  await expect(b).toContainText("$5.00");
  await expect(page.getByText("Allocation difference $0.00")).toBeVisible();
  await expect(page.locator(".share-composition")).toHaveCount(2);
});

test("result explanation updates after receipt edits", async ({ page }) => {
  await reachResult(page);
  await page.getByRole("button", { name: "Edit assignments" }).click();
  await page.getByRole("button", { name: "Back to friends" }).click();
  await page.getByRole("button", { name: "Back to receipt" }).click();
  await page.getByLabel("Price for Fries").fill("6.00");
  await page.getByRole("button", { name: "Add friends" }).click();
  await page.getByRole("button", { name: "Assign items" }).click();
  await page.getByRole("button", { name: "See the split" }).click();
  await expect(page.getByTestId("share-A")).toContainText("$6.43");
  await expect(page.getByTestId("share-B")).toContainText("$14.11");
  await expect(page.getByTestId("bill-total")).toContainText("$20.54");
  await page.getByTestId("share-B").locator("summary").click();
  await expect(page.getByTestId("share-B")).toContainText("$6.00");
  await expect(page.getByTestId("share-B")).toContainText("$1.04");
  await expect(page.getByTestId("share-B")).toContainText("$2.07");
  await page.reload();
  await expect(page.getByTestId("share-B")).toContainText("$14.11");
});

test("result explanation handles zero amounts and uncharged friend", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Try a sample bill" }).click();
  await page.getByLabel("Price for Burger").fill("0.00");
  await page.getByRole("button", { name: "Remove Fries" }).click();
  await page.getByRole("button", { name: "Remove Lemonade" }).click();
  await page.getByLabel("Tax", { exact: true }).fill("0.00");
  await page.getByRole("button", { name: "Add friends" }).click();
  for (const name of ["A", "B"]) {
    await page.getByLabel("Friend's name").fill(name);
    await page.getByLabel("Friend's name").press("Enter");
  }
  await page.getByRole("button", { name: "Assign items" }).click();
  await page.getByRole("group", { name: "Assign Burger" }).getByRole("button", { name: "A", exact: true }).click();
  await page.getByRole("button", { name: "See the split" }).click();
  for (const name of ["A", "B"]) {
    const card = page.getByTestId(`share-${name}`);
    await card.locator("summary").click();
    await expect(card).toContainText("$0.00");
    await expect(card).toContainText("No tip added");
    await expect(card).not.toContainText("0 / 0");
    await expect(card.locator(".breakdown-fee").last()).toHaveText(/Tip\s+No tip added/);
  }
  await expect(page.getByTestId("share-A")).toContainText("Burger");
  await expect(page.getByTestId("share-B")).toContainText("No items assigned");
});

for (const width of [375, 1280]) test(`result explanation fits ${width}px and opens by keyboard`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 900 });
  await reachResult(page);
  await page.getByTestId("share-A").locator("summary").focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("share-A")).toContainText("Item by item");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath(`expanded-${width}.png`), fullPage: true });
});

test("result explanation follows current people and assignments", async ({ page }) => {
  await reachResult(page);
  await page.getByRole("button", { name: "Edit assignments" }).click();
  await page.getByRole("button", { name: "Back to friends" }).click();
  await page.getByRole("button", { name: "Remove B", exact: true }).click();
  await page.getByRole("button", { name: "Assign items" }).click();
  await page.getByRole("group", { name: "Assign Fries" }).getByRole("button", { name: "A", exact: true }).click();
  await page.getByRole("button", { name: "See the split" }).click();
  await expect(page.getByTestId("share-B")).toHaveCount(0);
  await expect(page.getByTestId("share-A")).toContainText("$19.54");
  await page.getByTestId("share-A").locator("summary").click();
  await expect(page.getByTestId("share-A")).toContainText("Fries");
  await expect(page.getByTestId("share-A")).toContainText("$10.01");
});

test("result explanation keeps long item and friend names readable on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 900 });
  await reachResult(page);
  await page.getByRole("button", { name: "Edit assignments" }).click();
  await page.getByRole("button", { name: "Back to friends" }).click();
  const longName = "A very long friend name that should wrap without cutting off the amount";
  await page.getByLabel("Rename A").fill(longName);
  await page.getByLabel(`Rename A`).blur();
  await page.getByRole("button", { name: "Back to receipt" }).click();
  const longItem = "A very long restaurant item name with modifiers and preparation notes";
  await page.getByLabel("Item 1 name").fill(longItem);
  await page.getByRole("button", { name: "Add friends" }).click();
  await page.getByRole("button", { name: "Assign items" }).click();
  await page.getByRole("button", { name: "See the split" }).click();
  const card = page.locator(".person-result").first();
  await card.locator("summary").click();
  await expect(card).toContainText(longName);
  await expect(card).toContainText(longItem);
  await expect(card).toContainText("$6.52");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
