# V4 cloud LLM recognition record

Date: 2026-10-22. Branch `claude/v4-recipe-api-keys-dc6b48` (not deployed yet). Engine: Alibaba Cloud DashScope `qwen3.5-plus`, called directly from the browser. Measurements were taken on a Windows development machine, not on a physical phone. No key appears in this record.

## Endpoint, region and model

| Item | Result |
| --- | --- |
| CORS | An `OPTIONS` preflight to `https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions` returned `access-control-allow-origin: *` and allowed headers `authorization, content-type`. The international endpoint echoed the origin instead. |
| Key region | The user's key works only on China (Beijing). The international endpoint returns `invalid_api_key`. |
| Model | `qwen3.5-plus` with `enable_thinking: false`. Structured output (`json_schema`) works. |
| Cost | About 2,200 input + 560 output tokens per receipt, about US$0.0011 at the Beijing list price. |

## Exploratory probes (scratch script, same day)

| Probe | Result |
| --- | --- |
| 2.3 MB PNG | 69 s |
| 900x1600 JPEG (260 KB) | 11 s, identical results. The app therefore uploads a JPEG with long edge <= 2048 px. |
| `qwen3.5-flash` | 15 s, added "$" to amounts and invented 珍珠 for Brown Sugar Milk. Not used. |

## Live eval through the app pipeline

`LIVE_LLM=1 npx vitest run src/lib/llm/live-eval.test.ts` (reads `.env.local`, about 0.03 CNY per run). Six runs during development; the final run:

| Receipt | Result | Duration |
| --- | --- | --- |
| Line Thai Cafe (redacted real photo) | 6/6 items with exact names and prices (1390, 790, 400, 2580, 1290, 800), subtotal 7250, tax 598, total 7848 | 12.3-19.6 s |
| Clear diner (synthetic) | Exact | 5.7-7.0 s |

Final Chinese names for the Line Thai items: 菠萝炒饭, 炸豆腐(12), 奶茶, 泰式炒河粉, 打抛饭, 黑糖牛奶.

## Translation hallucination and its fix

In 3 of the 6 runs Qwen wrote 打抛猪肉饭 (pork) for "Pad Kra Pow" + "Chicken". A prompt rule alone did not hold, and a prompt example quoting the fixture's answer was rejected as overfitting. The fix is deterministic: `to-draft.ts` drops a Chinese name that adds a meat or seafood printed nowhere in the name, printed text or modifiers, and the item falls back to the local glossary/model translation. The final run produced 打抛饭.

## Tests

| Check | Result |
| --- | --- |
| `npm test` | 247 passed, 2 skipped (live eval, needs `LIVE_LLM=1`) |
| Playwright full suite (chromium + webkit) | 73 passed, 6 skipped (private-photo specs), 0 failed |
| `tests/e2e/cloud-ocr.spec.ts` | Fake key, `.invalid` base URL, mocked `/chat/completions`; asserts the fake key so a reused real-key server fails. Never spends money. |

## Limitations

- **There is only one real photo, and broad real-photo accuracy has not been verified.** The other fixture is synthetic.
- Physical-phone timing has not been measured; the timings above are from a development machine.
- No private photos were sent to any third party. Only the redacted Line Thai photo and synthetic images were uploaded to DashScope.
- The key is public in the JavaScript bundle by design (the user's decision). Anyone can read it, so cost control must be done on the Alibaba Cloud side (own key, budget alert, small balance, quota limits).
- Pending after deploy: set the Vercel variables, Alibaba Cloud cost protection, and a phone check with a real receipt, recorded here.
