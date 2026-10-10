# Weighted splits and complex receipt review — 2026-10-06

Implementation: branch `codex/weighted-receipts`, based on `main@8ce4d03`. Local worktree only; no deployment or remote push. Existing checkout documents are preserved.

## Delivered behavior

Each dish supports Equal, Ratio, and Quantity. A $12 dish with six pieces consumed 2/2/1/1 produces $4/$4/$2/$2. With $1.20 tax and $2.40 tip the totals are $5.20/$5.20/$2.60/$2.60. For $10.01, item shares are $3.34/$3.33/$1.67/$1.67; stable participant order determines leftover cents. BigInt largest remainders conserve every item, tax, tip and grand total. Result and copied text use the same calculation.

Quantity is a user-entered consumption total, separate from the receipt order quantity. Empty, fractional, negative, insufficient, excessive and unapplied inputs cannot produce a result. Applied allocation and pending input persist; removing a member leaves an incomplete quantity to repair. Schema v1 migrates to v2 equal allocations.

Receipt review shows order quantity, unit price, tax code, included options, discount state and source text. Charged addons remain separate. Repeated dishes stay separate. Printed row totals are never multiplied by quantity. Grocery savings already included in row amounts are not deducted again. Unknown interpretation requires an explicit choice. Unattributed and whole-bill discounts require manual correction and a separate acknowledgment; they are never automatically charged to the last dish.

OCR retains validated line/word geometry. Enhanced scan is manual, uses one additional layout candidate, shares one initialization and a 120-second deadline, and respects cancellation/stale requests. Candidate selection must retain every primary item (including missing-price dishes). Conflicting prices and discount bases remain blank until the user enters the printed amount. Alternative raw text remains available.

## Structure parsing versus image recognition

Independent human annotations of the three supplied photos are committed as redacted text/JSON fixtures. Original photos, receipt identifiers and raw OCR logs are Git-ignored in `.private/receipt-upgrade/2026-10-06/`.

| Reference | Charged rows | Subtotal cents | Tax cents | Total cents |
| --- | ---: | ---: | ---: | ---: |
| Olive Garden | 11 | 24727 | 1466 | 26193 |
| Krung Thep | 6 (9 ordered units) | 8750 | 525 | 9275 |
| Chinatown Supermarket | 15 | 7448 | 224 | 7672 |

All three text annotations parse to these exact values. Grocery $3.47 savings are included in $74.48; subtracting them again would incorrectly yield $71.01. These are **structure parsing tests**, not image OCR accuracy claims. Browser injected drafts separately verify confirmation, refresh and discount choices. The existing real Line Thai image still passes actual engine extraction, manual correction and final split.

## Actual photo measurements

Private browser measurements use real local images and the pinned real worker, save the untouched draft before edits, and require geometry and alternate text when enhanced. Baseline was measured before production changes. Current values are recorded below after final verification.

Amounts are compared as multisets against independent human references. This provides price coverage and spurious priced candidates; it does not establish name-to-price alignment, semantic precision or overall OCR accuracy. False missing-price candidates and garbled names still require removal/correction. Timing is a single desktop run, includes adjustment/loading, and is not a performance benchmark. Confidence scores are never treated as accuracy.

| Image | Scan | Candidates / priced | Matched price coverage | Priced amount matches | Subtotal / tax / total cents | ms |
| --- | --- | ---: | ---: | ---: | --- | ---: |
| olive-garden | baseline | 13 / 6 | 6/11 | 6/6 | missing / missing / missing | 2577 |
| olive-garden | upgrade | 19 / 7 | 7/11 | 7/7 | missing / missing / missing | 2520 |
| olive-garden | enhanced | 19 / 7 | 7/11 | 7/7 | missing / missing / missing | 4465 |
| olive-garden | original | 19 / 7 | 7/11 | 7/7 | missing / missing / missing | 2459 |
| krung-thep | baseline | 15 / 7 | 6/6 | 6/7 | missing / missing / missing | 4647 |
| krung-thep | upgrade | 13 / 7 | 6/6 | 6/7 | missing / missing / missing | 4562 |
| krung-thep | enhanced | 13 / 7 | 6/6 | 6/7 | missing / missing / missing | 6655 |
| krung-thep | original | 13 / 7 | 6/6 | 6/7 | missing / missing / missing | 5491 |
| chinatown-supermarket | baseline | 24 / 14 | 12/15 | 12/14 | 7448 / missing / missing | 3369 |
| chinatown-supermarket | upgrade | 16 / 13 | 12/15 | 12/13 | 7448 / missing / missing | 3408 |
| chinatown-supermarket | enhanced | 16 / 11 | 11/15 | 11/11 | 7448 / missing / missing | 6652 |
| chinatown-supermarket | original | 16 / 13 | 12/15 | 12/13 | 7448 / missing / missing | 3580 |

Automatic correction versus original-photo runs showed no consistent extraction benefit for these images. Olive loses footer totals; Thai includes background noise and a subtotal mistaken for an item; grocery has blurred digits, lost negative signs, unreadable discount rows and missing tax/total. Enhanced layout adds time and can increase uncertainty. Therefore the approved fallback is used: keep the default single scan and offer Enhanced scan manually. No contrast transform or model replacement was added without evidence of benefit. Users must inspect the photo/corners and enter missing amounts. No fabricated price or forced-total adjustment is used.

## Verification

- Unit suite: 88 passing tests across 17 files, including 54 original tests and new financial/session/parser cases.
- Lint, TypeScript and production build pass.
- Initial production browser run: 36 passed, 3 private-photo tests explicitly skipped without their environment variable.
- Private default/enhanced measurements: all three actual images pass; original-photo comparison: all three pass.
- Final production browser run (private images enabled): **41 passed with no skips**, including the three private images, actual local OCR, weighted splits, and both review fixes.
- Mobile and desktop keyboard/layout checks cover 375px and 1280px; screenshots were visually inspected.

A fresh read-only whole-branch review identified three financial edge cases: omitted missing-price items, subtotal-following coupon attribution, and disputed printed price resurrection by discount actions. All three now have observed failing regressions followed by passing fixes, including browser confirmation/refresh scenarios. No additional reviewer was spawned. Whole-bill discount allocation and per-tax-code allocation remain outside this upgrade; explicit manual correction is supported.

Reproduce with `npm.cmd test`, `npm.cmd run lint`, `npx.cmd tsc --noEmit`, `npm.cmd run build`, then `$env:E2E_PRODUCTION='1'; npm.cmd run test:e2e`. Private measurements additionally require `PRIVATE_RECEIPTS_DIR`, `RECEIPT_MEASUREMENT_PHASE=upgrade`, and `MEASURE_ENHANCED=1`. The public suite skips private tests when the images are absent.
