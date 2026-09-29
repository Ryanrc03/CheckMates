# Split explanation local verification

Date: 2026-09-29. Branch: `feat/split-explanation`. This record covers the local Result-page implementation; it is not a deployment record.

The personal amount, composition bar and expanded explanation all come from `explainSplitBill` applied to the current bill. Each item is split in integer cents; tax and tip use the existing largest-remainder rule and stable friends-list order. The new trace records the base cents and any extra cent without changing the old `splitBill` result. The bar is a visual proportion; the printed cent values are authoritative.

| Case | Expected split | Local automated coverage |
| --- | --- | --- |
| $10.01 shared item, $5.00 item for B, $1.51 tax, $3.02 tip | A $6.52, B $13.02, total $19.54; shared odd cent to A | `split-detail.test.ts`, `result-explanation.spec.ts` |
| Same bill after B's exclusive item changes to $6.00 | A $6.43, B $14.11, total $20.54 | Browser edit and reload test |
| Zero subtotal and zero fees; a friend with no items | $0.00 for both; no invalid ratio | Unit and browser zero tests |
| Remove B, repair the unassigned item | A $19.54; B removed from result | Browser assignment test |
| 375px and 1280px, keyboard expansion | No horizontal page overflow; details keyboard accessible | Browser viewport tests and screenshots |

Local checks: `npm test` passed 57/57; `npm run lint` and `npm run build` exited successfully. The production-mode Playwright run passed 35/35, followed by one added long-content test that passed 1/1. The complete production suite should be rerun after the final review so its count includes the new test.

An allocation difference of $0.00 proves that the edited bill's cents were fully distributed. It does not prove the receipt photo was read correctly; receipt review remains a separate step.
