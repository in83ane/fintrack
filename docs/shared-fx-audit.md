# Shared USD/THB display rate — 2026-10-13

## Cause and changes
- Portfolio Summary used `useFxRate`; AppContext fetched an independent legacy endpoint once. They could disagree in source, age and manual override.
- AppContext now derives THB directly from the same singleton FX store as Portfolio and Topbar. Auto refresh, cached/stale state and manual override are shared. No hardcoded THB quote is used while unavailable.
- Portfolio board rate follows the shared rate in both Auto and Manual modes.
- Portfolio detail's fixed 36.5 and add/edit/cashflow modal fixed-rate fallbacks were removed.
- The legacy endpoint now delegates to the valuation endpoint instead of returning an unrelated provider or fabricated fallback. Its supported rates are USD/THB.
- New execution/transfer inputs follow the shared quote until explicitly edited; historical execution rates are not changed.
- Topbar shows the shared USD/THB rate, Auto/Manual, cached-stale indication and retrieval time in ICT. Retrieval time is not necessarily the provider's market publication time.

## Source audit
Dashboard, Budget/Bucket, Ledger, Cashflow, Calendar, Transactions, widgets and existing common formatters consume AppContext.exchangeRates; they now read the shared quote. Portfolio Summary and Topbar read that identical store. Terminal's TradingView chart is an external market-data widget, not the application's FX valuation source.

Recorded `rateAtTime`, execution fees, native amounts and cost-basis calculations intentionally retain transaction semantics. They need not equal today's display quote. No database migration or live-data write was performed during this work.

## Verification / limitations
Automated FX tests cover three concurrent consumers, request deduplication, synchronized manual/auto changes, continued polling after navigation, native-currency invariants, unavailable quotes and immutable historical P&L. TypeScript and native-money tests are run separately.

This is source and isolated-test verification, not an authenticated browser walkthrough. Legacy mixed-currency data/model issues documented in previous native-currency audits are not resolved by sharing a rate. Historical fallback paths and legacy asset USD-equivalent persistence remain a separate native-data migration concern.
