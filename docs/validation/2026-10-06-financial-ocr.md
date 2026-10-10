# Financial OCR correction — 2026-10-06

The user rejected missing tax/total as inadequate. This follow-up requires actual extraction of subtotal, tax and total on the three supplied original images; reaching a review screen is not an accuracy assertion.

## Root cause and fix

Whole-page OCR omitted the low-contrast footer amounts despite visible digits. A plain enlarged grayscale crop was still inadequate. Local illumination compensation retained the digit strokes under shadows. Sparse OCR then found the financial labels and amounts separately, often returning a right-column value before its label; the generic sequential parser could associate a following row incorrectly. Financial extraction now pairs explicit labels and right-column amounts by geometry, uses each isolated amount once and leaves uncertain pairings blank.

The default scan automatically adds a lower-region financial pass when subtotal/tax/total is missing; a narrow footer pass follows only if total is still missing. These passes reuse the existing worker, shared 120-second deadline and cancellation. They update only financial fields. They neither replace dishes nor derive tax by subtracting subtotal from total, assume a tax rate, or force extracted amounts to reconcile. Original and targeted recognized text remain reviewable and persist locally; photos remain local and private.

Decimal punctuation spacing and common total-label OCR errors are normalized only in targeted financial extraction. Complete monetary tokens preserve grouping separators. Conflicting values within one scan, across financial scans or across whole-page candidates remain null with a specific warning. Missing fields cannot borrow the amount from an adjacent financial row.

## Real original-photo evidence

The new `tests/e2e/receipt-financials.spec.ts` uploads each original photo, accepts the existing default adjustment, runs the real pinned browser engine and asserts the untouched saved draft and Tax input. It does not inject OCR text, edit amounts or infer totals from the independent annotation.

| Original | Extracted subtotal | Extracted tax | Extracted total |
| --- | ---: | ---: | ---: |
| Olive Garden | $247.27 | $14.66 | $261.93 |
| Krung Thep | $87.50 | $5.25 | $92.75 |
| Chinatown Supermarket | $74.48 | $2.24 | $76.72 |

All nine fields match the independent human reference. Observed browser failures before corrections included missing totals on all three and a misplaced Thai subtotal. After the geometry and punctuation corrections, all three actual-photo cases pass, including after tightening pairing and conflict rules. Private raw evidence is saved in `.private/financial-validation/`, excluded from Git. This is evidence for these images, not a claim of general OCR accuracy. Dish recognition remains imperfect and needs review.

## Verification

- 99 unit tests pass across 19 files; lint, TypeScript and production build pass.
- Full production browser regression: 44/44 pass with private images enabled, including direct financial-amount assertions.
- Read-only review identified three additional financial edge cases. All three reproduced as failing unit regressions and now pass: adjacent-row reuse, grouped amounts, internal scan contradictions. After this tightening, the three actual-photo amount tests pass again.
- Final production OCR regression after the review fixes: 14/14 pass, including all three exact financial-amount cases, default/enhanced private scans, old real OCR, cancellation, resource failure and timeout.

Reproduce with `PRIVATE_RECEIPTS_DIR` pointing to the private image directory and `npx.cmd playwright test tests/e2e/receipt-financials.spec.ts`. Without the private images, these cases are explicitly skipped. No uploaded photo or sensitive receipt output is committed or sent to an OCR backend.
