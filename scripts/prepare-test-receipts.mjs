// Synthetic engine fixtures; these are not photographs or real-photo validation.
import sharp from "sharp";
import { writeFile } from "node:fs/promises";
const fixtures = [
  { id: "clear-diner", lines: ["WEEKEND DINER", "", "Burger              14.95", "Fries                5.95", "Lemonade             3.50", "", "Subtotal            24.40", "Tax                  2.01", "Total               26.41"], items: [{ name: "Burger", priceCents: 1495 }, { name: "Fries", priceCents: 595 }, { name: "Lemonade", priceCents: 350 }], taxCents: 201, totalCents: 2641 },
  { id: "clear-cafe", lines: ["SUNDAY CAFE", "", "Soup                 8.25", "Toast                4.50", "Coffee               3.75", "", "Subtotal            16.50", "Tax                  1.32", "Gratuity             2.00", "Total               19.82", "", "Suggested tip", "18%                  2.97", "20%                  3.30"], items: [{ name: "Soup", priceCents: 825 }, { name: "Toast", priceCents: 450 }, { name: "Coffee", priceCents: 375 }], taxCents: 132, totalCents: 1982 },
];
for (const fixture of fixtures) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1100"><rect width="1000" height="1100" fill="white"/>${fixture.lines.map((line, i) => `<text x="90" y="${100 + i * 62}" font-family="monospace" font-size="42" fill="black" xml:space="preserve">${line}</text>`).join("")}</svg>`;
  await sharp(Buffer.from(svg)).png().toFile(`tests/fixtures/receipts/${fixture.id}.png`);
  await writeFile(`tests/fixtures/receipts/${fixture.id}.expected.json`, JSON.stringify({ ...fixture, imageKind: "synthetic", source: "Project-owned typeset test fixture", license: "CC0-1.0", annotationKind: "manual-ground-truth" }, null, 2) + "\n");
}
await sharp({ create: { width: 800, height: 800, channels: 3, background: "white" } }).png().toFile("tests/fixtures/receipts/blank.png");
await sharp("tests/fixtures/receipts/clear-diner.png").blur(22).png().toFile("tests/fixtures/receipts/blurred.png");
console.log("Created two synthetic receipts, blank and blurred engine fixtures.");
