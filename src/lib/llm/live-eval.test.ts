import { existsSync, readFileSync } from "node:fs";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { parseCloudConfig } from "./config";
import { requestReceipt } from "./qwen-client";
import { createCloudRecognizer } from "./recognize";
const env: Record<string, string> = existsSync(".env.local") ? Object.fromEntries(readFileSync(".env.local", "utf8").split(/\r?\n/).filter(l => /^[A-Z_]+=/.test(l)).map(l => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)])) : {};
const config = parseCloudConfig({ apiKey: env.NEXT_PUBLIC_DASHSCOPE_API_KEY, baseUrl: env.NEXT_PUBLIC_DASHSCOPE_BASE_URL, model: env.NEXT_PUBLIC_DASHSCOPE_MODEL });
const prepare = async (image: Blob) => `data:image/jpeg;base64,${(await sharp(Buffer.from(await image.arrayBuffer())).resize({ width: 2048, height: 2048, fit: "inside", withoutEnlargement: true }).flatten({ background: "#ffffff" }).jpeg({ quality: 85 }).toBuffer()).toString("base64")}`;
const read = (file: string) => createCloudRecognizer({ config, prepare, request: requestReceipt })(new Blob([readFileSync(`tests/fixtures/receipts/${file}`)]), { signal: new AbortController().signal, onProgress: () => {} });
describe.skipIf(!process.env.LIVE_LLM || !config)("live Qwen receipt accuracy (LIVE_LLM=1 spends API credit)", () => {
  it("reads every Line Thai Cafe item, amount and total, without invented ingredients", async () => {
    const expected = JSON.parse(readFileSync("tests/fixtures/receipts/line-thai-cafe-2026-09-05.expected.json", "utf8")) as { items: { name: string; priceCents: number }[]; subtotalCents: number; taxCents: number; totalCents: number };
    const { draft, translations } = await read("line-thai-cafe-2026-09-05-redacted.png");
    console.log(JSON.stringify({ items: draft.items.map(i => [i.name, i.priceCents]), translations, warnings: draft.warnings }));
    expect(draft.items.map(i => i.priceCents)).toEqual(expected.items.map(i => i.priceCents)); expect(draft.items.map(i => i.name)).toEqual(expected.items.map(i => i.name));
    expect([draft.printedSubtotalCents, draft.taxCents, draft.printedTotalCents]).toEqual([expected.subtotalCents, expected.taxCents, expected.totalCents]);
    expect(translations.find(t => t.name === "Pad Kra Pow")?.text).not.toMatch(/猪/); expect(translations.find(t => t.name === "Brown Sugar Milk")?.text).not.toMatch(/珍珠/);
  }, 120000);
  it("reads the synthetic diner receipt exactly", async () => {
    const expected = JSON.parse(readFileSync("tests/fixtures/receipts/clear-diner.expected.json", "utf8")) as { items: { name: string; priceCents: number }[]; taxCents: number; totalCents: number };
    const { draft } = await read("clear-diner.png");
    expect(draft.items.map(i => [i.name, i.priceCents])).toEqual(expected.items.map(i => [i.name, i.priceCents])); expect([draft.taxCents, draft.printedTotalCents]).toEqual([expected.taxCents, expected.totalCents]);
  }, 120000);
});
