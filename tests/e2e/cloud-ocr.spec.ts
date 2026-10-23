import { test, expect, type Page } from "@playwright/test";
test.use({ storageState: { cookies: [], origins: [] } }); // a fresh browser: the cloud engine is the default when the site has a key
const reply = { items: [
  { printedText: "Pad Kra Pow\nChicken", name: "Pad Kra Pow", nameZh: "打抛饭", quantity: null, unitPrice: null, lineTotal: "12.90", modifiers: ["Chicken"] },
  { printedText: "Milk Tea", name: "Milk Tea", nameZh: "奶茶", quantity: null, unitPrice: null, lineTotal: "4.00", modifiers: [] },
], discounts: [], subtotal: "16.90", tax: "1.39", tip: null, total: "18.29", uncertain: [] };
const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization, content-type", "access-control-allow-methods": "POST" };
async function mockQwen(page: Page, answer: { status: number; body: unknown }) {
  const bodies: { model: string; messages: { content: { type: string; image_url?: { url: string } }[] }[] }[] = [];
  await page.route("**/compatible-mode/v1/chat/completions", async route => {
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    expect(route.request().headers().authorization).toBe("Bearer e2e-fake-key"); // a reused server built with the real key fails here, before anything is fulfilled
    bodies.push(route.request().postDataJSON()); await route.fulfill({ status: answer.status, contentType: "application/json", headers: cors, body: JSON.stringify(answer.body) });
  });
  return bodies;
}
async function recognize(page: Page) {
  await page.goto("/"); await page.getByLabel("Upload a receipt", { exact: true }).setInputFiles("tests/fixtures/receipts/clear-diner.png");
  await expect(page.getByRole("radio", { name: /Cloud AI/ })).toBeChecked();
  await page.getByRole("button", { name: /^Use this photo and recognize/ }).click();
}
test("cloud engine fills prices, tax and Chinese names from one Qwen reply", async ({ page }) => {
  const bodies = await mockQwen(page, { status: 200, body: { choices: [{ message: { role: "assistant", content: JSON.stringify(reply) } }] } });
  await recognize(page);
  await expect(page.getByRole("heading", { name: "Check the receipt" })).toBeVisible({ timeout: 30000 });
  await expect(page.getByLabel("Price for Pad Kra Pow", { exact: true })).toHaveValue("12.90"); await expect(page.getByLabel("Price for Milk Tea", { exact: true })).toHaveValue("4.00"); await expect(page.getByLabel("Tax", { exact: true })).toHaveValue("1.39");
  await expect(page.locator(".dish-translation", { hasText: "打抛饭" })).toBeVisible(); await expect(page.locator('.dish-translation[data-provider="llm"]')).toHaveCount(2);
  expect(bodies).toHaveLength(1); expect(bodies[0].model).toBe("qwen3.5-plus"); expect(bodies[0].messages[1].content[0].image_url?.url).toMatch(/^data:image\/jpeg;base64,/);
});
test("a rejected key tells the user how to continue", async ({ page }) => {
  await mockQwen(page, { status: 401, body: { error: { code: "invalid_api_key" } } });
  await recognize(page);
  await expect(page.getByText(/Cloud recognition rejected its key/)).toBeVisible({ timeout: 30000 });
});
