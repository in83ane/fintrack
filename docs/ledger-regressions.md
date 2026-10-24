# Ledger regression fixes

Reference: pre-redesign commit f4d402b. Compared with git diff f4d402b -- src/app/(app)/ledger/page.tsx.

## 1. Native amount display
The added desktop LedgerTable discarded originalAmount/originalCurrency and called formatMoney(row.amountUSD), which multiplies the USD valuation by the current display rate. The old day-list called formatDisplay(originalAmount, originalCurrency). A transaction entered at a historical rate could therefore acquire nonzero decimals only in the desktop row. Monthly totals still used the same USD aggregation in both builds.

formatLedgerAmount / ledgerDisplayAmount now read the exact stored native amount when the chosen currency matches. Different-currency display preserves the existing USD valuation × current display-rate rule. Two-decimal formatting is presentation only. AppContext formatMoney, aggregates, persistence, rate rules and API calls are unchanged.

Tests: scripts/test-ledger-display.mjs covers 126,20,110, zero and real decimals across three FX rates and repeated USD/THB switching, with frozen fixtures.

Screenshots: browser access is disabled in Work settings; required captures and old-build image comparison are pending. No screenshot claim is made for any item without a capture.

## 2. Ledger composition
Restored day groups, category tiles, wallet/note captions, signed amounts, time and sticky daily net. One desktop toolbar row, collapsible filters and a slim summary strip replace the tall header and internally scrolling table. Running net is optional in compact/hover states. Income/Expense retain semantic outlines. Type check and native display regression test pass. Captures remain blocked by browser access.


## 3. Selection and row actions
Checkboxes reveal on hover/focus or toolbar Select mode and stay visible while selected. Space toggles a focused row; Shift+click extends selection; Esc clears it. The floating bar exports exactly selected rows as CSV (existing column contract) or JSON and supports Select all, Clear and confirmed bulk delete with count and gross total. Rows expose an actions menu; single-delete confirmation names category, exact displayed amount and date.

The existing data layer permanently deletes records and reverses associated bucket legs. It exposes no soft-delete/restore operation, so no false Undo is offered; explicit confirmation is retained. Linked funding and trades keep their existing source-management restrictions. Edit reuses updateCashActivity for category/note/date only: changing amount/account is not introduced because it would require changes to balance reconciliation. Duplicate pre-fills the existing entry form; it never saves until the user submits. No live records were changed during this work.

Validation: TypeScript pass. Browser interaction and capture matrix pending access.
