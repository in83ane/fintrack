# Dashboard net worth — rounds 12–13

## Result

The cash-only chart now uses daily balances reconstructed from Ledger effects. The round 13 presentation keeps those valuation formulas: it adds component metadata, selectable date ranges, measured tooltip placement, cash steps, abbreviated axes and keyboard navigation.

No Ledger calculations, persisted financial records, auth, shell, route transitions or shared loading policy were changed in these rounds. Portfolio's existing money typography was extracted into a shared component; its hide-balance wrapper and valuation remain in Portfolio.

## Round 12: confirmed original causes

| Question | Evidence in the original implementation | Resolution |
|---|---|---|
| (ก) Synthetic history? | `AppContext.netWorthHistory` used current cash as a constant for every date. Its start date came from market history/trades, falling back to today. When fewer than two points existed, it prepended `{date:'Start',value:0}`. | Removed that synthetic point. `getNetWorthSeries(scope, range)` reconstructs daily cash and combines it with asset valuations. |
| (ข) S-shaped curve? | The Dashboard SVG used a cubic Bézier with both control X coordinates at the midpoint and control Y coordinates at the two endpoint values. With only Start/today, that made a single large S. | No synthetic zero endpoint. Round 13 uses step-after for cash-only series; the existing per-day stock curve and gradient remain. |
| (ค) Wrong tooltip position? | The displayed record/marker snapped to a data index, but the tooltip's HTML position followed the pointer. A second fixed-height clamp also failed once the tooltip grew. | Tooltip, marker and guide use the same observed date/value. Measure the actual tooltip and card, try above/side/below, then clamp to the card. The vertical guide excludes the tooltip rectangle. |
| (ง) Old percentage? | `totalProfit = unrealized + realized + dividends`; `initialCapital = currentNetWorth - totalProfit`; percentage was `totalProfit / initialCapital × 100`. It was an investment return, not cash balance change. | Period change is last minus first, divided by first only when first > 0. The previous return remains as a Return chip when assets exist. |
| (จ) Max DD / PF / -0.0%? | DD came from peak-to-trough history, but the label always prepended a minus sign. Cash-only zero DD therefore printed `-0.0%`. PF used gross positive/negative realized and unrealized asset P/L; no assets means PF = 0. | Existing metric formulas retained. Central `formatFixed` / `formatPercent` normalize rounded zero, including negative zero. |

## Daily data and parts

- End-of-day cash = current native balance minus signed effects dated after that Bangkok day.
- Signs come from `getLedgerView`. Transfer legs are included once per balance source so transfers within the selected scope cancel. `bucketActivities` mirrors are not counted twice. Broker trade settlements come from broker entries, not a second subtraction of Trade amounts.
- All components use the same current FX quote across the period. Historical execution FX does not create a chart movement.
- Asset history retains the existing normalization against the current price. Missing earlier observations use the opening position/price, with carry-forward afterward. This is a valuation reconstruction, not newly obtained historical prices.
- Each point now includes `parts: {assets, brokerCash, buckets}` in the same currency as `value`. The extra metadata does not change the total-value arithmetic. The final point reconciles to current assets + broker cash + buckets.
- `getNetWorthRange` remains available to existing consumers. Dashboard's range selection layer clips requested periods to the first relevant observation; ALL has no one-year cap. No-record scopes remain flat; a genuinely one-day history displays one dated observation rather than inventing earlier records.
- THIS MONTH continues using the same cash activity dataset and cashflow selector. A calendar-month KPI can legitimately differ from a 30-day balance change because of date boundaries, trades/market valuation, or records outside the included balance scope.

## Round 13 behavior

- 7D / 30D / 90D / 1Y / ALL; default 30D, saved under `fintrack:net-worth-period`. Short history is labelled `since …` / `ตั้งแต่ …`.
- One resolved range supplies the change label, amount, percentage, chart, axes and tooltip. Range calculations run in a worker and are cached per scope. Superseded workers terminate. After 300ms the old line dims to 0.6; no range-change skeleton. A failed/20-second calculation keeps the last usable series and reports a message.
- Period highlight moves only following a user selection, not storage restoration or resize. Line crossfade is 150ms; tooltip opacity is 100ms. Reduced motion disables these transitions.
- Maximum 400 visible observations: retain the opening, then actual closing observations for subsequent bins. Tooltip dates/parts belong to those actual observations; Day change uses the prior daily observation in the full series.
- Four nice Y ticks using steps 1/2/2.5/5 × 10ⁿ, padded bounds, no forced zero. Five short X dates where at least five dates exist. Thai full tooltip dates use the Buddhist calendar and Bangkok timezone, consistent with Ledger's Intl convention.
- Tooltip contains date, balance, day change, comparison with the opening date, and nonzero parts. Parts hide below 640px. The optional Largest line was omitted to keep the tooltip compact.
- Chart keyboard controls: arrows, Home, End, Escape; actual-data summary on `role="img"`; polite live announcements.
- Chart height remains 160px / 176px at the existing breakpoint. On narrow cards, the change/RATE copy scrolls horizontally within its one row while the period buttons remain visible. This avoids adding a row or shifting the chart; the 254px sidebar is unchanged.

## Verification

| Check | Result |
|---|---|
| Net-worth unit tests | **19 passed**, including hand-calculated daily balances, no-record/one-day, internal transfers, mixed assets/cash, FX, Bangkok dates, zero formatting, parts sums, nice ticks, short history, closing-bin downsampling and shared money markup |
| Ledger / cashflow regression | **9 passed**; Ledger calculation code unchanged |
| Round 12 browser baseline | **30 cases / 930 snapped points passed** before round 13's axis and range changes; retained in `output/net-worth-round12/results.json` |
| Round 13 browser matrix | **40 cases / 619 measured tooltip checks passed**: 1905, 1440, 1280, 768px × dark/light × stock, bucket, mixed, empty, one-day; all five periods |
| Tooltip bounds | No marker intersection and no card-boundary overflow in the measured cases |
| Range layout | Chart document Y changed by less than 1px when changing periods in the matrix; no range-change skeleton |
| Long history | 1,200 daily points → 400 real closing observations; opening and latest values retained |
| Slow calculation / rapid selection | Artificial 1s worker delay: old-line opacity measured **0.6**, no skeleton, latest selection wins |
| Persistence / keyboard / reduced motion | Passed; restored highlight has 0s transition, arrows/Home/End/Escape work, reduced-motion tooltip and indicator transitions are 0s |
| TypeScript / production | `tsc --noEmit` and `npm run build` passed; existing unrelated lint/SSR-chart warnings remain in the build log |

### Example reconciliation

These are controlled fixtures built from the supplied examples, **not a reconciliation against the signed-in user's database**. No financial records were fetched or changed for these tests.

| Example | Opening | Latest | Change |
|---|---:|---:|---:|
| Round 12 example, all changes inside period | ฿24,040.49 | ฿26,480.33 | +฿2,439.84 / +10.1% |
| Round 13, 30D | ฿23,331.83 | ฿26,480.33 | +฿3,148.50 / +13.5% |
| Round 13, 15 Oct 2026 tooltip | ฿23,331.83 | ฿27,794.52 | +฿4,462.69 / +19.1% |

Browser tests render the real Dashboard, chart and selectors with deterministic in-memory financial fixtures. The surrounding fixture rail/header are placeholders; screenshots are not of a signed-in production account. The chart/card screenshots use production component styling. Layout checks measure element geometry; they do not claim a separate Chrome Performance-panel CLS recording.

## Changed files in these rounds

| File | Purpose |
|---|---|
| `src/lib/net-worth-series.ts` | Shared valuation, parts and period-change helper |
| `src/lib/net-worth-chart.ts` | Range clipping, closing-bin sampling, dates, nice ticks and tooltip placement |
| `src/lib/net-worth-worker.ts` | Off-main-thread range calculation |
| `src/lib/format.ts` | Central rounded-zero formatting from round 12 |
| `src/context/AppContext.tsx` | Supplies shared scope and history; no auth/database-write changes in these rounds |
| `src/hooks/useNetWorthChart.ts` | Range cache, worker lifecycle, persistence, dim/timeout handling |
| `src/components/NetWorthSparkline.tsx` | SVG, snapped/positioned tooltip, keyboard accessibility |
| `src/components/net-worth-chart.css` | Chart-specific presentation and reduced motion |
| `src/components/MoneyValue.tsx` | Shared Portfolio/Dashboard amount typography |
| `src/app/(app)/dashboard/DashboardView.tsx` | Range row, existing change/return/rate, shared amount and chart wiring |
| `src/app/(app)/portfolio/PortfolioView.tsx` | Delegates its existing Money presentation to MoneyValue; retains hide context |
| `src/lib/net-worth-series.test.mjs` | 19 unit tests |
| `scripts/net-worth-round12-{fixture.tsx,qa.mjs}` | Round 12 baseline harness; superseded presentation assertions by round 13 |
| `scripts/net-worth-round13-{fixture.tsx,qa.mjs,interaction-qa.mjs}` | Current browser geometry and interaction checks |

Evidence: `output/net-worth-round13/results.json`, `output/net-worth-round13-interactions/results.json`, `output/net-worth-round13/build.log`. Screenshots: `output/net-worth-round13/*-bucket.png` and `output/net-worth-round13-interactions/chart-{dark,light}.png`.

Run current checks:

```powershell
node --test src/lib/net-worth-series.test.mjs src/lib/ledger-selectors.test.mjs src/lib/cashflow-selectors.test.mjs
node scripts/net-worth-round13-qa.mjs
node scripts/net-worth-round13-interaction-qa.mjs
npx tsc --noEmit --pretty false
npm run build
```

Browser harnesses use the existing temporary Playwright/esbuild runtime at `%TEMP%/fintrack-cashflow-qa` and installed Microsoft Edge. They do not require or alter the user's active dev server.
