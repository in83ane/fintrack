# Price alerts and overlapping floating actions — 2026-10-27

## Confirmed causes

- DashboardView rendered its own blue floating `+` at bottom-6/right-6 while the persistent application layout rendered a gold `+` at bottom-8/right-8. Both existed simultaneously.
- PriceAlertManager's 30-second callback only checked `assets` from the current portfolio. It did not fetch prices, and silently ignored saved alert symbols absent from that portfolio.
- Legacy checks used asset.currentPrice (USD) without recording a target currency. Display formatting could then show another currency while comparison still used the raw target.
- Notification side effects ran inside a React state updater, which is unsafe under replay/StrictMode. Several notifications could also receive the same Date.now ID.
- Notification inbox state was memory-only.

## Changes

- Removed the Dashboard-only duplicate action menu and floating gold alert bell. The existing global Add Record button and inline Dashboard actions remain available.
- Added Manage price alerts inside the existing top-bar notification menu.
- Added a persistent layout-level alert monitor: fetches saved active alert symbols independently of selected portfolio/holdings, approximately every 15 seconds; checks immediately on creation, focus, reconnect and manual retry.
- Added a quote-only mode to the existing market API: one lightweight upstream request per symbol, original currency and quote timestamp, separate short cache, no synthetic previous-close fallback for alerts. Existing chart mode remains available.
- Explicit target currency defaults to the website setting; normalize source quote to that currency before comparison. Legacy saved alerts retain their original USD comparison semantics and show USD explicitly.
- Inclusive above/below checks; no cost-basis fallback. Missing quotes/FX fail visibly and retry automatically.
- Pure evaluation, abortable requests, no overlapping polling requests, and browser locks around alert writes/delivery to prevent duplicate notifications in multiple tabs. No side effects in state updater functions.
- Saved alerts/history are scoped to the account on this browser; old device-wide alert storage is migrated once. Deleting the last alert persists an empty list.
- Notifications have unique IDs and a per-account browser-persisted inbox (up to 200 entries), with cross-tab synchronization.
- Optional browser notifications request permission only on the user's explicit button click. In-app notification and toast delivery do not require browser notification permission.
- Added held-symbol suggestions, currency selector, quote timestamp, last-check/error status, check-now action, and visible delete controls.

## Verification

- `npx tsc --noEmit --pretty false`: pass.
- `node --test src/lib/price-alerts.test.mjs scripts/price-alert-market.test.mjs`: 12 pass. Covers equality thresholds, multiple triggers, no duplicate evaluation, currencies/legacy USD, missing/invalid prices and FX, crypto normalization, safe storage parsing, immediate polling, single request in flight, abort/late-response suppression, failure/recovery, repeated polling, batching, quote-only API and chart-mode cache isolation.
- `node scripts/price-alert-qa.mjs`: 8 pass (390/1280px × dark/light × EN/TH), actual manager under React StrictMode with deterministic market responses. Covers creation, no premature alert, switching to an empty portfolio, service failure/recovery, one notification across two tabs, persistence across refresh, delete-last-alert persistence, no horizontal document overflow and no browser runtime errors.
- Direct public upstream AAPL request: HTTP 200, valid regularMarketPrice, USD currency and regularMarketTime. This confirms provider reachability; threshold delivery was tested with controlled quotes rather than waiting for a real market crossing.
- Screenshots and browser results: `output/price-alerts/`.

## Boundaries

This is browser polling, not exchange streaming or a server-side push service. Quotes can be delayed, and a brief crossing between samples may be missed. Browser timer throttling/device sleep can extend the interval. Closing the app stops monitoring; reopening resumes checks. Alerts and history are stored in this browser, not synchronized across devices. Browser system notification permission/delivery depends on the browser/OS; the deterministic browser tests exercise in-app delivery. No authenticated live-account end-to-end market crossing was performed.

## Files

- src/components/PriceAlertManager.tsx
- src/components/TopBar.tsx
- src/app/(app)/dashboard/DashboardView.tsx
- src/context/AppContext.tsx
- src/app/api/market/route.ts
- src/lib/price-alerts.ts
- src/lib/price-alerts.test.mjs
- scripts/price-alert-market.test.mjs
- scripts/price-alert-fixture.tsx
- scripts/price-alert-qa.mjs
