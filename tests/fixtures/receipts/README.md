# Receipt fixtures

These fixtures separate OCR engine integration from real-photo accuracy.

| Fixture | Kind | Source / permission | Ground truth |
| --- | --- | --- | --- |
| `line-thai-cafe-2026-09-05-redacted.png` | Redacted real photograph | User supplied; authorized publication after masking transaction identifiers | Six line totals 1390, 790, 400, 2580, 1290, 800 cents; subtotal 7250; tax 598; total 7848 |
| `clear-diner.png` | Synthetic typeset test receipt | Project-authored, CC0-1.0 | Burger/Fries/Lemonade; 2641 cents |
| `clear-cafe.png` | Synthetic typeset test receipt | Project-authored, CC0-1.0 | Soup/Toast/Coffee; charged gratuity; 1982 cents |
| `blank.png`, `blurred.png` | Synthetic failure fixtures | Project-authored, CC0-1.0 | No reliable OCR result required; manual review path required |

Synthetic receipts are reproducible with `node scripts/prepare-test-receipts.mjs` (uses sharp, provided by Next). Their expected JSON files were defined independently of OCR. They do not count as photographs.

The public fixture is a redacted derivative; its SHA-256 is recorded in `manifest.json`. The original remains only in a locally ignored `.private/` directory. The expected JSON is manual visual ground truth, not generated from engine output. The browser test records the raw extraction before corrections and the final split after explicit manual corrections. Quantity ×2, each-price lines, `(12)` portion description, modifiers, tax percentage, and payment totals are covered. The default engine recognizes all six charged prices after conservative trailing-noise parsing; the printed tax and total can be unreadable. Names/stray metadata still require correction. Shared equally, the corrected bill is $39.24 each.

Coverage limitation: only one real photo is present. An additional CC BY-SA 3.0 photograph by FASTILY was located at https://commons.wikimedia.org/wiki/File:Restaurant_Bill_1_2013-07-08.jpg, but the original download returned HTTP 429 on 2026-09-27, so it is not included or claimed as tested. Three real-photo coverage (including a complex tip area) remains incomplete. Generated fixtures are not a substitute for that evidence.
