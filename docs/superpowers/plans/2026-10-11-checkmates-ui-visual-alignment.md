# CheckMates UI Visual Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify the whole app on one token set and one component vocabulary in the existing "weekend diner" style, and fix the eleven visible alignment problems (P1–P11) found in the 2026-10-11 walkthrough.

**Architecture:** `src/app/globals.css` is rewritten as `:root` tokens → `@theme inline` → `@layer base` → `@layer components`, with no unlayered rules, so the shadcn `Button`/`Input` cva utilities work again. Pages then switch to shared semantic classes (`.paper`, `.notice`, `.chip`, `.money-grid`, `.bottom-actions`, `.disclosure`) and the restyled primitives. No business logic, store, persistence or copy changes.

**Tech Stack:** Next.js 16.3.6, React 19, Tailwind CSS 4.3.3 (`@tailwindcss/postcss`), shadcn base-nova on `@base-ui/react`, `cn` 0.4 (tailwind-merge compatible), lucide-react 1.48, Vitest 5, Playwright 1.58.2.

**Spec:** [design](../specs/2026-10-11-checkmates-ui-visual-alignment-design.md). **Delivery boundary (user, 2026-10-11):** develop on `feat/ui-visual-alignment`, test locally, **no PR, no push, no deploy**.

**Deviations from the spec found while planning (apply these, they win over the spec):**

1. `tests/e2e/result-explanation.spec.ts:121-122` renames a friend with `getByLabel("Rename A").fill(...)`. With the approved edit mode, the test must click the `Rename A` button first and fill `New name for A` (Task 8).
2. `tests/e2e/weighted-split.spec.ts` matches the share preview line exactly (`"A: 2/6 pieces · $4.00"`), so the preview keeps its single-line text; only the container gets the sunken-well style.
3. `tests/e2e/precise-ocr.spec.ts` uses `getByText("Printed total")` and expects it to contain the amount, so printed-total labels stay bare text nodes inside their grid row (no wrapping `span`).
4. The bottom-bar reserve goes on `.app-shell` (not `main`) so the footer stays above the fixed bar.
5. The CSS rewrite (Task 3) lands before the page tasks, so between Task 3 and Task 10 unmigrated pages look unfinished. Each task runs unit tests, lint and the e2e specs for the page it touches; the full e2e suite runs in Task 11.

---

## File map

| File | Responsibility |
| --- | --- |
| `src/app/globals.css` | Tokens, theme mapping, base layer, all semantic component classes (rewritten) |
| `src/app/globals.test.ts` (new) | CSS guard: no color literals outside `:root`, no font size under 12px, no unlayered rules, no `[data-slot` selectors |
| `src/components/ui/button.tsx` | cva: variants `default/outline/ghost/link`, sizes `default/lg/icon`, tactile primary |
| `src/components/ui/input.tsx` | 44px field, explicit text color/size, no ring |
| `src/components/ui/notice.tsx` (new) | `Notice` with four tones |
| `src/components/people/person-style.ts` (new) + `person-style.test.ts` | `personColor(index)`, `personInitial(name)` |
| `src/components/bill-wizard.tsx` | Header inner wrapper, step bar also on photo adjustment, bar reserve, notices |
| `src/components/home/home-step.tsx` | `PhotoInput` on `buttonVariants`, CTAs, notices |
| `src/components/home/offline-data.tsx` | Disclosure, notice |
| `src/components/receipt/photo-adjustment.tsx` | Grouped tools, engine choice cards, bottom bar |
| `src/components/receipt/receipt-step.tsx` | Money-column grid, photo actions grid, notices, fields |
| `src/components/receipt/receipt-line-details.tsx` | Disclosure, outline buttons |
| `src/components/translation/translation-controls.tsx` | Switch row, notices |
| `src/components/people/people-step.tsx` | Avatar, single name, edit mode, icon buttons |
| `src/components/split/split-step.tsx` | Count style, unassigned state, notice, bar |
| `src/components/split/item-allocation-editor.tsx` | Chips, Everyone chip, select wrapper, aligned share inputs |
| `src/components/result/result-step.tsx` | Left heading, avatars, chevron, totals, success notice |
| `tests/e2e/visual-alignment.spec.ts` (new) | Geometry and computed-style assertions |
| `tests/e2e/result-explanation.spec.ts` | Rename through edit mode |
| `src/ARCHITECTURE.md` | Directory map entries + "Styling" section |
| `docs/validation/2026-10-11-ui-visual-alignment.md` (new) | Before/after measurements |

Commands used throughout (Git Bash on Windows; `npm`/`npx` are on PATH):

- Unit tests: `npm test`
- One unit file: `npx vitest run src/components/people/person-style.test.ts`
- Lint: `npm run lint`
- Type check: `npx tsc --noEmit`
- Chosen e2e specs (dev server on 3100 starts automatically): `npx playwright test tests/e2e/visual-alignment.spec.ts --project=chromium`
- Build: `npm run build`

---

### Task 1: Baseline screenshots and the failing geometry spec

**Files:**
- Create: `tests/e2e/visual-alignment.spec.ts`

- [ ] **Step 1: Capture the baseline screenshots (before any UI change)**

Run:
```bash
npx playwright test tests/e2e/bill-flow.spec.ts tests/e2e/result-explanation.spec.ts tests/e2e/weighted-split.spec.ts tests/e2e/reset-bill.spec.ts tests/e2e/complex-receipts.spec.ts --project=chromium
```
Expected: all pass (main is green). Then copy the PNGs out of git:
```bash
mkdir -p "$SCRATCH/ui-baseline" && find test-results -name "*.png" -exec cp {} "$SCRATCH/ui-baseline/" \; && ls "$SCRATCH/ui-baseline" | wc -l
```
`$SCRATCH` is the session scratchpad directory. Expected: a non-zero count.

- [ ] **Step 2: Write the geometry spec**

Create `tests/e2e/visual-alignment.spec.ts`:
```ts
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
```

- [ ] **Step 3: Run it to confirm it fails on the current UI**

Run: `npx playwright test tests/e2e/visual-alignment.spec.ts --project=chromium`
Expected: all 5 tests FAIL. Money column spread is 34; brand is 212px left of `main`; 10–11px texts are found; the step bar is missing on photo adjustment; friend rows contain inputs. Record each failure message for the validation record in Task 11.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/visual-alignment.spec.ts
git commit -m "test: geometry checks for the UI visual alignment"
```

---

### Task 2: Person color and initial helpers

**Files:**
- Create: `src/components/people/person-style.ts`
- Test: `src/components/people/person-style.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { personColor, personInitial } from "./person-style";

describe("personColor", () => {
  it("gives the first six friends different colors in list order and then repeats", () => {
    const first = [0, 1, 2, 3, 4, 5].map(personColor);
    expect(first[0]).toBe("person-1");
    expect(new Set(first).size).toBe(6);
    expect(personColor(6)).toBe(personColor(0));
  });
  it("never returns an invalid class for a missing index", () => {
    expect(personColor(-1)).toBe("person-6");
  });
});

describe("personInitial", () => {
  it("uses the first character of the trimmed name", () => {
    expect(personInitial("  bea ")).toBe("B");
    expect(personInitial("张三")).toBe("张");
    expect(personInitial("")).toBe("?");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/components/people/person-style.test.ts`
Expected: FAIL, cannot resolve `./person-style`.

- [ ] **Step 3: Implement**

```ts
const PALETTE_SIZE = 6;
// Colors follow bill.people order so the first six friends never share one; names stay visible, so color is never the only cue.
export function personColor(index: number) { return `person-${(index % PALETTE_SIZE + PALETTE_SIZE) % PALETTE_SIZE + 1}`; }
export function personInitial(name: string) { return [...name.trim()][0]?.toUpperCase() ?? "?"; }
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/components/people/person-style.test.ts`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add src/components/people/person-style.ts src/components/people/person-style.test.ts
git commit -m "feat: person colors by list order and name initials"
```

---

### Task 3: Tokens, cascade layers and the CSS guard

**Files:**
- Create: `src/app/globals.test.ts`
- Modify: `src/app/globals.css` (full rewrite)

- [ ] **Step 1: Write the failing guard test**

```ts
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

const css = readFileSync(new URL("./globals.css", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

function topLevel(source: string) {
  const statements: { head: string; body: string }[] = []; let depth = 0, start = 0, head = "";
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (c === "{") { if (depth === 0) { head = source.slice(start, i).trim(); start = i + 1; } depth++; }
    else if (c === "}") { depth--; if (depth === 0) { statements.push({ head, body: source.slice(start, i) }); start = i + 1; } }
    else if (c === ";" && depth === 0) { statements.push({ head: source.slice(start, i).trim(), body: "" }); start = i + 1; }
  }
  return statements;
}
const statements = topLevel(css);
const outsideRoot = statements.filter(s => s.head !== ":root").map(s => `${s.head}{${s.body}}`).join("\n");

it("keeps every rule inside a cascade layer or a token block", () => {
  expect(statements.map(s => s.head).filter(head => !/^(@import|@custom-variant|@theme|:root$|@layer)/.test(head))).toEqual([]);
});

it("keeps color literals inside :root", () => {
  expect(outsideRoot.match(/#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab)\(|(?<![-\w])(?:white|black)(?![-\w])/gi) ?? []).toEqual([]);
});

it("keeps every font size at 12px or larger", () => {
  const sizes = [...css.matchAll(/font(?:-size)?\s*:\s*([^;{}]+)/g)].flatMap(m => [...m[1].matchAll(/(\d*\.?\d+)(px|rem)\b/g)].map(n => Number(n[1]) * (n[2] === "rem" ? 16 : 1)));
  expect(sizes.filter(size => size < 12)).toEqual([]);
});

it("never restyles shadcn primitives through data-slot selectors", () => {
  expect(css).not.toMatch(/\[data-slot/);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/app/globals.test.ts`
Expected: 4 failed. Unlayered selectors are listed, dozens of hex colors are listed, sizes `10`/`11` are listed, and `[data-slot` matches.

- [ ] **Step 3: Rewrite `src/app/globals.css`**

Replace the whole file with:
```css
@import "tailwindcss";
@import "tw-animate-css";
@import "shadcn/tailwind.css";

@custom-variant dark (&:is(.dark *));

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-primary-strong: var(--primary-strong);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --color-surface: var(--surface);
  --color-surface-sunken: var(--surface-sunken);
  --color-success: var(--success);
  --color-chart-1: var(--chart-1);
  --color-chart-2: var(--chart-2);
  --color-chart-3: var(--chart-3);
  --font-sans: var(--font-body);
  --text-xs: var(--fs-caption);
  --text-xs--line-height: 1.4;
  --text-sm: var(--fs-small);
  --text-sm--line-height: 1.45;
  --text-base: var(--fs-body);
  --text-base--line-height: 1.5;
  --text-lg: var(--fs-heading);
  --text-lg--line-height: 1.3;
  --radius-sm: var(--r-sm);
  --radius-md: var(--r-md);
  --radius-lg: var(--r-lg);
}

/* The only place for literal values. Spec: docs/superpowers/specs/2026-10-11-checkmates-ui-visual-alignment-design.md §3 */
:root {
  --background: #faf7ef;
  --surface: #fffdf7;
  --surface-sunken: #f3eee3;
  --foreground: #302b25;
  --muted-foreground: #655b4d;
  --primary: #b9432a;
  --primary-foreground: #fffaf0;
  --primary-strong: #9a3822;
  --success: #3e654e;
  --success-soft: #dce8d8;
  --success-border: #b8d9c5;
  --warning-soft: #fff4d5;
  --warning-border: #e7d49b;
  --warning-strong: #7a5a0c;
  --destructive: #a52620;
  --destructive-soft: #fbeae6;
  --destructive-border: #e3b0a5;
  --border: #e5dfd3;
  --rule: #d5c9b5;
  --input: #968b78;
  --chart-1: #426c59;
  --chart-2: #c36b44;
  --chart-3: #8372a6;
  --person-1: #d5e7d9;
  --person-1-strong: #b8d9c5;
  --person-2: #f3dccc;
  --person-2-strong: #edb897;
  --person-3: #e5ddf1;
  --person-3-strong: #dac7eb;
  --person-4: #f3e9bb;
  --person-4-strong: #edc864;
  --person-5: #d9e6ef;
  --person-5-strong: #b7cfe1;
  --person-6: #f3dbe1;
  --person-6-strong: #e6b7c3;
  --card: var(--surface);
  --card-foreground: var(--foreground);
  --popover: var(--surface);
  --popover-foreground: var(--foreground);
  --secondary: var(--surface-sunken);
  --secondary-foreground: var(--foreground);
  --muted: var(--surface-sunken);
  --accent: var(--surface-sunken);
  --accent-foreground: var(--foreground);
  --ring: var(--success);
  --line-on-tint: color-mix(in srgb, var(--foreground) 14%, transparent);
  --font-body: Arial, Helvetica, sans-serif;
  --font-display: Georgia, "Times New Roman", serif;
  --font-receipt: "Courier New", monospace;
  --fs-caption: 12px;
  --fs-small: 14px;
  --fs-body: 16px;
  --fs-heading: 18px;
  --fs-brand: 24px;
  --fs-amount: 26px;
  --fs-title: clamp(32px, 8vw, 40px);
  --fs-display: clamp(40px, 10vw, 54px);
  --r-sm: 8px;
  --r-md: 12px;
  --r-lg: 16px;
  --radius: var(--r-md);
  --shadow-card: 0 1px 2px #4831160d, 0 6px 16px #4831160a;
  --shadow-press: 0 3px 0 var(--primary-strong);
  --shadow-raised: 0 1px 7px #302b2570;
  --gutter: 20px;
  --content-width: 540px;
  --money-col: 96px;
  --action-col: 44px;
}

@layer base {
  * { @apply border-border; }
  body { margin: 0; background: var(--background); color: var(--foreground); font-family: var(--font-body); font-size: var(--fs-body); line-height: 1.5; }
  h1 { margin-bottom: --spacing(2); font-family: var(--font-display); font-size: var(--fs-title); font-weight: 700; line-height: 1.12; letter-spacing: -0.02em; }
  h2 { font-size: var(--fs-heading); font-weight: 700; line-height: 1.3; }
  h3 { font-size: var(--fs-small); font-weight: 700; line-height: 1.45; }
  button:not(:disabled), summary { cursor: pointer; }
  :focus-visible { outline: 3px solid var(--ring); outline-offset: 2px; }
  h1:focus { outline: none; }
  @media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; transition: none !important; scroll-behavior: auto !important; } }
}

@layer components {
  /* Shell */
  .app-shell { min-height: 100dvh; background-image: radial-gradient(color-mix(in srgb, var(--rule) 45%, transparent) .6px, transparent .6px); background-size: 7px 7px; }
  .app-shell.has-bottom-bar { padding-bottom: calc(--spacing(24) + env(safe-area-inset-bottom)); }
  .brand-header { border-bottom: 1px solid var(--border); }
  .brand-header-inner, .bottom-actions-inner { box-sizing: border-box; max-width: calc(var(--content-width) + 2 * var(--gutter)); margin-inline: auto; padding-inline: var(--gutter); }
  .brand-header-inner { display: flex; align-items: center; justify-content: space-between; gap: --spacing(4); padding-block: --spacing(5); }
  .brand { display: flex; align-items: center; gap: --spacing(2); font-size: var(--fs-brand); font-weight: 800; line-height: 1.2; letter-spacing: -0.04em; }
  .brand-mark { display: grid; place-items: center; width: 36px; height: 36px; border-radius: var(--r-md); background: var(--primary); color: var(--primary-foreground); transform: rotate(-7deg); }
  .brand-dot { margin-left: --spacing(-2); color: var(--primary); }
  .header-actions { display: flex; align-items: center; gap: --spacing(4); }
  .header-note { font-size: var(--fs-caption); color: var(--muted-foreground); }
  .wizard-main { width: min(100% - 2 * var(--gutter), var(--content-width)); margin: --spacing(6) auto 0; padding-bottom: --spacing(10); }
  .site-footer { padding: 0 var(--gutter) --spacing(8); text-align: center; font: italic var(--fs-caption) / 1.4 var(--font-display); color: var(--muted-foreground); }
  .step-progress { position: relative; display: flex; justify-content: space-between; margin: 0 0 --spacing(8); }
  .step-progress::before { content: ""; position: absolute; top: 14px; left: 8%; right: 8%; height: 1px; background: var(--rule); }
  .step-progress > div { position: relative; display: flex; flex-direction: column; align-items: center; gap: --spacing(1); min-width: 44px; color: var(--muted-foreground); }
  .step-progress span { display: grid; place-items: center; width: 28px; height: 28px; border: 3px solid var(--background); border-radius: 50%; background: var(--surface-sunken); font-size: var(--fs-caption); font-weight: 700; }
  .step-progress small { font-size: var(--fs-caption); line-height: 1.4; }
  .step-progress .active span { background: var(--primary); color: var(--primary-foreground); }
  .step-progress [aria-current=step] small { font-weight: 700; color: var(--primary-strong); }
  .bottom-actions { position: fixed; inset-inline: 0; bottom: 0; z-index: 10; border-top: 1px solid var(--border); background: color-mix(in srgb, var(--background) 96%, transparent); backdrop-filter: blur(12px); }
  .bottom-actions-inner { display: flex; align-items: center; gap: --spacing(2); padding-block: --spacing(3) calc(--spacing(3) + env(safe-area-inset-bottom)); }
  .bottom-actions-inner > :last-child { flex: 1; }
  @media (max-width: 480px) { .brand-header-inner { padding-block: --spacing(4); } .header-note { display: none; } }

  /* Shared pieces */
  .step-heading { margin-bottom: --spacing(6); }
  .step-heading > p:last-child { margin: 0; font-size: var(--fs-small); line-height: 1.45; color: var(--muted-foreground); }
  .eyebrow { margin: 0 0 --spacing(3); font-size: var(--fs-caption); font-weight: 700; line-height: 1.4; letter-spacing: 0.14em; text-transform: uppercase; color: var(--primary-strong); }
  .eyebrow-row { display: flex; align-items: center; gap: --spacing(2); margin-bottom: --spacing(3); }
  .eyebrow-row .eyebrow { margin: 0; }
  .paper { margin-bottom: --spacing(4); padding: --spacing(5); border: 1px solid var(--border); border-radius: var(--r-lg); background: var(--surface); box-shadow: var(--shadow-card); }
  .muted { font-size: var(--fs-caption); line-height: 1.4; color: var(--muted-foreground); }
  .fine-print { font-size: var(--fs-caption); line-height: 1.4; color: var(--muted-foreground); }
  .row { display: flex; flex-wrap: wrap; align-items: center; gap: --spacing(2); }
  .field-label { display: block; margin-bottom: --spacing(1.5); font-size: var(--fs-caption); font-weight: 700; line-height: 1.4; color: var(--muted-foreground); }
  .field-error { margin: --spacing(1.5) 0 0; font-size: var(--fs-caption); line-height: 1.4; color: var(--destructive); }
  .notice { display: flex; align-items: flex-start; gap: --spacing(3); margin: 0 0 --spacing(4); padding: --spacing(3) --spacing(4); border: 1px solid var(--notice-border); border-radius: var(--r-md); background: var(--notice-bg); font-size: var(--fs-small); line-height: 1.45; overflow-wrap: anywhere; }
  .notice > svg { flex: none; width: 16px; height: 16px; margin-top: 2px; color: var(--notice-icon); }
  .notice-body { flex: 1; min-width: 0; }
  .notice-body > * + * { margin-top: --spacing(2); }
  .notice-title { font-size: var(--fs-body); line-height: 1.4; }
  .notice ul { padding-left: 18px; list-style: disc; }
  .notice li + li { margin-top: --spacing(1); }
  .notice pre { font-size: var(--fs-caption); white-space: pre-wrap; overflow-wrap: anywhere; }
  .notice textarea { width: 100%; padding: --spacing(2) --spacing(3); border: 1px solid var(--input); border-radius: var(--r-sm); background: var(--surface); font-size: var(--fs-caption); }
  .notice[data-tone=info] { --notice-bg: var(--surface-sunken); --notice-border: var(--border); --notice-icon: var(--muted-foreground); }
  .notice[data-tone=warning] { --notice-bg: var(--warning-soft); --notice-border: var(--warning-border); --notice-icon: var(--warning-strong); }
  .notice[data-tone=error] { --notice-bg: var(--destructive-soft); --notice-border: var(--destructive-border); --notice-icon: var(--destructive); }
  .notice[data-tone=success] { --notice-bg: var(--success-soft); --notice-border: var(--success-border); --notice-icon: var(--success); }
  .notice-actions { display: flex; flex-wrap: wrap; align-items: center; gap: --spacing(2); }
  .checkbox-label { display: flex; align-items: flex-start; gap: --spacing(2); padding: --spacing(2) 0; font-size: var(--fs-small); }
  .checkbox-label input { flex: none; width: 20px; height: 20px; margin: 2px 0 0; accent-color: var(--primary); }
  .select-wrap { position: relative; display: inline-flex; }
  .select-wrap select { min-height: 44px; padding: 0 --spacing(10) 0 --spacing(3); border: 1px solid var(--input); border-radius: var(--r-md); background: var(--surface); color: var(--foreground); font-size: var(--fs-body); appearance: none; }
  .select-wrap svg { position: absolute; top: 50%; right: --spacing(3); width: 16px; height: 16px; color: var(--muted-foreground); transform: translateY(-50%); pointer-events: none; }
  .switch-row { display: flex; align-items: center; gap: --spacing(3); min-height: 44px; font-size: var(--fs-small); font-weight: 700; }
  .switch { position: relative; flex: none; width: 44px; height: 24px; margin: 0; border-radius: 999px; background: var(--input); appearance: none; transition: background-color 150ms ease-out; }
  .switch::after { content: ""; position: absolute; top: 3px; left: 3px; width: 18px; height: 18px; border-radius: 50%; background: var(--surface); transition: transform 150ms ease-out; }
  .switch:checked { background: var(--primary); }
  .switch:checked::after { transform: translateX(20px); }
  .choice-group { display: grid; gap: --spacing(2); min-width: 0; margin: 0; padding: 0; border: 0; }
  .choice-card { display: flex; align-items: flex-start; gap: --spacing(3); padding: --spacing(3); border: 1px solid var(--input); border-radius: var(--r-md); background: var(--surface); font-size: var(--fs-small); }
  .choice-card.selected { padding: calc(--spacing(3) - 1px); border: 2px solid var(--foreground); }
  .choice-card input { flex: none; width: 20px; height: 20px; margin: 0; accent-color: var(--primary); }
  .choice-card small { display: block; font-size: var(--fs-caption); color: var(--muted-foreground); }
  .chip-list { display: flex; flex-wrap: wrap; gap: --spacing(2); }
  .chip { display: inline-flex; align-items: center; gap: --spacing(1.5); max-width: 100%; min-height: 44px; padding: --spacing(2) --spacing(3.5); border: 1px solid var(--input); border-radius: 999px; background: var(--surface); color: var(--foreground); font-size: var(--fs-small); font-weight: 700; line-height: 1.3; text-align: left; overflow-wrap: anywhere; transition: background-color 150ms ease-out; }
  .chip:hover { background: var(--surface-sunken); }
  .chip[aria-pressed=true] { padding: calc(--spacing(2) - 1px) calc(--spacing(3.5) - 1px); border: 2px solid var(--foreground); background: var(--person-color); }
  .chip svg { flex: none; width: 16px; height: 16px; }
  .chip-dot { flex: none; width: 10px; height: 10px; border-radius: 50%; background: var(--person-color-strong); }
  .chip-everyone { border-style: dashed; background: transparent; color: var(--primary-strong); }
  .avatar { display: grid; place-items: center; flex: none; width: 32px; height: 32px; border-radius: 50%; background: var(--person-color-strong); color: var(--foreground); font-size: var(--fs-small); font-weight: 700; }
  .disclosure > summary { display: flex; align-items: center; justify-content: space-between; gap: --spacing(2); min-height: 44px; font-size: var(--fs-small); font-weight: 700; list-style: none; }
  .disclosure > summary::-webkit-details-marker, .person-result > summary::-webkit-details-marker { display: none; }
  .disclosure-icon { flex: none; width: 16px; height: 16px; color: var(--muted-foreground); transition: transform 150ms ease-out; }
  details[open] > summary .disclosure-icon { transform: rotate(180deg); }
  .disclosure pre { max-height: 250px; margin: 0 0 --spacing(2); padding: --spacing(3); overflow-y: auto; border-radius: var(--r-sm); background: var(--surface-sunken); font-size: var(--fs-caption); white-space: pre-wrap; overflow-wrap: anywhere; }
  .money-grid { display: grid; grid-template-columns: minmax(0, 1fr) var(--money-col) var(--action-col); align-items: center; column-gap: --spacing(2); }
  .money { text-align: right; font-variant-numeric: tabular-nums; }
  .money-grid > .money:not(input) { padding-inline-end: calc(--spacing(3) + 1px); }
  .money-grid > .field-error { grid-column: 1 / -1; }
  .person-1 { --person-color: var(--person-1); --person-color-strong: var(--person-1-strong); }
  .person-2 { --person-color: var(--person-2); --person-color-strong: var(--person-2-strong); }
  .person-3 { --person-color: var(--person-3); --person-color-strong: var(--person-3-strong); }
  .person-4 { --person-color: var(--person-4); --person-color-strong: var(--person-4-strong); }
  .person-5 { --person-color: var(--person-5); --person-color-strong: var(--person-5-strong); }
  .person-6 { --person-color: var(--person-6); --person-color-strong: var(--person-6-strong); }
  .photo-input { position: relative; }
  .photo-input input { position: absolute; inset: 0; width: 100%; opacity: 0; cursor: pointer; }
  .photo-input:focus-within { outline: 3px solid var(--ring); outline-offset: 2px; }
  @media (max-width: 480px) { .paper { padding: --spacing(4); } }

  /* Home */
  .home-step { text-align: center; }
  .home-step .eyebrow { margin-bottom: --spacing(4); }
  .home-step h1 { margin-bottom: --spacing(4); font-size: var(--fs-display); line-height: 1.05; letter-spacing: -0.03em; }
  .home-step h1 span { color: var(--primary); }
  .lead { max-width: 350px; margin: 0 auto --spacing(8); font-size: var(--fs-body); color: var(--muted-foreground); }
  .receipt-illustration { position: relative; width: 260px; margin: 0 auto --spacing(8); padding: --spacing(6) --spacing(5) --spacing(8); border: 1px solid var(--border); background: var(--surface); box-shadow: 4px 8px 0 color-mix(in srgb, var(--rule) 30%, transparent), var(--shadow-card); transform: rotate(-4deg); font: var(--fs-caption) / 1.4 var(--font-receipt); text-align: left; }
  .receipt-illustration::after { content: ""; position: absolute; left: -1px; right: -1px; bottom: -8px; height: 10px; background: linear-gradient(135deg, var(--surface) 5px, transparent 0) 0 0 / 10px 10px, linear-gradient(225deg, var(--surface) 5px, transparent 0) 0 0 / 10px 10px; }
  .receipt-illustration p { display: flex; justify-content: space-between; margin: --spacing(2) 0; }
  .mini-title { text-align: center; font-weight: 700; letter-spacing: 0.16em; }
  .mini-rule { margin: --spacing(3) 0; border-top: 1px dashed var(--rule); }
  .mini-bottom { text-align: center; }
  .little-sticker { position: absolute; top: -13px; right: -21px; display: grid; place-items: center; padding: --spacing(3); border: 3px solid var(--background); border-radius: 50%; background: var(--person-4-strong); color: var(--foreground); transform: rotate(16deg); }
  .friend-stickers { position: absolute; left: -25px; bottom: -10px; display: flex; }
  .friend-stickers span { display: grid; place-items: center; width: 36px; height: 36px; margin-left: -5px; border: 3px solid var(--background); border-radius: 50%; background: var(--person-color-strong); font: 700 var(--fs-caption) / 1 var(--font-body); }
  .home-actions { display: grid; gap: --spacing(3); max-width: 375px; margin: 0 auto; }
  .home-actions .notice, .status-box { text-align: left; }
  .status-box h2 { margin-bottom: --spacing(2); }
  .status-box p { margin-bottom: --spacing(2); }
  .status-box progress { display: block; width: 100%; height: 8px; margin: --spacing(3) 0; overflow: hidden; border: 0; border-radius: 999px; background: var(--surface-sunken); appearance: none; }
  .status-box progress::-webkit-progress-bar { background: var(--surface-sunken); }
  .status-box progress::-webkit-progress-value { border-radius: 999px; background: var(--primary); }
  .status-box progress::-moz-progress-bar { background: var(--primary); }
  .privacy { display: flex; align-items: center; justify-content: center; gap: --spacing(1.5); margin: --spacing(6) 0 --spacing(1.5); font-size: var(--fs-caption); color: var(--muted-foreground); }
  .privacy svg { width: 16px; height: 16px; }
  .how-it-works { display: flex; justify-content: center; gap: --spacing(6); margin-top: --spacing(8); padding-top: --spacing(5); border-top: 1px solid var(--border); font-size: var(--fs-caption); color: var(--muted-foreground); }
  .how-it-works span { display: flex; flex-direction: column; gap: --spacing(1.5); }
  .how-it-works b { color: var(--primary-strong); }
  .offline-data { margin-top: --spacing(6); padding-top: --spacing(2); border-top: 1px solid var(--border); text-align: left; }
  .offline-row { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: --spacing(2); padding: --spacing(1.5) 0; font-size: var(--fs-small); }

  /* Photo adjustment */
  .adjustment-panels { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: --spacing(3); margin: 0 0 --spacing(4); }
  .adjustment-panels > div { min-width: 0; padding: --spacing(3); border: 1px solid var(--border); border-radius: var(--r-lg); background: var(--surface); text-align: center; }
  .adjustment-panels h2 { margin-bottom: --spacing(2); font-size: var(--fs-small); }
  .adjustment-image-wrap { position: relative; display: inline-block; max-width: 100%; border-radius: var(--r-sm); background: var(--surface-sunken); }
  .adjustment-image-wrap img { display: block; max-width: 100%; max-height: 360px; width: auto; height: auto; }
  .corner-layer { position: absolute; inset: 0; }
  .corner-layer svg { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
  .corner-layer polygon { fill: color-mix(in srgb, var(--primary) 10%, transparent); stroke: var(--primary); stroke-width: .6; vector-effect: non-scaling-stroke; }
  .corner-handle { position: absolute; z-index: 1; width: 44px; height: 44px; border: 3px solid var(--surface); border-radius: 50%; background: var(--primary); box-shadow: var(--shadow-raised); transform: translate(-50%, -50%); touch-action: none; }
  .tool-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: --spacing(2); }
  .angle-field { display: flex; flex-wrap: wrap; align-items: center; gap: --spacing(2); margin-top: --spacing(3); font-size: var(--fs-small); }
  .adjustment-secondary { display: grid; gap: --spacing(2); }
  @media (max-width: 480px) { .adjustment-panels { grid-template-columns: 1fr; } .adjustment-image-wrap img { max-height: 300px; } }

  /* Receipt */
  .source-badge { display: inline-flex; align-items: center; min-height: 28px; margin-bottom: --spacing(4); padding: 0 --spacing(3); border-radius: 999px; background: var(--surface-sunken); color: var(--muted-foreground); font-size: var(--fs-caption); font-weight: 700; }
  .photo-review { font-size: var(--fs-small); }
  .photo-review > * + * { margin-top: --spacing(2); }
  .photo-link { display: flex; flex-direction: column; align-items: center; gap: --spacing(2); margin-bottom: --spacing(4); color: var(--primary-strong); font-weight: 700; text-decoration: underline; text-underline-offset: 4px; }
  .photo-link img { width: 100%; height: 170px; border-radius: var(--r-sm); background: var(--surface-sunken); object-fit: contain; }
  .photo-link span { display: inline-flex; align-items: center; gap: --spacing(1); }
  .photo-link svg { width: 16px; height: 16px; }
  .photo-actions { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: --spacing(2); }
  .photo-actions-wide { grid-column: 1 / -1; }
  .photo-review .photo-input { width: 100%; }
  .photo-busy { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: --spacing(2); }
  .translation-controls { display: grid; gap: --spacing(2); margin-bottom: --spacing(4); }
  .translation-controls > .notice { margin: 0; }
  .translation-status { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: --spacing(2); font-size: var(--fs-small); }
  .dish-translation { display: block; margin-top: --spacing(1); font-size: var(--fs-small); line-height: 1.3; overflow-wrap: anywhere; }
  .receipt-heading { display: flex; justify-content: space-between; margin-bottom: --spacing(4); padding-bottom: --spacing(3); border-bottom: 1px dashed var(--rule); font: 700 var(--fs-caption) / 1.4 var(--font-receipt); letter-spacing: 0.16em; }
  .item-editor { row-gap: --spacing(1.5); margin-bottom: --spacing(4); }
  .item-editor > .field-label { margin: 0; }
  .item-editor > .money-label { text-align: right; }
  .item-extra { grid-column: 1 / -1; min-width: 0; }
  .item-extra:empty { display: none; }
  .add-item { width: 100%; margin: --spacing(1) 0 --spacing(5); }
  .totals-line { padding: --spacing(2) 0; font-size: var(--fs-small); }
  .extras-row { row-gap: --spacing(1.5); margin: --spacing(2) 0; font-size: var(--fs-small); }
  .extras-row small { display: block; font-size: var(--fs-caption); color: var(--muted-foreground); }
  .grand-total { margin-top: --spacing(4); padding-top: --spacing(4); border-top: 1px dashed var(--rule); font-size: var(--fs-heading); font-weight: 700; }
  .grand-total .money { color: var(--primary-strong); }
  .printed-totals { margin-top: --spacing(3); padding-top: --spacing(3); border-top: 1px solid var(--border); }
  .printed-totals p { margin: --spacing(1) 0; font-size: var(--fs-caption); color: var(--muted-foreground); }
  .receipt-line-details { padding-top: --spacing(2); font-size: var(--fs-caption); line-height: 1.4; color: var(--muted-foreground); overflow-wrap: anywhere; }
  .receipt-line-details p { margin: 0 0 --spacing(1); }
  .receipt-line-details .row { margin: --spacing(2) 0; }
  .note-field { margin-bottom: --spacing(4); }

  /* People */
  .add-friend .row { flex-wrap: nowrap; }
  .friends-list { display: grid; gap: --spacing(3); margin-bottom: --spacing(4); }
  .friend-row { display: flex; align-items: center; gap: --spacing(2); padding: --spacing(2) --spacing(2) --spacing(2) --spacing(3); border-radius: var(--r-lg); background: var(--person-color); }
  .friend-visible-name { flex: 1; min-width: 0; font-size: var(--fs-body); font-weight: 700; overflow-wrap: anywhere; }
  .empty-state { padding: --spacing(8) --spacing(4); text-align: center; font-size: var(--fs-small); color: var(--muted-foreground); }

  /* Split */
  .assignment-count { margin-bottom: --spacing(4); font-size: var(--fs-caption); font-weight: 700; color: var(--muted-foreground); }
  .assignment-count.done { color: var(--success); }
  .assignment { min-width: 0; }
  .assignment.unassigned { border: 2px solid var(--destructive); }
  .assignment-title { display: flex; align-items: flex-start; justify-content: space-between; gap: --spacing(3); margin-bottom: --spacing(4); }
  .assignment-title > div { min-width: 0; }
  .assignment-title h2 { margin: 0; font-size: var(--fs-body); overflow-wrap: anywhere; }
  .assignment-title b { flex: none; font-size: var(--fs-body); }
  .allocation-editor { display: grid; gap: --spacing(3); min-width: 0; }
  .split-method { display: flex; align-items: center; justify-content: space-between; gap: --spacing(3); font-size: var(--fs-small); }
  .assign-hint { font-size: var(--fs-caption); color: var(--muted-foreground); }
  .unassigned .assign-hint { color: var(--destructive); }
  .quantity-heading, .share-inputs { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: end; gap: --spacing(3); }
  .share-field { display: grid; gap: --spacing(1.5); min-width: 0; overflow-wrap: anywhere; }
  .share-field > .field-label { margin: 0; }
  .item-share-preview { display: grid; gap: --spacing(1.5); margin: 0; padding: --spacing(3); list-style: none; border-radius: var(--r-sm); background: var(--surface-sunken); font-size: var(--fs-small); font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }

  /* Result */
  .result-icon { display: grid; place-items: center; flex: none; width: 24px; height: 24px; border-radius: 50%; background: var(--success-soft); color: var(--success); }
  .result-icon svg { width: 14px; height: 14px; }
  .result-shares { display: grid; gap: --spacing(4); margin-bottom: --spacing(4); }
  .result-shares > .paper { margin: 0; }
  .person-result { border: 0; background: var(--person-color); }
  .person-result > summary { display: block; list-style: none; }
  .person-result > summary:focus-visible { border-radius: var(--r-sm); }
  .result-summary { display: block; min-width: 0; }
  .result-summary-heading { display: flex; align-items: center; gap: --spacing(3); }
  .person-result-name { flex: 1; min-width: 0; font-size: var(--fs-heading); font-weight: 700; line-height: 1.3; overflow-wrap: anywhere; }
  .person-result-name small { display: flex; align-items: center; gap: --spacing(1); font-size: var(--fs-caption); font-weight: 400; color: var(--muted-foreground); }
  .result-summary-heading > b { flex: none; font-size: var(--fs-amount); line-height: 1.1; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
  .share-composition { margin-top: --spacing(4); }
  .composition-track { width: 100%; height: 10px; overflow: hidden; border-radius: 999px; background: color-mix(in srgb, var(--surface) 60%, transparent); }
  .composition-filled { display: flex; height: 100%; min-width: 0; }
  .composition-filled span { height: 100%; background: var(--composition-color); }
  .composition-items { --composition-color: var(--chart-1); }
  .composition-tax { --composition-color: var(--chart-2); }
  .composition-tip { --composition-color: var(--chart-3); }
  .composition-legend { display: flex; flex-wrap: wrap; gap: --spacing(1) --spacing(3); margin-top: --spacing(2); font-size: var(--fs-caption); font-variant-numeric: tabular-nums; }
  .composition-legend span { display: inline-flex; align-items: center; gap: --spacing(1); }
  .composition-legend i { width: 8px; height: 8px; border-radius: 50%; background: var(--composition-color); }
  .person-breakdown { min-width: 0; margin-top: --spacing(4); padding-top: --spacing(4); border-top: 1px solid var(--line-on-tint); font-size: var(--fs-caption); }
  .person-breakdown h3 { margin: 0 0 --spacing(2); }
  .breakdown-items { margin: 0; padding: 0; list-style: none; }
  .breakdown-items li { padding: --spacing(2) 0; border-bottom: 1px solid var(--line-on-tint); }
  .breakdown-row { display: flex; align-items: baseline; justify-content: space-between; gap: --spacing(2); min-width: 0; font-size: var(--fs-small); }
  .breakdown-row > :first-child { min-width: 0; overflow-wrap: anywhere; }
  .breakdown-row > b { flex: none; font-variant-numeric: tabular-nums; }
  .person-breakdown p { margin: --spacing(1) 0 0; color: var(--muted-foreground); overflow-wrap: anywhere; }
  .breakdown-subtotal, .breakdown-fee, .breakdown-person-total { padding-top: --spacing(3); }
  .breakdown-person-total { margin-top: --spacing(3); border-top: 1px solid var(--line-on-tint); }
  .result-line { display: flex; justify-content: space-between; gap: --spacing(4); }
  .result-line .money { font-variant-numeric: tabular-nums; }
  .allocation-difference { margin-top: --spacing(4); font-size: var(--fs-caption); color: var(--success); }
  .result-total .fine-print { margin-top: --spacing(1); }
  .copy-status:empty { display: none; }
  .new-bill { margin-bottom: --spacing(4); }
}
```

- [ ] **Step 4: Run the guard to verify it passes**

Run: `npx vitest run src/app/globals.test.ts`
Expected: 4 passed.

- [ ] **Step 5: Build to verify Tailwind accepts `--spacing()`, the theme mapping and the layers**

Run: `npm run build`
Expected: build succeeds. If `--spacing(...)` is rejected, the error names the declaration; replace each `--spacing(n)` with `calc(var(--spacing) * n)` and rebuild.

- [ ] **Step 6: Commit**

```bash
git add src/app/globals.css src/app/globals.test.ts
git commit -m "feat: design tokens, cascade layers and a CSS guard"
```

---

### Task 4: Button, Input and Notice primitives

**Files:**
- Modify: `src/components/ui/button.tsx` (cva only)
- Modify: `src/components/ui/input.tsx` (class list only)
- Create: `src/components/ui/notice.tsx`

- [ ] **Step 1: Replace the cva in `src/components/ui/button.tsx`**

Replace lines 5–40 (the `buttonVariants` declaration) with:
```ts
const buttonVariants = cva(
  "group/button relative inline-flex shrink-0 items-center justify-center gap-2 rounded-md border border-transparent bg-clip-padding text-center text-sm leading-tight font-bold text-balance transition-[background-color,box-shadow,transform] duration-150 ease-out select-none disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-[var(--shadow-press)] hover:bg-[color-mix(in_oklch,var(--primary),var(--foreground)_8%)] active:translate-y-[2px] active:shadow-none",
        outline: "border-input bg-surface text-foreground hover:bg-surface-sunken",
        ghost: "text-primary-strong hover:bg-surface-sunken",
        link: "text-primary-strong underline underline-offset-4",
      },
      size: {
        default: "min-h-11 px-4 py-2",
        lg: "min-h-13 px-5 py-3 text-base [&_svg:not([class*='size-'])]:size-5",
        icon: "size-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)
```
(No `outline-none` and no ring classes: the single focus style lives in `@layer base`.)

- [ ] **Step 2: Replace the class list in `src/components/ui/input.tsx`**

Replace the first `cn(` argument (line 11) with:
```ts
        "min-h-11 w-full min-w-0 rounded-md border border-input bg-surface px-3 py-2 text-base font-normal text-foreground transition-colors file:inline-flex file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-2 aria-invalid:border-destructive",
```

- [ ] **Step 3: Create `src/components/ui/notice.tsx`**

```tsx
import type { ReactNode } from "react";
import { Check, CircleAlert, Info, TriangleAlert } from "lucide-react";
const icons = { info: Info, warning: TriangleAlert, error: CircleAlert, success: Check };
export type NoticeTone = keyof typeof icons;
// Tone is shown by icon and color together; role stays the caller's choice (status, alert or none).
export function Notice({ tone, title, role, className, children }: { tone: NoticeTone; title?: string; role?: "status" | "alert"; className?: string; children: ReactNode }) {
  const Icon = icons[tone];
  return <div className={className ? `notice ${className}` : "notice"} data-tone={tone} role={role}><Icon aria-hidden="true"/><div className="notice-body">{title && <h2 className="notice-title">{title}</h2>}{children}</div></div>;
}
```

- [ ] **Step 4: Remove the `size="sm"` use**

In `src/components/bill-wizard.tsx` line 65, delete ` size="sm"` from the Reset bill `Button` (the size no longer exists). Task 5 replaces this line anyway.

- [ ] **Step 5: Type check, lint, unit tests**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: no errors; all unit tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/components/ui/button.tsx src/components/ui/input.tsx src/components/ui/notice.tsx src/components/bill-wizard.tsx
git commit -m "feat: diner Button, Input and Notice primitives"
```

---

### Task 5: Shell (header, step bar, bar reserve, wizard notices)

**Files:**
- Modify: `src/components/bill-wizard.tsx:1-4` (imports) and `:65-76` (render)

- [ ] **Step 1: Add the import**

After line 4 (`import { Button } from "./ui/button";`) add:
```tsx
import { Notice } from "./ui/notice";
```

- [ ] **Step 2: Replace the render (lines 65–76)**

```tsx
  const adjustingPhoto = !!(adjusting && adjustUrl); const current = adjustingPhoto ? 0 : steps.indexOf(s.step); const withBar = s.hasHydrated && (adjustingPhoto || s.step !== "home");
  return <div className={`app-shell${withBar ? " has-bottom-bar" : ""}`}><header className="brand-header"><div className="brand-header-inner"><div className="brand"><span className="brand-mark"><Utensils size={20} aria-hidden="true"/></span>CheckMates<span className="brand-dot">.</span></div><div className="header-actions"><span className="header-note">A fair share of a good time.</span><Button type="button" variant="outline" className="reset-bill" disabled={!s.hasHydrated} onClick={reset} title="Clear the current bill and start again"><RotateCcw aria-hidden="true"/> Reset bill</Button></div></div></header>
    <main className="wizard-main">
      {!s.hasHydrated ? <p role="status">Getting your table ready…</p> : <>
        <nav aria-label="Bill progress" className="step-progress">{["Start", "Receipt", "Friends", "Split", "Result"].map((label, i) => <div key={label} aria-current={i === current ? "step" : undefined} className={i <= current ? "active" : ""}><span>{i + 1}</span><small>{label}</small></div>)}</nav>
        {adjusting && adjustUrl ? <PhotoAdjustment key={adjustUrl} file={adjusting} originalUrl={adjustUrl} initialAdjustment={adjustments.get(adjusting)} engine={engine} onEngineChange={next => { setEngine(next); writeEnginePreference(window.localStorage, next); }} onAdjustmentChange={saveAdjustment} onSelect={selectForAdjustment} onConfirm={image => void confirmAdjustment(image)} onBack={discardAdjustment} onManual={() => { if (s.step === "receipt" && !window.confirm("Enter items manually? This replaces the current receipt edits with a blank draft.")) return; commitPhoto(adjusting); setAdjusting(null); s.startBill("photo", adjusting.name); s.setReceiptDraft(parseReceiptText("")); useTranslationStore.getState().clearForBill(); setDraftVersion(v => v + 1); }}/> : <>
          {s.storageError && <Notice tone="warning" role="status">{s.storageError}</Notice>}{s.error && <Notice tone="error" role="alert">{s.error}</Notice>}{error && s.step !== "home" && <Notice tone="error" role="alert">{error}</Notice>}
          {s.step === "home" && <HomeStep busy={busy} stage={stage} progress={progress} error={error} hasPhoto={!!photoUrl} onCancel={cancel} onRetry={() => selectForAdjustment(file.current!)} onPhotoSelected={selectForAdjustment} onDemo={() => { cancel(); releasePhoto(); setError(null); useTranslationStore.getState().clearForBill(); s.startBill("demo"); }} onManual={() => { cancel(); if (s.source !== "photo") s.startBill("photo"); s.setReceiptDraft(parseReceiptText("")); useTranslationStore.getState().clearForBill(); setDraftVersion(v => v + 1); }}
          />}
          {s.step === "receipt" && <ReceiptStep key={draftVersion} photoUrl={photoUrl} onAttach={attach} onRotate={() => { if (file.current) selectForAdjustment(file.current); }} onRecognize={enhanced => { if (file.current) selectForAdjustment(file.current, enhanced); }} busy={busy} stage={stage} onCancel={() => { cancel(); if (pendingUrl.current) discardAdjustment(); }}/>}
          {s.step === "people" && <PeopleStep/>}{s.step === "split" && <SplitStep/>}{s.step === "result" && <ResultStep onReset={reset}/>}
        </>}
      </>}
    </main><footer className="site-footer">Made for meals worth sharing.</footer>
  </div>;
```

- [ ] **Step 3: Check and test**

Run: `npx tsc --noEmit && npm run lint && npx playwright test tests/e2e/reset-bill.spec.ts --project=chromium`
Expected: no errors; reset-bill passes.

- [ ] **Step 4: Commit**

```bash
git add src/components/bill-wizard.tsx
git commit -m "feat: aligned header, step bar on photo adjustment, bar reserve"
```

---

### Task 6: Home step and offline data

**Files:**
- Modify: `src/components/home/home-step.tsx` (whole file)
- Modify: `src/components/home/offline-data.tsx` (whole file)

- [ ] **Step 1: Replace `src/components/home/home-step.tsx`**

```tsx
import { Camera, Upload, Utensils, ArrowRight, ShieldCheck } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { cn } from "@/lib/utils";
import { useBillStore } from "@/store/useBillStore";
import { OfflineData } from "./offline-data";
export function PhotoInput({ onSelect, camera = false, label, variant = "outline", size = "default" }: { onSelect: (file: File) => void; camera?: boolean; label: string; variant?: "default" | "outline"; size?: "default" | "lg" }) {
  return <label className={cn(buttonVariants({ variant, size }), "photo-input")}>{camera ? <Camera aria-hidden="true"/> : <Upload aria-hidden="true"/>}{label}<input aria-label={label} type="file" accept="image/jpeg,image/png,image/webp" capture={camera ? "environment" : undefined} onChange={e => { const file = e.target.files?.[0]; if (file) onSelect(file); e.target.value = ""; }}/></label>;
}
export function HomeStep({ onPhotoSelected, onDemo, busy, stage, progress, error, onCancel, onRetry, onManual, hasPhoto }: { onPhotoSelected: (file: File) => void; onDemo: () => void; busy: boolean; stage: string; progress: number | null; error: string | null; onCancel: () => void; onRetry: () => void; onManual: () => void; hasPhoto: boolean }) {
  const source = useBillStore(s => s.source);
  return <section className="home-step">
    <p className="eyebrow">GOOD FOOD. GOOD COMPANY.</p>
    <h1>Share the meal.<br/><span>Split the bill.</span></h1>
    <p className="lead">From “who had the fries?” to everyone’s fair share. Down to the last cent.</p>
    <div className="receipt-illustration" aria-hidden="true"><div className="little-sticker"><Utensils size={24}/></div><div className="mini-title">THE GOOD TIMES</div><div className="mini-rule"/><p>Burger <b>14.95</b></p><p>Fries to share <b>5.95</b></p><p>Lemonade <b>3.50</b></p><div className="mini-rule"/><div className="mini-bottom">A little yours. A little mine.</div><div className="friend-stickers"><span className="person-1">A</span><span className="person-2">B</span><span className="person-3">C</span></div></div>
    {busy ? <div className="paper status-box" role="status"><h2>Reading your receipt</h2><p>{stage}</p>{progress !== null && <progress max={1} value={progress} aria-label="Recognition progress"/>}<p className="muted">Your photo stays in this browser.</p><Button variant="outline" onClick={onCancel}>Cancel recognition</Button></div> : <div className="home-actions">
      {error && <Notice tone="error" role="alert">{error}</Notice>}
      {source === "photo" && !hasPhoto && <Notice tone="info">Your session is saved, but photos and in-progress recognition do not survive a refresh. Select the photo again or enter items manually.</Notice>}
      <PhotoInput camera variant="default" size="lg" onSelect={onPhotoSelected} label="Take a photo"/>
      <PhotoInput size="lg" onSelect={onPhotoSelected} label="Upload a receipt"/>
      {hasPhoto && <Button variant="outline" size="lg" onClick={onRetry}>Retry recognition</Button>}
      {(error || source === "photo") && <Button variant="outline" size="lg" onClick={onManual}>Enter items manually</Button>}
      <Button variant="ghost" size="lg" onClick={onDemo}>Try a sample bill <ArrowRight aria-hidden="true"/></Button>
    </div>}
    <p className="privacy"><ShieldCheck aria-hidden="true"/> No sign-up. No photo uploads to a server.</p>
    <p className="fine-print">English receipts · USD · JPEG, PNG or WebP · Up to 15 MiB</p>
    <div className="how-it-works"><span><b>01</b> Snap & check</span><span><b>02</b> Pick your people</span><span><b>03</b> Share the split</span></div>
    <OfflineData/>
  </section>;
}
```

- [ ] **Step 2: Replace the render of `src/components/home/offline-data.tsx`**

Change the imports to add:
```tsx
import { ChevronDown } from "lucide-react";
import { Notice } from "@/components/ui/notice";
```
and replace the `return` (lines 16–21) with:
```tsx
  return <details className="offline-data disclosure"><summary>Offline data<ChevronDown className="disclosure-icon" aria-hidden="true"/></summary>
    <p className="muted">Models are stored in this browser only and removed automatically after 14 days without use. iOS may also remove them after 7 days without use.</p>
    {error && <Notice tone="warning">{error}</Notice>}
    {rows?.map(row => <div className="offline-row" key={row.id}><span>{LABELS[row.id]} · {row.cached ? `Downloaded · ${mb(row.totalBytes)}` : "Not downloaded"}</span>
      {row.cached && <Button variant="outline" aria-label={`Remove ${LABELS[row.id]}`} onClick={async () => { await removeBundle(row.id); if (row.id === "translate-enzh") useTranslationStore.getState().forgetModel(); setGeneration(g => g + 1); }}>Remove</Button>}</div>)}
  </details>;
```

- [ ] **Step 3: Check and test**

Run: `npx tsc --noEmit && npm run lint && npx playwright test tests/e2e/ocr-flow.spec.ts tests/e2e/dish-translation.spec.ts --project=chromium`
Expected: no errors; both specs pass. They cover home errors, retry, manual entry and Offline data removal.

- [ ] **Step 4: Commit**

```bash
git add src/components/home
git commit -m "feat: home CTAs on one button family, tone notices, quiet offline data"
```

---

### Task 7: Photo adjustment

**Files:**
- Modify: `src/components/receipt/photo-adjustment.tsx:1-4` (imports) and `:121-149` (render)

- [ ] **Step 1: Imports**

After `import { Button } from "@/components/ui/button";` add:
```tsx
import { ArrowRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";
```

- [ ] **Step 2: Replace the render (from `return <section className="photo-adjustment">` to the closing `</section>;`)**

```tsx
  return <section className="photo-adjustment">
    <div className="step-heading"><p className="eyebrow">FIRST, CHECK THE PHOTO</p><h1>Adjust your photo</h1><p>Keep every item, tax, and total inside the page.</p></div>
    <Notice tone="info" role="status">{analysisStatus}</Notice>
    {(error || fileError) && <Notice tone="error" role="alert">{error || fileError}</Notice>}
    <div className="adjustment-panels">
      <div><h2>Original</h2><div className="adjustment-image-wrap">
        <img src={orientedUrl ?? originalUrl} alt="Original receipt photo" />
        {adjustment.corners && orientedUrl && <div className="corner-layer" aria-label="Receipt corners"><svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><polygon points={adjustment.corners.map(point => `${point.x * 100},${point.y * 100}`).join(" ")} /></svg>{adjustment.corners.map((point, index) => <button key={index} type="button" className="corner-handle" style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }} aria-label={`${cornerNames[index]} corner`} onPointerDown={event => event.currentTarget.setPointerCapture(event.pointerId)} onPointerMove={event => dragCorner(event, index)} onKeyDown={event => moveCorner(event, index)} />)}</div>}
      </div></div>
      <div><h2>After correction</h2><div className="adjustment-image-wrap"><img src={correctedUrl ?? orientedUrl ?? originalUrl} alt="Photo that will be used for recognition" onLoad={event => setLoadedPreviewUrl(event.currentTarget.currentSrc)} /></div></div>
    </div>
    <div className="paper"><p className="field-label">Adjust</p>
      <div className="tool-grid">
        <Button type="button" variant="outline" disabled={!image || busy} onClick={() => { userEdited.current = false; setError(null); setAnalysisStatus("Analyzing this photo…"); setAdjustment(previous => ({ ...previous, quarterTurns: (previous.quarterTurns + 1) % 4, corners: null, angle: 0 })); }}>Rotate 90°</Button>
        <Button type="button" variant="outline" disabled={!image || busy} onClick={() => { userEdited.current = true; setError(null); setAnalysisStatus("Manual adjustment selected. Check the preview."); setAdjustment(previous => ({ ...previous, corners: previous.corners ?? fullCorners, angle: 0 })); }}>Adjust four corners</Button>
        <Button type="button" variant="outline" disabled={!image || busy} onClick={() => { userEdited.current = true; setError(null); setAnalysisStatus("Using the original photo."); setAdjustment(previous => ({ corners: null, angle: 0, quarterTurns: previous.quarterTurns })); }}>Use original photo</Button>
        <Button type="button" variant="outline" disabled={!image || busy} onClick={() => { userEdited.current = true; setError(null); setAnalysisStatus("Using the original photo."); setAdjustment({ corners: null, angle: 0, quarterTurns: 0 }); }}>Reset adjustments</Button>
      </div>
      <label className="angle-field">Fine tune angle <Input aria-label="Fine tune angle" className="w-22" type="number" min={-45} max={45} step="0.1" disabled={busy} value={adjustment.angle} onChange={event => { userEdited.current = true; setAnalysisStatus("Manual adjustment selected. Check the preview."); setAdjustment(previous => ({ ...previous, angle: Math.max(-45, Math.min(45, Number(event.target.value) || 0)) })); }} /> degrees</label>
    </div>
    <div className="paper"><fieldset className="choice-group"><legend className="field-label">Recognition engine</legend>
      <label className={`choice-card${engine === "standard" ? " selected" : ""}`}><input type="radio" name="ocr-engine" value="standard" disabled={busy} checked={engine === "standard"} onChange={() => onEngineChange("standard")} /><span><b>Standard (fast)</b></span></label>
      <label className={`choice-card${engine === "precise" ? " selected" : ""}`}><input type="radio" name="ocr-engine" value="precise" disabled={busy} checked={engine === "precise"} onChange={() => onEngineChange("precise")} /><span><b>Precise</b> <small>first use downloads about 45 MB; stays in this browser</small></span></label>
    </fieldset></div>
    <div className="adjustment-secondary"><PhotoInput onSelect={onSelect} label="Choose another receipt photo" /><Button type="button" variant="ghost" onClick={onManual}>Enter items manually</Button></div>
    <div className="bottom-actions"><div className="bottom-actions-inner"><Button type="button" variant="outline" onClick={onBack}>Back</Button><Button type="button" disabled={!image || busy || !previewReady || analysisStatus === "Analyzing this photo…"} onClick={() => void confirm()}>{busy ? "Preparing photo…" : engine === "precise" ? "Use this photo and recognize (precise)" : "Use this photo and recognize"} <ArrowRight aria-hidden="true"/></Button></div></div>
  </section>;
```

- [ ] **Step 3: Check and test**

Run: `npx tsc --noEmit && npm run lint && npx playwright test tests/e2e/photo-adjustment.spec.ts --project=chromium`
Expected: no errors; photo-adjustment passes (corner keyboard/drag, `Fine tune angle`, `Back`, manual entry).

- [ ] **Step 4: Commit**

```bash
git add src/components/receipt/photo-adjustment.tsx
git commit -m "feat: grouped photo tools, engine choice cards, bottom bar"
```

---

### Task 8: Receipt step, line details and translation controls

**Files:**
- Modify: `src/components/receipt/receipt-step.tsx:3-7` (imports), `:57-88` (render)
- Modify: `src/components/receipt/receipt-line-details.tsx` (whole file)
- Modify: `src/components/translation/translation-controls.tsx` (whole file)

- [ ] **Step 1: Imports in `receipt-step.tsx`**

Replace line 3 with:
```tsx
import { Plus, Trash2, RotateCw, ArrowRight, ChevronDown, ExternalLink } from "lucide-react";
```
and after the `Input` import add:
```tsx
import { Notice } from "@/components/ui/notice";
```

- [ ] **Step 2: Replace the render (from `return <section><div className="step-heading">` to the closing `</section>;`)**

```tsx
  return <section><div className="step-heading"><p className="eyebrow">A QUICK DOUBLE-CHECK</p><h1>Check the receipt</h1><p>Make sure each price is the whole line total after discounts.</p></div>
    <span className="source-badge">{s.source === "demo" ? "Sample bill · editable" : "Your photo · review required"}</span>
    {s.source === "photo" && <div className="photo-review paper">
      {photoUrl ? <><a href={photoUrl} target="_blank" rel="noreferrer" className="photo-link"><img src={photoUrl} alt="Your original receipt — open to zoom"/><span>Open photo to zoom <ExternalLink aria-hidden="true"/></span></a><div className="photo-actions"><Button variant="outline" className="photo-actions-wide" onClick={onRotate} disabled={busy}><RotateCw aria-hidden="true"/> Adjust or rotate photo</Button><Button variant="outline" onClick={()=>onRecognize()} disabled={busy}>Recognize again</Button><Button variant="outline" onClick={()=>onRecognize(true)} disabled={busy}>Enhanced scan</Button></div></> : <p className="muted">Your draft is saved. Reattach the photo to view it; this will not replace your edits.</p>}
      <PhotoInput label="Reattach receipt photo" onSelect={onAttach}/>
      {busy && <div role="status" className="photo-busy"><p>{stage}</p><Button variant="outline" onClick={onCancel}>Cancel recognition</Button></div>}
      {draft && <details className="disclosure"><summary>Original recognized text<ChevronDown className="disclosure-icon" aria-hidden="true"/></summary><pre>{draft.rawText || "No text recognized."}</pre></details>}
      {draft?.alternateRawText&&<details className="disclosure"><summary>Alternative recognized text<ChevronDown className="disclosure-icon" aria-hidden="true"/></summary><pre>{draft.alternateRawText}</pre></details>}
      {!!draft?.financialRawText?.length&&<details className="disclosure"><summary>Tax and total recognition evidence<ChevronDown className="disclosure-icon" aria-hidden="true"/></summary><pre>{draft.financialRawText.join("\n\n---\n\n")}</pre></details>}
    </div>}
    <form onSubmit={submit} noValidate>
      <TranslationControls items={items.map(i => ({ id: i.id, name: i.name }))}/>
      <div className="paper receipt-editor"><div className="receipt-heading"><b>THE RECEIPT</b><span>USD</span></div>
        {items.map((item, index) => <div key={item.id} className="item-editor money-grid">
          <label className="field-label" htmlFor={`name-${item.id}`}>Item {index + 1}</label><label className="field-label money-label" htmlFor={`price-${item.id}`}>Price</label><span aria-hidden="true"/>
          <Input id={`name-${item.id}`} aria-label={`Item ${index + 1} name`} value={item.name} aria-invalid={!!errors[`name-${item.id}`]} aria-describedby={errors[`name-${item.id}`] ? `name-${item.id}-error` : undefined} onChange={e => { useTranslationStore.getState().invalidate(item.id); setItems(items.map(i => i.id === item.id ? { ...i, name: e.target.value } : i)); }}/>
          <Input id={`price-${item.id}`} className="money" aria-label={`Price for ${item.name || `item ${index + 1}`}`} inputMode="decimal" value={item.price} aria-invalid={!!errors[`price-${item.id}`]} aria-describedby={errors[`price-${item.id}`] ? `price-${item.id}-error` : undefined} onChange={e => setItems(items.map(i => i.id === item.id ? { ...i, price: e.target.value } : i))}/>
          <Button type="button" className="remove-item text-muted-foreground" variant="ghost" size="icon" aria-label={`Remove ${item.name || `item ${index + 1}`}`} onClick={() => setItems(items.filter(i => i.id !== item.id))}><Trash2 aria-hidden="true"/></Button>
          <div className="item-extra"><DishLabel id={item.id} originalName={item.name}/>{error(`name-${item.id}`)}{error(`price-${item.id}`)}{item.receiptDetails&&<ReceiptLineDetails name={item.name} details={item.receiptDetails} onDiscountChoice={choice=>chooseDiscount(item.id,choice)}/>}</div>
        </div>)}
        <Button type="button" variant="outline" className="add-item border-dashed" onClick={() => setItems([...items, { id: crypto.randomUUID(), name: "", price: "", allocation: {mode:"equal",personIds:[]} }])}><Plus aria-hidden="true"/> Add item</Button>
        <div className="money-grid totals-line"><span>Items subtotal</span><b className="money">{formatMoney(subtotal)}</b></div>
        {([["tax", "Tax", tax, setTax], ["charged-tip", "Tip already on receipt", chargedTip, setChargedTip], ["added-tip", "Added tip", addedTip, setAddedTip]] as const).map(([id, label, value, setter]) => <div key={id} className="money-grid extras-row"><label htmlFor={id}>{label}{id === "added-tip" && <small>Only what you want to add now</small>}</label><Input id={id} className="money" inputMode="decimal" value={value} aria-invalid={!!errors[id]} aria-describedby={errors[id] ? `${id}-error` : undefined} onChange={e => setter(e.target.value)}/>{error(id)}</div>)}
        <div className="money-grid totals-line grand-total"><span>Edited total</span><b className="money">{formatMoney(total)}</b></div>
        {draft && <div className="printed-totals"><p className="money-grid">Printed subtotal <b className="money">{draft.printedSubtotalCents === null ? "Not identified" : formatMoney(draft.printedSubtotalCents)}</b></p><p className="money-grid">Printed total <b className="money">{draft.printedTotalCents === null ? "Not identified" : formatMoney(draft.printedTotalCents)}</b></p>{reconciliation?.differenceCents !== null && <p className="money-grid">Difference before added tip <b className="money">{formatMoney(reconciliation!.differenceCents!)}</b></p>}</div>}
      </div>
      {!!draft?.unassignedDiscounts?.length&&<Notice tone="warning" title="Unassigned discounts"><p>These discounts cannot be attributed automatically. Correct the affected item line totals using the photo before continuing.</p><pre>{draft.unassignedDiscounts.join("\n")}</pre><label className="checkbox-label"><input type="checkbox" checked={discountsReviewed} onChange={e=>setDiscountsReviewed(e.target.checked)}/> I corrected the item totals for these unassigned discounts.</label>{error("discount")}</Notice>}
      {!!warnings.length && <Notice tone="warning" title="Before we split" className="review-notes"><ul>{warnings.map((w, i) => <li key={i}>{w}</li>)}</ul><label className="checkbox-label"><input type="checkbox" checked={checked} aria-invalid={!!errors.review} onChange={e => setChecked(e.target.checked)}/> I checked the photo, amounts, and all review notes.</label>{error("review")}</Notice>}
      {mismatch && <div className="note-field"><label className="field-label" htmlFor="difference-note">Reason for the difference</label><Input id="difference-note" value={note} aria-invalid={!!errors.note} aria-describedby={errors.note ? "note-error" : undefined} onChange={e => setNote(e.target.value)}/>{error("note")}</div>}
      {errors.form && <Notice tone="error" role="alert">{errors.form}</Notice>}
      <div className="bottom-actions"><div className="bottom-actions-inner"><Button type="button" variant="outline" onClick={() => { onCancel(); s.goTo("home"); }}>Back</Button><Button type="submit" disabled={busy}>Add friends <ArrowRight aria-hidden="true"/></Button></div></div>
    </form>
  </section>;
```
(Printed labels stay bare text nodes so `getByText("Printed total")` still finds the row together with its amount.)

- [ ] **Step 3: Replace `src/components/receipt/receipt-line-details.tsx`**

```tsx
import { ChevronDown } from "lucide-react";
import type { ReceiptDetails } from "@/types/receipt-details";
import { formatMoney } from "@/lib/money";
import { Button } from "@/components/ui/button";
export function ReceiptLineDetails({name,details,onDiscountChoice}:{name:string;details:ReceiptDetails;onDiscountChoice:(choice:"included"|"subtract")=>void}){
 return <div className="receipt-line-details">
  <p>{details.quantity!==undefined&&details.quantity!==null&&<>Receipt quantity: {details.quantity}. </>}{details.unitPriceCents!==undefined&&details.unitPriceCents!==null&&<>Unit price: {formatMoney(details.unitPriceCents)}. </>}{details.taxCode&&<>Tax code: {details.taxCode}.</>}</p>
  {!!details.modifiers.length&&<p>Options: {details.modifiers.map(m=>m.text).join(" · ")}</p>}
  {details.reviewCodes.includes("ocr-price")&&<p className="field-error">Scans disagree on the printed amount. Enter the printed line amount from the photo before choosing the discount.</p>}
  {!!details.discounts.length&&<div>
   {details.discounts.map((d,i)=><p key={i}><span>{d.inclusion==="included"?"Discount already included":d.inclusion==="subtract"?"Discount subtracted once":"Discount needs review"}</span> · {formatMoney(d.discountCents)}</p>)}
   <p>Choose whether the printed line amount already includes the listed discount. These choices use the printed amount.</p>
   <div className="row"><Button type="button" variant="outline" onClick={()=>onDiscountChoice("included")}>Use printed line total</Button><Button type="button" variant="outline" onClick={()=>onDiscountChoice("subtract")}>Subtract listed discount</Button></div>
  </div>}
  <details className="disclosure"><summary>Receipt evidence for {name}<ChevronDown className="disclosure-icon" aria-hidden="true"/></summary><pre>{details.sourceLines.join("\n")}</pre></details>
 </div>;
}
```

- [ ] **Step 4: Replace the render of `src/components/translation/translation-controls.tsx`**

Add `import { Notice } from "@/components/ui/notice";` after the Button import, then replace the `return` (lines 11–18) with:
```tsx
  return <div className="translation-controls">
    <label className="switch-row"><input type="checkbox" role="switch" className="switch" aria-checked={s.enabled} checked={s.enabled} onChange={e => s.setEnabled(e.target.checked)}/> Show Chinese names</label>
    {s.enabled && s.needsDownload && <Notice tone="info" className="translation-download"><p>Some names are not in the built-in glossary. Translate them with the on-device model? One-time download of {mb(s.downloadBytes)}; nothing leaves this phone.</p><div className="notice-actions"><Button type="button" variant="outline" onClick={() => void s.allowModelAndRequest(items)}>Download and translate</Button><span className="muted">Not now — glossary matches stay visible</span></div></Notice>}
    {s.enabled && s.busy && <div role="status" aria-live="polite" className="translation-status"><p>{stage === "downloading" ? `Downloading translation model${percent !== null ? ` · ${percent}%` : ""}` : stage === "initializing" ? "Starting translation model" : stage === "translating" ? `Translating ${s.progress?.completedItems ?? 0} of ${s.progress?.totalItems ?? 0}` : stage === "queued" ? "Waiting for recognition to finish" : "Translating…"}</p>{(stage === "downloading" || stage === "initializing" || stage === "translating" || stage === "queued") && <Button type="button" variant="outline" onClick={() => s.cancel()}>Cancel</Button>}</div>}
    {s.enabled && s.error && <Notice tone="error" role="alert">{s.error} <Button type="button" variant="ghost" onClick={() => void s.allowModelAndRequest(items)}>Retry</Button></Notice>}
    {s.enabled && s.modelUnavailableReason && !s.busy && <p className="muted">On-device model unavailable in this browser; only glossary matches are shown.</p>}
    {s.enabled && <p className="fine-print">Machine translation for reference only. Original names stay as printed.</p>}
  </div>;
```

- [ ] **Step 5: Check and test**

Run: `npx tsc --noEmit && npm run lint && npx playwright test tests/e2e/bill-flow.spec.ts tests/e2e/complex-receipts.spec.ts tests/e2e/dish-translation.spec.ts tests/e2e/visual-alignment.spec.ts -g "receipt amounts|five steps|discount|translation|Chinese|edits" --project=chromium`
Expected: no errors. "receipt amounts share one right edge" now PASSES; bill-flow, complex-receipts and dish-translation pass.

- [ ] **Step 6: Commit**

```bash
git add src/components/receipt src/components/translation
git commit -m "feat: receipt money column, tone notices, switch row"
```

---

### Task 9: People step with edit mode

**Files:**
- Modify: `src/components/people/people-step.tsx` (whole file)
- Modify: `tests/e2e/result-explanation.spec.ts:121-122`

- [ ] **Step 1: Replace `src/components/people/people-step.tsx`**

```tsx
import { useRef, useState, type FormEvent } from "react";
import { ArrowRight, Check, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useBillStore } from "@/store/useBillStore";
import { personColor, personInitial } from "./person-style";
export function PeopleStep() {
  const s = useBillStore(); const [name, setName] = useState(""); const [error, setError] = useState(""); const [editing, setEditing] = useState<string | null>(null); const cancelled = useRef(false);
  function add(e: FormEvent) { e.preventDefault(); if (!name.trim()) { setError("Enter your friend's name."); return; } s.addPerson(name); setName(""); setError(""); }
  // Blur commits (an empty name keeps the old one), Escape cancels; focus returns to the pencil unless the user already moved it elsewhere.
  function finishEdit(id: string, value: string) { if (!cancelled.current && value.trim()) s.renamePerson(id, value); cancelled.current = false; setEditing(null); requestAnimationFrame(() => { if (document.activeElement === document.body) document.getElementById(`rename-${id}`)?.focus(); }); }
  return <section><div className="step-heading"><p className="eyebrow">THE MORE, THE MERRIER</p><h1>Who&apos;s in?</h1><p>Add everyone sharing this meal. Names can be changed anytime.</p></div>
    <form onSubmit={add} className="paper add-friend"><label className="field-label" htmlFor="friend-name">Friend&apos;s name</label><div className="row"><Input id="friend-name" className="flex-1" value={name} placeholder="e.g. Alex" autoComplete="off" aria-invalid={!!error} onChange={e => setName(e.target.value)}/><Button type="submit" variant="outline"><Plus aria-hidden="true"/> Add</Button></div>{error && <p role="alert" className="field-error">{error}</p>}</form>
    <div className="friends-list">{s.bill.people.map((p, i) => <div key={p.id} className={`friend-row ${personColor(i)}`}>
      <span className="avatar" aria-hidden="true">{personInitial(p.name)}</span>
      {editing === p.id ? <>
        <Input autoFocus aria-label={`New name for ${p.name}`} defaultValue={p.name} className="flex-1 border-muted-foreground" onFocus={e => e.currentTarget.select()} onBlur={e => finishEdit(p.id, e.currentTarget.value)} onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); else if (e.key === "Escape") { cancelled.current = true; e.currentTarget.blur(); } }}/>
        <Button type="button" variant="ghost" size="icon" className="text-success" aria-label="Save name" onPointerDown={e => e.preventDefault()} onClick={() => (document.activeElement as HTMLElement | null)?.blur()}><Check aria-hidden="true"/></Button>
      </> : <>
        <span className="friend-visible-name">{p.name}</span>
        <Button id={`rename-${p.id}`} type="button" variant="ghost" size="icon" className="text-muted-foreground" aria-label={`Rename ${p.name}`} onClick={() => setEditing(p.id)}><Pencil aria-hidden="true"/></Button>
      </>}
      <Button type="button" variant="ghost" size="icon" className="text-muted-foreground" aria-label={`Remove ${p.name}`} onClick={() => s.removePerson(p.id)}><Trash2 aria-hidden="true"/></Button>
    </div>)}</div>
    {!s.bill.people.length && <p className="empty-state">There’s a seat for everyone. Add your first friend above.</p>}
    <p className="muted">{s.bill.people.length} {s.bill.people.length === 1 ? "friend" : "friends"} at the table</p>
    <div className="bottom-actions"><div className="bottom-actions-inner"><Button variant="outline" onClick={() => s.goTo("receipt")}>Back to receipt</Button><Button onClick={() => { if (!s.bill.people.length) setError("Add at least one friend."); else s.goTo("split"); }}>Assign items <ArrowRight aria-hidden="true"/></Button></div></div>
  </section>;
}
```
If `npm run lint` flags `autoFocus` (jsx-a11y/no-autofocus), replace `autoFocus` with `ref={input => { if (input && document.activeElement !== input) input.focus(); }}`.

- [ ] **Step 2: Update the imports of `personColor`**

In `src/components/split/item-allocation-editor.tsx` and `src/components/result/result-step.tsx`, replace `import { personColor } from "../people/people-step";` with:
```tsx
import { personColor } from "../people/person-style";
```
(Tasks 10 and 11 also change the call sites to pass an index; until then a TypeScript error is expected at those calls, so do Step 2 together with the call-site edit: change `personColor(p.id)` to `personColor(people.findIndex(person => person.id === p.id))` in `item-allocation-editor.tsx` and to `personColor(s.bill.people.findIndex(person => person.id === p.id))` in `result-step.tsx`.)

- [ ] **Step 3: Update the rename in `tests/e2e/result-explanation.spec.ts`**

Replace lines 121–122:
```ts
  await page.getByLabel("Rename A").fill(longName);
  await page.getByLabel(`Rename A`).blur();
```
with:
```ts
  await page.getByRole("button", { name: "Rename A" }).click();
  await page.getByLabel("New name for A").fill(longName);
  await page.getByLabel("New name for A").blur();
```

- [ ] **Step 4: Check and test**

Run: `npx tsc --noEmit && npm run lint && npx playwright test tests/e2e/visual-alignment.spec.ts tests/e2e/result-explanation.spec.ts tests/e2e/bill-flow.spec.ts --project=chromium -g "friend rows|long item|five steps|totals"`
Expected: no errors. "friend rows show each name once…" PASSES; result-explanation's long-name test and bill-flow pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/people src/components/split/item-allocation-editor.tsx src/components/result/result-step.tsx tests/e2e/result-explanation.spec.ts
git commit -m "feat: friend rows with avatars, one visible name and in-place rename"
```

---

### Task 10: Split step and allocation editor

**Files:**
- Modify: `src/components/split/split-step.tsx` (whole file)
- Modify: `src/components/split/item-allocation-editor.tsx:1-8` (imports) and `:33-50` (render)

- [ ] **Step 1: Replace `src/components/split/split-step.tsx`**

```tsx
import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { DishLabel } from "@/components/translation/dish-label";
import { useBillStore } from "@/store/useBillStore";
import { formatMoney } from "@/lib/money";
import { validateItemAllocation } from "@/lib/item-allocation";
import { ItemAllocationEditor } from "./item-allocation-editor";
export function SplitStep() {
 const s=useBillStore();const [error,setError]=useState("");
 const assigned=s.bill.items.filter(i=>validateItemAllocation(i.allocation,s.bill.people).valid && !s.allocationEdits?.[i.id]).length;
 function proceed(){
   if(Object.keys(s.allocationEdits??{}).length){setError("Apply the pending shares before viewing the result.");return;}
   if(assigned!==s.bill.items.length){setError("Choose at least one friend for every item. Fully assign any quantities.");return;}
   setError("");s.goTo("result");
 }
 return <section><div className="step-heading"><p className="eyebrow">A BITE FOR EVERYONE</p><h1>Who had what?</h1><p>Choose who shared each item, equally or by their share.</p></div><p className={`assignment-count${assigned===s.bill.items.length?" done":""}`} role="status">{assigned} of {s.bill.items.length} items assigned</p>
 {s.bill.items.map(item=><fieldset className={`paper assignment${error&&!validateItemAllocation(item.allocation,s.bill.people).valid?" unassigned":""}`} key={item.id} aria-label={`Assign ${item.name}`}><legend className="sr-only">Assign {item.name}</legend><div className="assignment-title"><div><h2>{item.name}</h2><DishLabel id={item.id} originalName={item.name}/></div><b className="money">{formatMoney(item.priceCents)}</b></div><ItemAllocationEditor item={item} people={s.bill.people}/></fieldset>)}
 {error&&<Notice tone="error" role="alert">{error.startsWith("Choose")?<><span>Choose at least one friend for every item.</span> Fully assign any quantities.</>:error}</Notice>}
 <div className="bottom-actions"><div className="bottom-actions-inner"><Button variant="outline" onClick={()=>s.goTo("people")}>Back to friends</Button><Button onClick={proceed}>See the split <ArrowRight aria-hidden="true"/></Button></div></div></section>;
}
```

- [ ] **Step 2: Imports in `item-allocation-editor.tsx`**

Add at the top:
```tsx
import { Check, ChevronDown, Users } from "lucide-react";
```

- [ ] **Step 3: Replace the render (from `const selected=` to the end of the component)**

```tsx
  const selected=allocationPersonIds(item.allocation);
  return <div className="allocation-editor">
    <div className="split-method"><label htmlFor={`split-${item.id}`}>Split method</label><span className="select-wrap"><select id={`split-${item.id}`} value={edit.mode} onChange={e=>mode(e.target.value as ItemAllocation["mode"])}><option value="equal">Equal</option><option value="ratio">Ratio</option><option value="quantity">Quantity</option></select><ChevronDown aria-hidden="true"/></span></div>
    {edit.mode==="equal"?<>
      <div className="chip-list">{people.map((p,i)=><button key={p.id} type="button" className={`chip ${personColor(i)}`} aria-pressed={selected.includes(p.id)} onClick={()=>s.togglePerson(item.id,p.id)}>{selected.includes(p.id)?<Check aria-hidden="true"/>:<span className="chip-dot" aria-hidden="true"/>}{p.name}</button>)}<button type="button" className="chip chip-everyone" onClick={()=>s.assignEveryone(item.id)}><Users aria-hidden="true"/>Everyone</button></div>
      {!selected.length&&<p className="assign-hint">Choose at least one friend</p>}
    </>:<>
      {edit.mode==="quantity"&&<div className="quantity-heading"><label className="share-field"><span className="field-label">Total units</span><Input inputMode="numeric" value={edit.totalUnits} onChange={e=>change({totalUnits:e.target.value})}/></label><label className="share-field"><span className="field-label">Unit label</span><Input value={edit.unitLabel} onChange={e=>change({unitLabel:e.target.value})}/></label></div>}
      <p className="muted">{edit.mode==="quantity"?"Set the number of pieces or servings to share. Receipt quantity does not set this automatically.":"Use relative whole-number weights. 2:1 means twice the share."}</p>
      <div className="share-inputs">{people.map(p=><label key={p.id} className="share-field"><span className="field-label">{p.name}</span><Input aria-label={`${edit.mode==="quantity"?"Units":"Weight"} for ${p.name}`} inputMode="numeric" value={edit.entries.find(e=>e.personId===p.id)?.value??"0"} onChange={e=>change({entries:people.map(person=>({personId:person.id,value:person.id===p.id?e.target.value:edit.entries.find(entry=>entry.personId===person.id)?.value??"0"}))})}/></label>)}</div>
      {message&&<p className="field-error" role="status">{message}</p>}
      {pending&&<p className="muted">Apply the pending shares before viewing the result.</p>}
      <Button variant="outline" disabled={!allocation || !pending} onClick={()=>allocation&&s.applyAllocation(item.id,allocation)}>Apply shares</Button>
      <p className="fine-print">Switching to Equal resets this item&apos;s custom shares.</p>
    </>}
    {!!preview.length&&<ul className="item-share-preview" aria-label={`Shares for ${item.name}`}>{preview.map(part=><li key={part.personId}>{people.find(p=>p.id===part.personId)?.name}: {part.units}/{part.weightSum}{edit.mode==="quantity"?` ${edit.unitLabel||"pieces"}`:""} · {formatMoney(part.cents)}</li>)}</ul>}
  </div>;
}
```
(The temporary `personColor(people.findIndex(...))` from Task 9 is replaced by the map index here.)

- [ ] **Step 4: Check and test**

Run: `npx tsc --noEmit && npm run lint && npx playwright test tests/e2e/weighted-split.spec.ts tests/e2e/bill-flow.spec.ts --project=chromium`
Expected: no errors; both pass (`Split method` label, `Units for …`, exact preview text, keyboard `Everyone`).

- [ ] **Step 5: Commit**

```bash
git add src/components/split
git commit -m "feat: person chips, inline Everyone, aligned share inputs"
```

---

### Task 11: Result step, docs and full verification

**Files:**
- Modify: `src/components/result/result-step.tsx` (whole file)
- Modify: `src/ARCHITECTURE.md`
- Create: `docs/validation/2026-10-11-ui-visual-alignment.md`

- [ ] **Step 1: Replace `src/components/result/result-step.tsx`**

```tsx
import { useState } from "react";
import { Copy, Check, ChevronDown, Utensils } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { useBillStore } from "@/store/useBillStore";
import { explainSplitBill } from "@/lib/split";
import { formatMoney } from "@/lib/money";
import { formatShareText } from "@/lib/share";
import { personColor, personInitial } from "../people/person-style";
import { PersonBreakdown } from "./person-breakdown";
import { ShareComposition } from "./share-composition";
export function ResultStep({ onReset }: { onReset: () => void }) {
  const s = useBillStore(); const breakdown = explainSplitBill(s.bill); const result = breakdown.result; const text = formatShareText(result); const [copy, setCopy] = useState<"idle" | "copied" | "fallback">("idle");
  const maxTotalCents = Math.max(...result.people.map(person => person.totalCents));
  async function share() { try { await navigator.clipboard.writeText(text); setCopy("copied"); } catch { setCopy("fallback"); } }
  // result.people follows bill.people order, so the index matches the friend's color everywhere else.
  return <section><div className="step-heading result-heading"><div className="eyebrow-row"><span className="result-icon" aria-hidden="true"><Utensils/></span><p className="eyebrow">GOOD TIMES. EVEN SPLITS.</p></div><h1>All split!</h1><p>Here’s everyone’s share of the good stuff.</p></div>
    <div className="result-shares">{result.people.map((p, i) => <details className={`paper person-result ${personColor(i)}`} key={p.id} data-testid={`share-${p.name}`}><summary><span className="result-summary"><span className="result-summary-heading"><span className="avatar" aria-hidden="true">{personInitial(p.name)}</span><span className="person-result-name">{p.name}<small>View breakdown<ChevronDown className="disclosure-icon" aria-hidden="true"/></small></span><b>{formatMoney(p.totalCents)}</b></span><ShareComposition share={p} maxTotalCents={maxTotalCents}/></span></summary><PersonBreakdown personId={p.id} breakdown={breakdown} people={s.bill.people}/></details>)}</div>
    <div className="paper result-total"><div className="result-line totals-line"><span>Items subtotal</span><span className="money">{formatMoney(result.subtotalCents)}</span></div><div className="result-line totals-line"><span>Tax</span><span className="money">{formatMoney(result.taxCents)}</span></div><div className="result-line totals-line"><span>Tip</span><span className="money">{formatMoney(result.tipCents)}</span></div><div className="result-line totals-line grand-total" data-testid="bill-total"><span>Bill total</span><b className="money">{formatMoney(result.totalCents)}</b></div><p className="allocation-difference">Allocation difference {formatMoney(result.totalCents - result.people.reduce((sum, person) => sum + person.totalCents, 0))}</p><p className="fine-print">Every cent accounted for. No payments processed.</p></div>
    {copy === "fallback" && <Notice tone="info"><p>Copy was unavailable. Select and copy your summary below.</p><textarea aria-label="Summary to copy" readOnly value={text} onFocus={e => e.target.select()} rows={10}/></Notice>}
    <div role="status" className="copy-status">{copy === "copied" && <Notice tone="success">Copied! Ready to share with your friends.</Notice>}</div>
    <Button variant="ghost" onClick={onReset} className="new-bill">Start a new bill</Button>
    <div className="bottom-actions"><div className="bottom-actions-inner"><Button variant="outline" onClick={() => s.goTo("split")}>Edit assignments</Button><Button onClick={share}>{copy === "copied" ? <Check aria-hidden="true"/> : <Copy aria-hidden="true"/>} Copy summary</Button></div></div>
  </section>;
}
```

- [ ] **Step 2: Check and test the result page**

Run: `npx tsc --noEmit && npm run lint && npx playwright test tests/e2e/result-explanation.spec.ts tests/e2e/visual-alignment.spec.ts --project=chromium`
Expected: no errors; all result-explanation tests and all 5 visual-alignment tests PASS.

- [ ] **Step 3: Update `src/ARCHITECTURE.md`**

In the directory map, replace the `people/` and `ui/` lines with:
```text
  people/             Step 3. person-style.ts = personColor(index) by bill.people order, personInitial(name).
  ...
  ui/                 shadcn/ui primitives (button, input, ...) plus notice.tsx (Notice with info/warning/error/success tones). Generic; no business logic.
```
Add this row to the "Where to change things" table:
```text
| Colors, type, spacing, a component's look | `app/globals.css` `:root` tokens and `@layer components`; read "Styling" first |
```
Insert this section before `## Tests`:
```markdown
## Styling

Spec: [UI visual alignment design](../docs/superpowers/specs/2026-10-11-checkmates-ui-visual-alignment-design.md).

- Tokens live only in `:root` in `app/globals.css`: colors, six person colors, font sizes (`--fs-*`), radii (`--r-*`), shadows, layout widths. Add a token instead of a literal. `app/globals.test.ts` fails on color literals outside `:root`, font sizes under 12px, unlayered rules and `[data-slot` selectors.
- Order: `@layer base` (element defaults, the single focus outline) → `@layer components` (semantic classes: `.paper`, `.notice`, `.chip`, `.money-grid`, `.bottom-actions`, `.disclosure`, ...) → Tailwind utilities. Unlayered CSS would beat every utility; do not write it.
- shadcn primitives in `components/ui/` own their look through cva. Pages adjust them with `variant`, `size` or utility `className` (merged by `cn`), never with descendant selectors.
- Tailwind font sizes and radii keep default names (`text-xs/sm/base/lg`, `rounded-md/lg`) with our values; `cn` is tailwind-merge compatible and would read an unknown `text-*` name as a color.
- One tactile primary button per screen: the forward action in `.bottom-actions`. Touch targets are at least 44px. In `.money-grid` cards every amount has `.money` and shares one right edge.
- Person colors come from `personColor(index)` and are never the only cue; names are always visible.
- e2e hooks: `.item-editor`, `.dish-translation`, `.share-composition`, `.breakdown-fee`, `.person-result`, `.receipt-editor .money`, `data-testid="share-*"` and `"bill-total"`. `tests/e2e/visual-alignment.spec.ts` checks the money column, desktop column alignment, 12px text, 44px targets, friend rows and overflow.
```

- [ ] **Step 4: Full verification**

Run each and record the result:
```bash
npm run lint
npm test
npm run build
npx playwright test --project=chromium
npx playwright test --project=webkit
```
Expected: lint clean; all unit tests pass (including the 4 guard tests and 3 person-style tests); build succeeds; every Chromium spec passes (private real-photo specs skip without `PRIVATE_RECEIPTS_DIR`); the WebKit OCR specs pass. Any failure: diagnose with superpowers:systematic-debugging before changing code.

- [ ] **Step 5: After screenshots and live check**

Copy the new PNGs from `test-results` to `$SCRATCH/ui-after/` the same way as Task 1 Step 1. Then start the production server with the Browser pane (`preview_start` name `checkmates-prod`). At 375×812 and 1280×800, walk the sample bill through all five steps, plus photo adjustment, and screenshot each. Measure in the page:
```js
const r = s => [...document.querySelectorAll(s)].map(e => Math.round(e.getBoundingClientRect().right));
({ money: r(".receipt-editor .money"), brandLeft: document.querySelector(".brand").getBoundingClientRect().left, mainLeft: document.querySelector("main").getBoundingClientRect().left })
```

- [ ] **Step 6: Write `docs/validation/2026-10-11-ui-visual-alignment.md`**

Structure (fill every cell from Steps 4–5 and the Task 1 failures; no cell may stay empty):
```markdown
# UI visual alignment validation (2026-10-11)

Branch `feat/ui-visual-alignment`. Spec: [design](../superpowers/specs/2026-10-11-checkmates-ui-visual-alignment-design.md). Local verification only; not pushed, no PR, not deployed. Desktop Chromium plus Playwright WebKit; no real phone.

## Problems P1–P11

| # | Before (2026-10-11, main@9d4a0a9) | After | Evidence |
| --- | --- | --- | --- |
| P1 | price inputs right edge 304px, tax/tip/totals 338px at 375px | <measured spread> | visual-alignment "receipt amounts" |
...one row per P2–P11...

## Counts

| | Before | After |
| --- | --- | --- |
| Distinct color literals outside :root | 86 | 0 (guard test) |
| Font sizes | 13 | 7 steps + brand |
| Radii | 11 | 3 + full |

## Commands

<the five commands of Step 4 with pass/fail counts>
```
Count the "After" color literals with the guard test and the font sizes and radii with:
```bash
grep -oE "var\(--fs-[a-z]+\)" src/app/globals.css | sort -u | wc -l
grep -oE "border-radius: [^;]+" src/app/globals.css | sort -u
```

- [ ] **Step 7: Commit**

```bash
git add src/components/result/result-step.tsx src/ARCHITECTURE.md docs/validation/2026-10-11-ui-visual-alignment.md
git commit -m "feat: result page alignment, styling docs and validation record"
```
Do not push and do not open a PR (user instruction).
