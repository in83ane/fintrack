# Dashboard net worth — drawing refinement (round 14)

## Scope

Only chart drawing, axis/date/percentage presentation, and the reported unavailable Max DD display were changed. `getNetWorthSeries`, scope/range selection, financial formulas, financial storage, tooltip content/placement, four action buttons, shell, transition and skeleton remain unchanged in this round. No design/frontend skills were loaded.

## Max DD — findings reported before changing the display

- **(ก) Formula:** `calcMaxDrawdown` tracks a running peak and returns the maximum `(peak - value) / peak × 100`. The Dashboard previously formatted its negative with one decimal.
- **(ข) Source:** `netWorthHistory.map(h => h.value)` includes assets, broker cash and buckets. Income, spending, deposits and withdrawals therefore affect it. This is balance drawdown, not flow-adjusted investment drawdown.
- **(ค) -10.0%:** neither a 10% clamp nor a 10% default exists. Initialization is zero; the displayed number is the calculated series drawdown rounded to one decimal. The screenshot alone does not identify the actual peak/trough records; no signed-in account records were fetched in this task.
- No existing unitized/TWR investment history was found. Following the user's explicit unavailable-data rule, Dashboard now displays **—** for Max DD, including investment scopes whose investment drawdown cannot be calculated correctly. The shared `calcMaxDrawdown` formula is unchanged; no new return formula was introduced. This display change was explained in commentary before implementation.

## Drawing

- Fritsch–Carlson limited monotone cubic interpolation through observed daily values. Adjacent plateaus remain flat; no interpolation overshoot. No synthetic values or zero starting point.
- 1.75px stroke with round joins/caps and the existing area gradient.
- One clip-path group reveals the line and area together. First reveal 1,200ms; range change 500ms. The head uses CSS `offset-path` constructed from the same SVG `d`, with distance synchronized to the reveal's X position. The chart owns this animation so the app-wide observer does not add a second head or replay an outgoing curve. The shared chart animation file was not edited.
- Reduced motion renders the final line/area/head immediately, including changing the preference while the page is open.
- Tooltip placement and content remain unchanged. Its snapped marker is checked against the actual smooth SVG path.
- Display-currency bounds use 7% padding and 4–6 nice ticks. Positive data does not get a negative lower bound; flat values use ±1%, and all-zero data uses 0–1 with the zero label.
- Intl date parts use the Ledger locale convention and Bangkok timezone. EN uses the locale-generated `Sep`; TH uses Thai months and Buddhist years. Multi-year labels include the year on the first displayed label of each year. Labels reduce in number rather than shrink when space is limited.
- Cash-only change percentage is muted; arrow and amount retain sign color. Investment scopes retain the previous styling. ALL's displayed label becomes `since <first day>` / `ตั้งแต่ <first day>`, adding year when different from the current endpoint year. Other period buttons/labels remain 7D / 30D / 90D / 1Y. Display percentages cap above 999%; negative rounded zero displays 0.0%.

## Verification

- **21 net-worth unit tests + 9 Ledger/cashflow regression tests passed.** Includes monotone endpoint/overshoot/plateau assertions, positive/negative/narrow/flat/zero tick ranges, consistent tick decimals, date/year labels, percentage extremes and the original daily-value invariants.
- **40 browser cases / 619 tooltip measurements passed:** 1905 / 1440 / 1280 / 768px, dark/light, stock/bucket/mixed/empty/one-day, five periods. Tooltip stays inside the card, does not intersect its marker, and snapped markers stay on the rendered path within 0.2px. X-label bounding boxes retain at least ~48px spacing. No range-change skeleton; chart Y changes by less than 1px.
- **Animation:** 500ms range reveal verified frame-by-frame; head position differs from the SVG path by less than 0.18px. One head only with the global chart observer installed. Line and fill share one clipping animation. Reduced-motion state has no reveal animation and head offset-distance = 100%.
- TypeScript and production build passed. Existing unrelated lint/SSR chart warnings remain in `output/net-worth-round14/build.log`.
- Before/after screenshots: 5 periods × 2 themes × 2 languages = **20 before + 20 after**.

### Values retained

Controlled fixtures, not a dump of the user's live records:

| Period/example | First | Last | Change |
|---|---:|---:|---:|
| ALL, 2 Aug–26 Oct 2026 | ฿11,933.45 | ฿26,480.33 | +฿14,546.88 (+121.9%) |
| 30D | ฿23,331.83 | ฿26,480.33 | +฿3,148.50 (+13.5%) |
| 15 Oct tooltip versus 30D opening | ฿23,331.83 | ฿27,794.52 | +฿4,462.69 (+19.1%) |

The fixture's intermediate transactions are illustrative; screenshots do not claim to reproduce every transaction in image A. Before and after use the identical fixture source and production Dashboard component. The surrounding fixture rail/topbar are placeholders, not modifications to the app shell.

### Height coverage and exceptions

| Currency | 7D | 30D | 90D | 1Y | ALL |
|---|---:|---:|---:|---:|---:|
| THB | 65.7% | 59.5% | 79.3% | 79.3% | 79.3% |
| USD (same current FX throughout) | 77.9% | 66.1% | 62.7% | 62.7% | 62.7% |

ALL in THB now has **10k / 15k / 20k / 25k / 30k**, versus the earlier 10k / 20k / 30k / 40k. For the supplied axis example 11,933–27,900, coverage is 79.8%.

Not every period can reach 70–85% while preserving padded coverage, allowed nice steps and a 4–6 tick limit. For THB 30D, a 1k step needs 7 ticks (23k–29k), so the smallest admissible covering range is 22.5k–30k at a 2.5k step: 59.5%. THB 7D's 500 step gives 26k–28k: 65.7%. USD 30D requires 650–850 at 50 increments; USD ALL requires 250–1,000 at 250 increments. More granular allowed steps would exceed 6 ticks. These exceptions are reported rather than hidden by clipping values. A perfectly flat/zero series necessarily has zero data-height coverage.

## Files in this round

- `src/components/NetWorthSparkline.tsx` — monotone drawing, nice ticks/date labels, owned reveal wiring; unchanged tooltip content and placement.
- `src/hooks/useNetWorthReveal.ts` — synchronized clip/head animation and reduced-motion handling.
- `src/components/net-worth-chart.css` — head offset-path presentation only.
- `src/lib/net-worth-chart.ts` — display ticks, dates, percentages, period labels and monotone path helper.
- `src/app/(app)/dashboard/DashboardView.tsx` — cash percentage tone, ALL label, unavailable Max DD display.
- `src/lib/net-worth-series.test.mjs` — tests (valuation implementation not edited).
- `scripts/net-worth-round14-fixture.tsx`, `scripts/net-worth-round14-qa.mjs`, `scripts/net-worth-round14-motion-qa.mjs`, `scripts/net-worth-round14-screenshots.mjs` — reproducible browser fixtures/checks.

Evidence: `output/net-worth-round14/geometry/results.json`, `motion/results.json`, `motion/frames.json`, `before/results.json`, `after/results.json`, `build.log`.

## Before / after screenshots

| Theme / language / range | Before | After |
|---|---|---|
| dark / EN / 7D | [ก่อน](C:/Users/Re4l/Desktop/Project/fintrack/output/net-worth-round14/before/dark-en-7D.png) | [หลัง](C:/Users/Re4l/Desktop/Project/fintrack/output/net-worth-round14/after/dark-en-7D.png) |
| dark / EN / 30D | [ก่อน](C:/Users/Re4l/Desktop/Project/fintrack/output/net-worth-round14/before/dark-en-30D.png) | [หลัง](C:/Users/Re4l/Desktop/Project/fintrack/output/net-worth-round14/after/dark-en-30D.png) |
| dark / EN / 90D | [ก่อน](C:/Users/Re4l/Desktop/Project/fintrack/output/net-worth-round14/before/dark-en-90D.png) | [หลัง](C:/Users/Re4l/Desktop/Project/fintrack/output/net-worth-round14/after/dark-en-90D.png) |
| dark / EN / 1Y | [ก่อน](C:/Users/Re4l/Desktop/Project/fintrack/output/net-worth-round14/before/dark-en-1Y.png) | [หลัง](C:/Users/Re4l/Desktop/Project/fintrack/output/net-worth-round14/after/dark-en-1Y.png) |
| dark / EN / ALL | [ก่อน](C:/Users/Re4l/Desktop/Project/fintrack/output/net-worth-round14/before/dark-en-ALL.png) | [หลัง](C:/Users/Re4l/Desktop/Project/fintrack/output/net-worth-round14/after/dark-en-ALL.png) |
| dark / TH / 7D | [ก่อน](C:/Users/Re4l/Desktop/Project/fintrack/output/net-worth-round14/before/dark-th-7D.png) | [หลัง](C:/Users/Re4l/Desktop/Project/fintrack/output/net-worth-round14/after/dark-th-7D.png) |
| dark / TH / 30D | [ก่อน](C:/Users/Re4l/Desktop/Project/fintrack/output/net-worth-round14/before/dark-th-30D.png) | [หลัง](C:/Users/Re4l/Desktop/Project/fintrack/output/net-worth-round14/after/dark-th-30D.png) |
| dark / TH / 90D | [ก่อน](C:/Users/Re4l/Desktop/Project/fintrack/output/net-worth-round14/before/dark-th-90D.png) | [หลัง](C:/Users/Re4l/Desktop/Project/fintrack/output/net-worth-round14/after/dark-th-90D.png) |
| dark / TH / 1Y | [ก่อน](C:/Users/Re4l/Desktop/Project/fintrack/output/net-worth-round14/before/dark-th-1Y.png) | [หลัง](C:/Users/Re4l/Desktop/Project/fintrack/output/net-worth-round14/after/dark-th-1Y.png) |
| dark / TH / ALL | [ก่อน](C:/Users/Re4l/Desktop/Project/fintrack/output/net-worth-round14/before/dark-th-ALL.png) | [หลัง](C:/Users/Re4l/Desktop/Project/fintrack/output/net-worth-round14/after/dark-th-ALL.png) |
| light / EN / 7D | [ก่อน](C:/Users/Re4l/Desktop/Project/fintrack/output/net-worth-round14/before/light-en-7D.png) | [หลัง](C:/Users/Re4l/Desktop/Project/fintrack/output/net-worth-round14/after/light-en-7D.png) |
| light / EN / 30D | [ก่อน](C:/Users/Re4l/Desktop/Project/fintrack/output/net-worth-round14/before/light-en-30D.png) | [หลัง](C:/Users/Re4l/Desktop/Project/fintrack/output/net-worth-round14/after/light-en-30D.png) |
| light / EN / 90D | [ก่อน](C:/Users/Re4l/Desktop/Project/fintrack/output/net-worth-round14/before/light-en-90D.png) | [หลัง](C:/Users/Re4l/Desktop/Project/fintrack/output/net-worth-round14/after/light-en-90D.png) |
| light / EN / 1Y | [ก่อน](C:/Users/Re4l/Desktop/Project/fintrack/output/net-worth-round14/before/light-en-1Y.png) | [หลัง](C:/Users/Re4l/Desktop/Project/fintrack/output/net-worth-round14/after/light-en-1Y.png) |
| light / EN / ALL | [ก่อน](C:/Users/Re4l/Desktop/Project/fintrack/output/net-worth-round14/before/light-en-ALL.png) | [หลัง](C:/Users/Re4l/Desktop/Project/fintrack/output/net-worth-round14/after/light-en-ALL.png) |
| light / TH / 7D | [ก่อน](C:/Users/Re4l/Desktop/Project/fintrack/output/net-worth-round14/before/light-th-7D.png) | [หลัง](C:/Users/Re4l/Desktop/Project/fintrack/output/net-worth-round14/after/light-th-7D.png) |
| light / TH / 30D | [ก่อน](C:/Users/Re4l/Desktop/Project/fintrack/output/net-worth-round14/before/light-th-30D.png) | [หลัง](C:/Users/Re4l/Desktop/Project/fintrack/output/net-worth-round14/after/light-th-30D.png) |
| light / TH / 90D | [ก่อน](C:/Users/Re4l/Desktop/Project/fintrack/output/net-worth-round14/before/light-th-90D.png) | [หลัง](C:/Users/Re4l/Desktop/Project/fintrack/output/net-worth-round14/after/light-th-90D.png) |
| light / TH / 1Y | [ก่อน](C:/Users/Re4l/Desktop/Project/fintrack/output/net-worth-round14/before/light-th-1Y.png) | [หลัง](C:/Users/Re4l/Desktop/Project/fintrack/output/net-worth-round14/after/light-th-1Y.png) |
| light / TH / ALL | [ก่อน](C:/Users/Re4l/Desktop/Project/fintrack/output/net-worth-round14/before/light-th-ALL.png) | [หลัง](C:/Users/Re4l/Desktop/Project/fintrack/output/net-worth-round14/after/light-th-ALL.png) |
