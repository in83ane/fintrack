# FinTrack architecture summary

## Overview

FinTrack is a Next.js 15 / React 19 portfolio and personal-finance application.  Its authenticated application lives below `src/app/(app)` and is wrapped by a client-side `AppProvider` (`src/context/AppContext.tsx`).  Supabase (Postgres plus Auth/RLS) is the persistent backend; unauthenticated use falls back to browser `localStorage`.  The product includes portfolios, asset holdings and trades, cashflow/ledger records, money buckets, DCA drafts, market data/chart endpoints, analytics, and trading/journal interfaces.

`/history` now reads the persisted, trade-only `history_events` audit ledger rather than mock rows.

## Main components and data flow

- `src/context/AppContext.tsx` is the client-side composition root and application state store. It manages authentication, selected portfolio, data loading, optimistic writes, local fallback data, portfolio metrics, exchange rates, notifications, settings, and nearly all financial mutations.
- `src/lib/supabase.ts` exposes a thin table-oriented repository (`db`) over the Supabase client. Its methods query by user and, where appropriate, portfolio.
- Route pages and components consume `useApp()` for holdings, trades, cash activities, bucket activities, mutations, and derived metrics. Trading, portfolio, transaction, cashflow, ledger, calendar, budget, dashboard, and terminal pages are UI consumers of this shared state.
- Supabase Auth determines the active user. Authenticated data is loaded concurrently after portfolio selection; anonymous data is read/written to `localStorage` keys such as `fintrack-trades`, `fintrack-cash-activities`, and `fintrack-bucket-activities`.
- Market/chart/analysis API routes and server actions are independent of the financial-record store. They provide market data and analysis, while the AppContext writes trades and balance records.

## Persistence model and schema

The authoritative schema begins in `supabase_schema.sql`, then is extended by migrations:

- `profiles`: one row per `auth.users` account; stores display, locale/currency and account metadata.
- `portfolios` (migrations 008/013): user-owned portfolio boundary (`id`, `user_id`, name, color, default flag) with a `kind`: `trading` or `cash_management`. The legacy portfolio named `Bucket` is migrated to `cash_management`; newly created portfolios are trading portfolios. Migration 009 scopes core portfolio data to `portfolio_id` and applies RLS.
- `assets`: current holding projection per user/portfolio/symbol. It stores quantity, average purchase/current price, calculated value, allocation, active/favorite state, and display metadata. It is mutable and is not an audit source.
- `trades`: execution records containing user/portfolio/asset references, symbol/name, type, amount, quantity, execution price, currency/FX rate, fees/taxes, total cost, stored P&L fields, execution/settlement timestamps, status, notes, and tags. Current client types map only part of the SQL schema. The UI supports BUY, SELL, DIVIDEND, IMPORT and locally declares SHORT/COVER, although the original SQL type constraint only lists BUY/SELL/DIVIDEND.
- `cash_activities`: income, expense, deposit, and withdrawal records with amount, category, notes, date/time, bucket/transfer markers, and currency/FX/original amount. Migration 005 provides the extra persistence columns.
- `money_buckets` and `bucket_activities`: personal bank-account, wallet, budget, and savings balances. They are cash-management data and must not fund trades.
- `brokerage_accounts` and append-only `brokerage_cash_entries` (migration 013): cash accounts owned by one trading portfolio (for example Dime USD/THB). Their balance is derived by `brokerage_account_balances`; deposits, withdrawals, and trade cash effects remain separate from `money_buckets`. A trade may reference exactly one brokerage account.
- `allocations`, `user_categories`, `dca_drafts`, and `trade_journal`: allocation targets, custom ledger categories, unexecuted DCA plans, and trading-journal metadata. DCA drafts deliberately do not create holdings until executed.

All primary financial tables are user-owned and protected by Supabase RLS. `history_events` and `brokerage_cash_entries` are append-only. The app prevents deletion of posted DCA orders; corrections must be posted as new trades.

## Current investment calculations

- Holdings are reconstructed from trade records in `getTradePosition`: buys/imports add quantity and cost (including fees); sells proportionally reduce the remaining cost basis. This is a moving-average style projection, not a tax-lot ledger.
- Assets carry the latest quantity, average cost, current price, and marked-to-market value. Aggregate invested capital is `sum(avgCost × shares)`; unrealized P&L is current included asset value minus that cost basis.
- `src/lib/finance.ts` contains reusable cost-basis, realized/unrealized P&L, return, trade metrics, risk/reward, position size, drawdown, and approximate Sharpe calculations.
- A DCA trade is funded from its selected brokerage account. Database triggers validate that the account and trade have the same user/portfolio, add the cash effect to the brokerage ledger, and reject trades in a `cash_management` portfolio. The legacy automatic `cash_activities` trade trigger is disabled by migration 013 to prevent mixing brokerage cash with personal cashflow.
- A net-worth time series is derived client-side from trades and the current portfolio value; it is not a persisted valuation history.

## Existing integrity and integration constraints

- Financial writes are distributed across `addTrade`, bulk import, cash activity, bucket activity, and bucket-funded trade paths in AppContext. They update individual source tables directly and often use optimistic client state.
- Records can currently be edited/deleted through context methods and Supabase policies. Deleting an asset may also delete its trades, so historical audit data is not preserved.
- The history page is intentionally trade-only. A dedicated append-only ledger captures immutable trade facts (recorded timestamp, effective timestamp, portfolio, source reference, execution type, symbol, quantity, price, fees/taxes, cash amount/currency/FX, and realized/unrealized P&L snapshots when meaningful). Corrections should be new audit events, never destructive updates.
- For performance, History reads should be indexed and paginated by `(user_id, portfolio_id, occurred_at DESC)` and should be loaded independently of core portfolio data. The write path should be one atomic database operation or trigger-backed append, so ledger recording cannot lag or block UI state updates.

## Implementation direction

The History feature uses an immutable `history_events` trade ledger with insert-only RLS and a guarded trigger/function that appends normalized entries whenever a trade changes. A lightweight History query is independent of core portfolio loading. `assets` stays a mutable current-position projection; `trades`, brokerage cash entries, and history events are the financial sources of truth.

## Portfolio role rules

- **Bucket / cash-management portfolio:** bank accounts, cashflow, and `money_buckets` only. Terminal/DCA is intentionally blocked and explains how to create a trading portfolio.
- **Trading portfolio:** holdings, trades, DCA drafts/journal, and one or more brokerage cash accounts. The Portfolio page displays the associated accounts and allows an append-only cash deposit. DCA never shows `money_buckets` as a funding source.
- **All portfolios:** aggregate workspace. It shows every personal/bank Money Bucket exactly as the Bucket screen does, and routes Bucket writes to the dedicated cash-management portfolio rather than an arbitrary trading portfolio. It never uses those buckets as a trade funding source.
- **Asset groups inside a trading portfolio (migration 015):** a brokerage item is either a `cash` account used to fund trades or an `asset_group` (for example, `Growth stocks`). Assets can be assigned to one group in the same portfolio by dragging them onto the group card. This organizational assignment does not alter the immutable trade or cash ledgers.
