# Cash Flow implementation and verification

Branch: `codex/cash-flow-rebuild`.

The application route remains `/cashflow`, using the existing AppContext, ledger, trades, buckets, advisor and record writer. No tables, storage, API endpoints or routes were added. No design/frontend skill was used during this continuation. Other pages receive shared totals, scope labels or chart-animation integration only. Unrelated working-tree changes are left intact.

## Money findings

| Reported issue | Code finding and correction | Verification / limit |
| --- | --- | --- |
| Saved differed by one satang across views | Separate floating-point sums and display conversions were used. The selector now converts each transaction once into payable integer minor units; totals, graph, footer and tables consume those integers. | Tests require exact integer equality, with an explicit one-satang record. |
| Dashboard, Ledger and Sankey disagreed | Their record composition, transfer exclusion, native-vs-USD amount choice and period handling differed. Cash Flow also mixed bucket records and trades into its own cash totals. All three now use `getCashflowSummary` with explicit period/currency/scope. Transfers are excluded; trades are classified separately. | Fixture reconciliation and production-call-site guards pass. The precise IDs behind the historical screenshots cannot be established from source alone. The page's Audit detail exposes row ID, local date, wallet, native amount, rate basis, corrected amount, legacy projection and delta for the current account. |
| 126 → 126.12, 20 → 20.02, 110 → 110.10 | Reusing a rounded USD projection and converting it with another rate changes the original THB amount. Same-currency display now uses `originalAmount` directly. Cross-currency display uses the stored execution rate before a current-rate fallback. | Exact tests cover these amounts and 0.01 with three different current rates. Missing native currency or required FX is labelled partial rather than assumed. |
| Net worth vs 0 assets vs bucket balance | Asset count, bucket balance and total valuation measure different scopes. Existing AppContext includes broker cash/buckets according to portfolio kind and settings. Both Cash Flow and Dashboard now use the same final `netWorthHistory` value and expose effective included sources and FX. The valuation calculation is unchanged. | Scope tests cover all portfolios, trading, cash management and excluded sources. The historical ฿834,833.08 cannot be independently traced without its original records/settings snapshot; the labels do not claim that the bucket balance should equal net worth. |
| Food / อาหาร duplicated | Display grouping used raw category text. | The only new alias is `Food` / `food` / `อาหาร` → canonical `food`, displayed as Food in EN and อาหาร in TH. Trimming and case normalization are display-only; records are unchanged. |
| Raw `viewAllTransactions` key | Translation key was missing. | EN and TH values are present in the existing dictionaries. |

The quoted totals **8,270.28 − 5,773.21 equal 2,497.07**, not 2,497.08. Tests deliberately assert the exact arithmetic result.

### Investment and wallet semantics

- BUY/COVER are invested cash; SELL/SHORT are proceeds; DIVIDEND is income. IMPORT is excluded. The investment toggle includes or excludes buys/proceeds consistently, while dividends remain income. Net invested is buys minus proceeds.
- The Sankey uses recorded wallet/broker IDs. It does not infer a transfer destination from equal amounts. Dashed opening/unlinked-balance edges reconcile a wallet whose expenses exceed recorded receipts, and offset unmatched wallet surpluses. Those amounts are excluded from income and footer totals.
- Saved is the period net, not the account balance. Its allocation across surplus wallets is derived and labelled. In deficit periods, Overspent is the signed red result in the footer/table; the graph shows the necessary opening/unlinked funding on its input side. A positive outgoing Overspent edge would double-count spending, so one is not fabricated.
- Cash rows without a portfolio ID retain their wallet scope. Trade rows with portfolio IDs are scoped explicitly. Identical totals require identical period, wallet, portfolio, currency, category and investment inclusion.
- Dates use Asia/Bangkok for timestamp boundaries; same-currency values do not depend on live FX. Legacy USD-only records remain visible with their basis labelled.

## Page delivered

Sticky period/month/wallet/view toolbar, investment switch, seven compact KPI tiles, labelled net-worth chip, computed health ring, three-layer wallet flow, grouped exact-value table, twelve-month paired bars/net line, savings target band, cumulative net/projection, daily calendar filter, category bars/deltas, bucket target comparisons, upcoming-data availability, up to three collapsible insights, recent native-currency records, audit detail, CSV export/import preview and an advisor drawer.

Charts use the existing Recharts stack and tokens, loaded client-side. Shared frames provide descriptions, table toggles, privacy masking and expanded views. The drawer retains the existing chat and quick-log behavior with the requested compact quick prompts. Loading, empty, partial, error and populated states are included.

## Animation coverage

`ChartReveal` and `chart-motion` share viewport registration, plot-change detection, short replays, monotone easing, plot clipping, baseline bar growth, column-order nodes/cells, clockwise donuts/rings and reduced-motion fades. Currency changes also replay normalized charts whose geometry does not change. Animation completion checks for data received mid-sweep; decorations do not trigger a replay loop.

| Surface | Covered marks |
| --- | --- |
| Cash Flow | Seven sparklines, health ring, Sankey links/nodes, monthly bars/net, savings area, cumulative balance/projection, calendar cells, category and bucket bars |
| Dashboard | Net-worth chart; dashboard-widget equity curve, allocation donut and bucket progress |
| Portfolio | Allocation donut, symbol price chart and reusable StockChart |
| Budget | Allocation donut, segmented allocation bar and bucket progress |
| Calendar | Calendar cells, equity curve, macro/risk progress |
| Trade analysis | Mini price chart and confidence ring |
| Trader Hub | Recharts equity area |
| DCA | Recharts allocation donut |
| Advisor | Health ring, monthly bars and expense-velocity progress |
| Terminal / TradingView | Container reveal only; embedded chart internals are cross-origin |
| History | Current route contains no chart or sparkline to wrap |

Internal TradingView canvas marks, axes and range controls cannot be animated or observed by the host application without replacing the embed. No 60fps device-performance claim was made; browser verification checks behavior rather than a laptop performance benchmark. Native SVG numeric endpoints and Cash Flow line endpoints support the counting head value; chart implementations without an exposed endpoint receive the reveal without an invented value.

## Verification

Commands:

```text
node --test src/lib/cashflow-selectors.test.mjs
npx tsc --noEmit
npm run build
npx next lint --file src/app/(app)/cashflow/page.tsx --file src/lib/chart-motion.ts --file src/components/ChartReveal.tsx --file src/components/cashflow/charts.tsx
node scripts/cashflow-browser-qa.mjs
```

Seven money/scope tests pass. TypeScript and the production build pass. Targeted lint has no warnings; the full build reports existing warnings elsewhere in the application. Direct ESLint 9 invocation does not read the repository's legacy configuration, so the existing Next lint integration was used.

The browser harness bundles the **production page and chart components** with an in-memory context. It does not create an application route, access an account, write records or replace application data. Advisor/Add-record modals are stubbed in this harness; their real network/write behavior is not exercised. It freezes the date to 25 October 2026 and uses Asia/Bangkok.

Twenty screenshots cover 1440/390 × dark/light × populated/loading/empty/partial/error. Automated checks cover exact money, investment inclusion, no page overflow, table toggle, privacy, currency replay, ordinary rerenders, reduced motion, the 35% viewport threshold and data updates during animation. Representative populated, empty, partial and error screenshots were also visually reviewed. The harness requires Playwright and esbuild installed in the temporary `fintrack-cashflow-qa` package directory and uses local Microsoft Edge; application dependencies were not changed.

Evidence: QA screenshots and results in `output/cashflow-qa/` are kept locally and are not tracked in Git. Regenerate them with `node scripts/cashflow-browser-qa.mjs`; the script creates the output directory automatically.

## Data-model limits and remaining verification

- Recurring schedules/due dates do not exist. Smallest proposed addition: an optional recurrence record with `amount`, `currency`, `type`, `walletId`, `category`, `nextDueDate`, `frequency` and `active`. This is a proposal only; no schema was created.
- Bucket targets are savings/allocation targets, not monthly expense caps. The page labels that distinction. A true monthly budget needs a period and expense cap per bucket; existing targets are not silently reinterpreted.
- Complete historical opening balances and paired transfer endpoints are unavailable in the current inputs. Dashed reconciliation edges identify that gap.
- Current account discrepancies still require the Audit detail output to identify the exact original rows. Fixture screenshots do not prove that the historic account figures have been reconciled.
- Cross-origin chart internals and full end-to-end advisor/record persistence need their respective integration environment. Recharts tooltips pin on tap on small/touch screens. Calendar taps retain the selected day details while filtering; category and bucket values are visible beside their bars and in tables.

## Changed-file map

- Money: `src/lib/cashflow-selectors.ts`, `src/lib/cashflow-selectors.test.mjs`; shared summary consumers in `src/app/(app)/cashflow/page.tsx`, `ledger/page.tsx`, `dashboard/page.tsx`; existing `src/context/AppContext.tsx` dictionaries.
- Cash Flow: `src/components/cashflow/ChartFrame.tsx`, `src/components/cashflow/charts.tsx`, page above; compact prompt support in `src/components/AIFinancialAdvisor.tsx`.
- Motion: `src/lib/chart-motion.ts`, `src/components/ChartReveal.tsx`, `src/app/(app)/layout.tsx`, scoped additions in `src/index.css`; chart markers in Budget, Calendar, Portfolio, portfolio symbol, Trade analysis, Trader Hub, StockChart, DcaOrderSystem, AIFinancialAdvisor and widgets/WidgetRenderer.
- Evidence: `scripts/cashflow-browser-qa.mjs`, `scripts/cashflow-qa-fixture.tsx`, and this document are tracked. QA screenshots/results stay local and untracked under `output/cashflow-qa/` and can be regenerated with `node scripts/cashflow-browser-qa.mjs`.
