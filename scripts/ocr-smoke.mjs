import { createWorker } from "tesseract.js";
import { resolve } from "node:path";
import { writeFile } from "node:fs/promises";
const worker = await createWorker("eng", 1, { langPath: resolve("public/ocr"), cacheMethod: "none" });
try {
  if (process.argv[3]) await worker.setParameters({ tessedit_pageseg_mode: process.argv[3] });
  const result = await worker.recognize(process.argv[2] ?? "tests/fixtures/receipts/line-thai-cafe-2026-09-05-redacted.png");
  console.log(result.data.text);
  await writeFile(".superpowers/sdd/2026-09-26-bitesplit/ocr-smoke.txt", result.data.text);
} finally { await worker.terminate(); }
