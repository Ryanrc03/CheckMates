# Line Thai OCR accuracy repair

The original automatic extraction was reproduced using the repository's redacted Line Thai photograph. Before this repair it included payment metadata as missing-price dishes, read tax as 5.08, and failed to identify printed subtotal and total. This fixture has the same six dishes as the reported review screen; the exact unredacted upload from that screen was not accessible. The connected-browser bootstrap failed with a trusted RPC dependency restriction, so testing used isolated Playwright contexts and did not inspect or modify the user's saved bill.

## Changes

- Payment application IDs, ticket/receipt/authorization labels, and device verification are metadata.
- Financial scans preserve the price column and correct tilt using confident words in priced rows. Rotation expands the canvas so edge amounts remain visible. A tighter footer scan uses recognized content bounds when available.
- Tax percentages are rates, not monetary amounts. Tax-code detail tables cannot supply adjacent summary amounts.
- Incomplete amounts cannot acquire cent digits from distant background words. Decimal punctuation noise remains supported when the source permits it.
- A conflicting primary tax can be corrected only by two agreeing direct financial readings, a complete printed subtotal/tax/total ledger, and a matching item subtotal with no unresolved discount or tip. Otherwise conflicting fields remain blank for review. Tax is never calculated from a total difference.
- Missing item prices require two scans identifying the same item and the same printed line amount. Readable rescanned quantities retain their source text; quantities are not inferred by dividing prices.
- The older Line Thai end-to-end test no longer deletes and rebuilds dishes or enters tax manually. Strict tests also cover the original-photo path and Brown Sugar Milk quantity/unit-price evidence.

## Acceptance values

| Photograph / path | Printed subtotal | Tax | Printed total |
| --- | ---: | ---: | ---: |
| Line Thai, default correction | 72.50 | 5.98 | 78.48 |
| Line Thai, original photo | 72.50 | 5.98 | 78.48 |
| Olive Garden | 247.27 | 14.66 | 261.93 |
| Krung Thep | 87.50 | 5.25 | 92.75 |
| Chinatown Supermarket | 74.48 | 2.24 | 76.72 |

Line Thai must produce exactly six charged rows with prices 13.90, 7.90, 4.00, 25.80, 12.90, and 8.00 before any edits, then split 78.48 equally into two shares of 39.24. Photos and raw OCR artifacts remain ignored private files.

## Verification

107 unit tests pass; lint and the production build, including TypeScript checking, pass. The final production browser suite passes all 17 cases in 55.3 seconds. It covers automatic Line Thai accuracy, the three private photographs, complete splits, blank/invalid/blurred photos, worker cancellation, failure/timeout recovery, cold/warm loads, and resetting bills.

One read-only review identified distant digit concatenation and clipped rotation bounds. Both were repaired before final verification. A regression during development also exposed tax-table pairing and a degraded Olive Garden footer; both were fixed and the original acceptance values retained.

These four photographs are regression cases, not a general accuracy benchmark. OCR still requires photo review; unreadable text, contradictory amounts, discounts, and service charges remain subject to explicit correction. Saved drafts are not retroactively recognized: reload the updated app and recognize the photo again, or reset the bill and upload it again.
