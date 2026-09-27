import { test, expect, type Page } from "@playwright/test";
async function addFriends(page: Page) {
  for (const name of ["A", "B"]) { await page.getByLabel("Friend's name").fill(name); await page.getByLabel("Friend's name").press("Enter"); }
  await page.getByRole("button", { name: "Assign items" }).click();
}
test("exact cents, immediate submission, restoration, changes and reset", async ({ page }) => {
  await page.goto("/"); await page.getByRole("button", { name: "Try a sample bill" }).click();
  await page.getByLabel("Price for Burger").fill("10.01"); await page.getByRole("button", { name: "Remove Lemonade" }).click();
  await page.getByLabel("Price for Fries").fill("5.00"); await page.getByLabel("Tax", { exact: true }).fill("1.51");
  await page.getByLabel("Added tip").fill("3.02"); await page.getByRole("button", { name: "Add friends" }).click();
  await addFriends(page);
  const burger = page.getByRole("group", { name: "Assign Burger" }); await burger.getByRole("button", { name: "B", exact: true }).click(); await burger.getByRole("button", { name: "A", exact: true }).click();
  await page.getByRole("group", { name: "Assign Fries" }).getByRole("button", { name: "B", exact: true }).click();
  await page.getByRole("button", { name: "See the split" }).click();
  await expect(page.getByTestId("share-A")).toContainText("$6.52"); await expect(page.getByTestId("share-B")).toContainText("$13.02");
  await expect(page.getByTestId("bill-total")).toContainText("$19.54");
  await page.reload(); await expect(page.getByTestId("share-A")).toContainText("$6.52");
  await page.getByRole("button", { name: "Edit assignments" }).click(); await page.getByRole("button", { name: "Back to friends" }).click();
  await page.getByRole("button", { name: "Remove B", exact: true }).click(); await page.getByRole("button", { name: "Assign items" }).click();
  await expect(page.getByText("1 of 2 items assigned")).toBeVisible(); await page.getByRole("button", { name: "See the split" }).click(); await expect(page.getByText("Choose at least one friend for every item.")).toBeVisible();
  await page.getByRole("group", { name: "Assign Fries" }).getByRole("button", { name: "A", exact: true }).click();
  await page.getByRole("button", { name: "See the split" }).click(); await expect(page.getByTestId("share-A")).toContainText("$19.54");
  await page.getByRole("button", { name: "Start a new bill" }).click(); await page.reload(); await expect(page.getByRole("button", { name: "Try a sample bill" })).toBeVisible();
});
test("validates latest amount and handles damaged cache", async ({ page }) => {
  await page.goto("/"); await page.evaluate(() => localStorage.setItem("bitesplit-session", "broken")); await page.reload();
  await page.getByRole("button", { name: "Try a sample bill" }).click(); await page.getByLabel("Price for Burger").fill("12.");
  await page.reload(); await expect(page.getByLabel("Price for Burger")).toHaveValue("12.");
  await page.getByRole("button", { name: "Add friends" }).click(); await expect(page.getByLabel("Price for Burger")).toHaveAttribute("aria-invalid", "true");
  await page.getByLabel("Price for Burger").fill("12.34"); await page.getByRole("button", { name: "Add friends" }).click();
  await expect(page.getByRole("heading", { name: "Who's in?" })).toBeVisible();
});
test("copy denial exposes the current summary, and changed prices recalculate", async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, "clipboard", { value: { writeText: async () => { throw new DOMException("Denied", "NotAllowedError"); } } }));
  await page.goto("/"); await page.getByRole("button", { name: "Try a sample bill" }).click(); await page.getByRole("button", { name: "Add friends" }).click(); await addFriends(page);
  for (const b of await page.getByRole("button", { name: "Everyone", exact: true }).all()) await b.click(); await page.getByRole("button", { name: "See the split" }).click();
  await page.getByRole("button", { name: "Copy summary" }).click(); await expect(page.getByLabel("Summary to copy")).toContainText("Total: $26.41");
  await page.getByRole("button", { name: "Edit assignments" }).click(); await page.getByRole("button", { name: "Back to friends" }).click(); await page.getByRole("button", { name: "Back to receipt" }).click();
  await page.getByLabel("Price for Burger").fill("10.00"); await page.getByRole("button", { name: "Add friends" }).click(); await page.getByRole("button", { name: "Assign items" }).click(); await page.getByRole("button", { name: "See the split" }).click();
  await page.getByRole("button", { name: "Copy summary" }).click(); await expect(page.getByLabel("Summary to copy")).toContainText("Total: $21.46");
});
for (const width of [375, 1280]) test(`five steps fit at ${width}px and support keyboard`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 900 }); await page.emulateMedia({ reducedMotion: "reduce" }); await page.goto("/");
  async function capture(step: string) { expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); await page.screenshot({ path: info.outputPath(`${step}-${width}.png`), fullPage: true }); }
  await expect(page.getByRole("button", { name: "Try a sample bill" })).toBeVisible(); await capture("home");
  await page.getByRole("button", { name: "Try a sample bill" }).click(); await capture("receipt"); await page.getByRole("button", { name: "Add friends" }).click();
  await page.getByLabel("Friend's name").fill("A very long friend name that must remain readable"); await page.getByLabel("Friend's name").press("Enter");
  await expect(page.getByText("A very long friend name that must remain readable", { exact: true })).toBeVisible(); await capture("people");
  await page.getByRole("button", { name: "Assign items" }).click(); for (const b of await page.getByRole("button", { name: "Everyone", exact: true }).all()) { await b.focus(); await page.keyboard.press("Enter"); } await capture("split");
  await page.getByRole("button", { name: "See the split" }).click(); await capture("result");
});
