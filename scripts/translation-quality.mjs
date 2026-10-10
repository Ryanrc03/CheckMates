// Quality record for the shipped translation pipeline (glossary + rules + on-device model), run against a production
// server: node scripts/translation-quality.mjs --base http://127.0.0.1:3200
// Writes docs/validation/v3-translation-quality.md. Desktop Chromium only; numbers are not phone numbers.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { chromium } from "playwright";
const base = process.argv[process.argv.indexOf("--base") + 1] || "http://127.0.0.1:3200";
const holdout = JSON.parse(await readFile("tests/fixtures/translations/en-zh-holdout.json", "utf8"));
let probe = [];
try { probe = JSON.parse(await readFile(".private/translation-probe-20261008/cases.json", "utf8")).map(c => ({ input: c.input, accept: c.accept, category: c.category })); } catch { /* optional local set */ }
const sets = [["holdout (20, not in glossary)", holdout], ["probe (50, local)", probe]].filter(([, s]) => s.length);
const browser = await chromium.launch(); const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
await page.goto(base + "/"); await page.getByRole("button", { name: "Try a sample bill" }).click();
await page.getByRole("switch", { name: "Show Chinese names" }).check();
await page.getByLabel("Item 1 name").fill("Grilled Octopus"); await page.getByRole("button", { name: "Download and translate" }).click();
const label = page.locator(".item-editor").first().locator(".dish-translation");
await label.filter({ hasText: /[㐀-鿿]/ }).waitFor({ timeout: 240000 });
const rows = []; const failures = [];
for (const [name, set] of sets) for (const c of set) {
  await page.getByLabel("Item 1 name").fill(c.input);
  await page.waitForTimeout(500); // the store debounces requests by 300 ms
  await page.waitForFunction(() => { const el = document.querySelector(".item-editor .dish-translation"); return el && el.textContent !== "Translating…"; }, null, { timeout: 60000 }).catch(() => {});
  const output = (await label.textContent().catch(() => "")) || ""; const provider = await label.getAttribute("data-provider").catch(() => null);
  const accepted = c.accept.includes(output);
  if (/^(no|w\/o|without)\s/i.test(c.input) && !output.startsWith("不要")) failures.push(`${c.input} -> ${output} (negation not preserved)`);
  for (const token of c.input.match(/\(\d+\)|\d+%|\d+x/gi) ?? []) if (!output.includes(token)) failures.push(`${c.input} -> ${output} (token ${token} lost)`);
  rows.push({ set: name, input: c.input, output, provider: provider ?? "none", accepted });
}
await browser.close();
const totals = sets.map(([name]) => { const r = rows.filter(x => x.set === name); const by = p => r.filter(x => x.provider === p).length; return `| ${name} | ${r.length} | ${r.filter(x => x.accepted).length} | ${by("glossary")} | ${by("rule")} | ${by("model")} | ${by("none")} |`; });
const md = `# V3 translation quality record\n\nDate: ${new Date().toISOString().slice(0, 10)}. Production build, desktop headless Chromium (Playwright), 375px viewport. Pipeline: glossary → rules → Firefox Translations en→zh-Hans v2.2 (bergamot v0.6.0). **Desktop verification only; not phone numbers.** "accepted" = exact match against the accept list; outputs that read correctly but differ in wording count as not accepted.\n\n| set | phrases | accepted | glossary | rule | model | untranslated |\n| --- | --- | --- | --- | --- | --- | --- |\n${totals.join("\n")}\n\nDeterministic checks (negation prefix kept, quantity/percent tokens kept): ${failures.length ? `**${failures.length} failed**\n- ${failures.join("\n- ")}` : "all passed"}\n\n| set | input | output | provider | accepted |\n| --- | --- | --- | --- | --- |\n${rows.map(r => `| ${r.set.split(" ")[0]} | ${r.input} | ${r.output} | ${r.provider} | ${r.accepted ? "yes" : "no"} |`).join("\n")}\n`;
await mkdir("docs/validation", { recursive: true }); await writeFile("docs/validation/v3-translation-quality.md", md);
console.log(totals.join("\n")); if (failures.length) { console.error(failures.join("\n")); process.exit(1); }
