# PLAN, persistent notifications and transaction search

Implemented 27 October 2026. The requested money behavior is **expense**, not a transfer to another asset account.

## Behavior

- `/plan` appears as PLAN in the existing sidebar/top bar. Each named goal has a date range, daily checkboxes, month view and year overview. Habit goals move no money. Money goals use a USD/THB bucket and either a per-day amount or monthly target.
- A monthly target is divided over the dates inside the plan in that calendar month. Shares are truncated to cents and the final scheduled day receives the remainder. Partial first/last months still use the specified monthly target across their scheduled days; the form explicitly says it is divided across scheduled days.
- Checking inserts one `EXPENSE` with category PLAN and the goal name/date in its note. Native cash records are the source of the balance calculation. The existing last recorded bucket FX rate supplies the legacy USD column; no invented rate is used. A missing native amount/rate, insufficient balance or future date fails without recording a check.
- Check, expense, bucket activity and cached balance are one database transaction. `(plan_id, day)` prevents duplicate debits. Unchecking atomically removes that linked expense and restores the balance. Ledger directs linked entries back to PLAN rather than allowing one-sided edits. Archive preserves past checks and expenses.
- Ledger and Cash Flow search notes, categories, types, asset symbols, wallet names, ISO dates, English and Thai dates including Buddhist years. Search works within the selected date/portfolio/wallet filters, including totals and exports. Clear the query to restore the full selection. Cash Flow shows all matching activity rows inside a scrollable table.
- The existing every-minute price worker now writes to `account_notifications`; its executable path contains no email-provider calls or Resend key requirement. Its old deployment/table names remain to preserve saved alert IDs and the scheduler.
- A price hit and inbox insert commit together. Each condition fires once. Inbox RLS isolates accounts; a stable event ID prevents duplicates on retry. The bell loads unread events first, counts all unread rows, saves read state, and offers older history in pages. Reading never deletes history. No 200-item retention cutoff or automatic expiry exists.
- Old per-account browser notification history is uploaded through a durable outbox, and active per-account browser price conditions migrate with stable source keys. A failed upload stays local for retry. Existing detected server email events are copied into the inbox. Future market events before monitoring was enabled cannot be reconstructed from unavailable historical ticks.
- The browser refreshes the inbox on login/focus/online and every 15 seconds while visible. The scheduler checks a bounded queue every minute; quotes can be delayed and brief crossings between samples can be missed. This is not an exchange tick stream.

## Validation

- `scripts/plan-inbox-security-test.sql`: executed against the real database in a rollback transaction. Passed atomic debit/undo, no double debit, monthly cent allocation and reversal, future-date rejection, insufficient funds, non-financial habits, account isolation, read persistence, no inbox deletion, exactly-once price events.
- `node --test src/lib/record-search.test.mjs src/lib/cashflow-selectors.test.mjs scripts/price-email.test.mjs`: 18 passed. Retired email helper tests are mocked; no actual emails sent.
- `scripts/plan-inbox-qa.mjs`: real React hook/view with an isolated API adapter, 8 combinations (390/1280px × TH/EN × dark/light), checking/reloading/undo, month/year, read-state persistence and history up to 1,201 entries (including pagination beyond the API's default 1,000-row limit).
- `scripts/price-inbox-qa.mjs`: 8 combinations, server save/failure/reload, no email UI, no browser market polling, USD/THB only.
- `scripts/record-search-qa.mjs`: Ledger/Cash Flow in TH/EN, no matches, categories, ISO dates. Charts mocked; real selectors and search controls run.
- TypeScript, production build and diff whitespace checks passed. The build retains hook-ref lint warnings and chart-size warnings during static generation; no build errors. Supabase security advisors reported no new findings for these tables/functions; pre-existing warnings remain outside this change.

Browser screenshots/results are in `output/plan-inbox`, `output/price-inbox-alerts`, `output/record-search`. These are fixture screenshots, not real customer records. Database migrations and the inbox-only Edge worker were deployed. The frontend code is local to this checkout; no website production deployment was performed.
