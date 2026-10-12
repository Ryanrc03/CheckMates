# UI visual alignment validation (2026-10-11)

Branch `feat/ui-visual-alignment`, based on `main@9d4a0a9`. Spec: [design](../superpowers/specs/2026-10-11-checkmates-ui-visual-alignment-design.md). Plan: [implementation plan](../superpowers/plans/2026-10-11-checkmates-ui-visual-alignment.md).

Scope of this record: local verification only. Not pushed, no PR, not deployed. Checked on desktop Chromium (Playwright and the Claude browser pane against `next start`) and Playwright WebKit with the iPhone 14 profile; no real phone was used.

## Problems P1–P11

| # | Before (main@9d4a0a9) | After | Evidence |
| --- | --- | --- | --- |
| P1 | At 375px, item price inputs ended at 304px; tax, tip, subtotal and total at 338px (34px apart; 42px above 480px) | All 8 amounts on the sample receipt end at 286px (spread 0); the photo receipt's printed totals share the same column | `visual-alignment` "receipt amounts share one right edge"; live measurement |
| P2 | Item name/price inputs inherited the label's `#796e5c`, weight 600 | Every input is `#302b25`, weight 400, 16px | live computed style |
| P3 | Home and result headings centered, other steps left-aligned | Only the home hero is centered; result now uses the left-aligned step heading | screenshots `result-375`, `expanded-375` |
| P4 | At 1280px the brand started at 151px, content at 363px | Brand, `main` and the first bar button start at 363px; Reset bill, `main` and the last bar button end at 903px | `visual-alignment` "header, content and bottom bar"; live measurement |
| P5 | Name shown twice per friend row, numeric avatars, 4 hash-assigned colors (Alex and Christopher both mint) | One visible name, initial avatars, 6 colors in list order; rename via pencil (Enter saves, Escape cancels, focus returns to the pencil) | `visual-alignment` "friend rows…" (6 distinct backgrounds); `person-style.test.ts` |
| P6 | "Take a photo" was a 50px label with a 3px shadow, other primaries flat 44px; arrows were sometimes text `→` | All buttons come from one cva (44px, 52px CTA); every primary has the tactile shadow; forward actions use `ArrowRight` | screenshots; `src/components/ui/button.tsx` |
| P7 | 15 `.notice` uses, one yellow style | `Notice` with info / warning / error / success tones, each with an icon; roles unchanged | `src/components/ui/notice.tsx`; e2e role assertions pass |
| P8 | Photo adjustment had no step bar, no bottom bar, 10 loose controls | Step bar (step 1), "Adjust" tool grid, engine choice cards, Back + "Use this photo and recognize" in the bottom bar | `visual-alignment` "photo adjustment…"; screenshot `adjust-375` |
| P9 | Floating "Everyone", mixed select/number styles, staggered share inputs, 14px vs 10px labels | Chips with color dots and check icons, "Everyone" in the chip row, wrapped select with chevron, bottom-aligned share inputs, one 12px label style | `weighted-split` passes; screenshot `split-375` |
| P10 | 100px blank under home content; "Offline data" looked like a centered button | Bar space reserved only when a bar exists; Offline data is a left-aligned disclosure | screenshot `home-375` |
| P11 | Receipt delete buttons 28–34px wide | 44×44 icon buttons | `visual-alignment` 44px target audit; live width 44 |

## Counts

| | Before | After |
| --- | --- | --- |
| Color literals outside `:root` in `globals.css` | 86 distinct | 0 (guard test) |
| Font sizes | 13 (10–54px, px and rem mixed) | 8 tokens (`--fs-caption` 12 … `--fs-display`), none below 12px |
| Border radii | 11 | `--r-sm` 8, `--r-md` 12, `--r-lg` 16, plus 50% / 999px for round shapes |
| Unlayered CSS rules | ~150 lines | 0 (guard test) |
| Text colors failing WCAG AA (e.g. footer 3.1:1) | several | secondary text `#655b4d` ≥5.0:1 on every background |

## Found during verification

`color-mix(in oklch, <color> N%, transparent)` resolves to hue `none` in Chromium, so the bottom bar rendered pink (`oklch(0.976 0.011 none / 0.96)`). All alpha-only mixes now use `srgb`, and `globals.test.ts` forbids the oklch form. Two-color mixes (button hover) stay in oklch.

## Commands (final run, 2026-10-11)

| Command | Result |
| --- | --- |
| `npm run lint` | clean |
| `npm test` | 32 files, 205 tests passed |
| `npm run build` | succeeded |
| `npx playwright test --project=chromium` | 61 passed, 6 skipped (private real-photo specs without `PRIVATE_RECEIPTS_DIR`) |
| `npx playwright test --project=webkit` | 10 passed |
| `visual-alignment.spec.ts` under WebKit (iPhone 14, temporary config) | 5 passed |

Before/after full-page screenshots (375px and 1280px) were kept outside Git.
