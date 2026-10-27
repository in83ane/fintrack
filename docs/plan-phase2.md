# PLAN phase 2 — review checkpoint, 27 October 2026

Implementation is ready for review on the current working tree. **No production SQL was applied. Stop here before phase 3.** Shared dependency groups 1–4 remain deferred as requested; this does not claim that committed HEAD builds on its own.

## Approved policy implemented

- Money is allocated as integer satang/cents (`bigint`). Existing decimal `amount` fields remain compatibility snapshots for existing readers.
- Savings create a withdrawal/deposit pair marked as transfers, from the selected bucket to a lazy system `PLAN · THB` or `PLAN · USD`. Mapping is unique per owner + portfolio + currency. Expenses create an expense and decrease total cash. Existing goals default to expense.
- Check-in, snapshot, financial entries, bucket balances and month lock are in one database statement/transaction. A repeated insert for the same plan/date is a no-op. Insufficient source funds abort the entire statement; undo of a savings transfer also requires sufficient PLAN funds.
- Monthly split uses eligible dates and effective rules. Monday–Sunday weeks are clipped at month boundaries; quota is `min(X, eligible days in that month/week)`. Paused days before locking and days before the plan starts do not contribute capacity. Monthly day 31 uses the month's last day.
- The first actual check creates an immutable month lock containing target, currency, source, mode, allocation method, eligible groups and required count. No upfront locks/system wallets are created for every user.
- Split amounts are `floor(target / count)`; only the check that completes the locked required count receives the remaining cents. A stopped/incomplete month never receives an automatic top-up. Undo reverses precisely the original snapshot, including any previously issued final remainder; it never reprices surviving checks. Rechecking cannot exceed the locked target.
- Changes to a locked month's amount/rules take effect on day 1 of the next month. The editor explains this. Partial undo retains the lock; removing **all** checks, including zero-value extras, unlocks it. Unlock also removes the obsolete queued next-month version, so a subsequent edit cannot later be overwritten by stale rules.
- Pause/archive take effect immediately using **database Asia/Bangkok date**. The locked schedule/amount remain unchanged, paused days cannot be checked retrospectively after resume, and restore continues the same lock. Incomplete stopped months display “ไม่ครบเพราะหยุด”. No automatic catch-up charges.
- Over-quota monthly checks have `amount_minor = 0`, `amount = 0`, `cash_id = NULL`, `credited = false`. They do not count toward completion or receive remainder. Undo of a paid check never promotes them. The UI asks before recording the extra check. Per-check monetary plans still require confirmation before another charge above weekly quota.
- Flexible monthly mode asks for an explicit amount and rejects amounts above the remaining target. It never fills a shortfall automatically. A user choosing less than the target across their available checks may leave the month incomplete; undo/recheck remains explicit.
- New financial snapshots cannot be edited directly by clients. Linked financial legs and system-wallet identity are protected. The private trigger functions have no client schema usage/execute grants. All three new readable tables have owner-only RLS and no client writes.

## Files

| Area | Files |
|---|---|
| Database | `supabase/migrations/20261027084140_plan_atomic_money.sql` |
| Safe downgrade | `supabase/rollbacks/20261027084140_plan_atomic_money.down.sql` |
| PLAN UI | `src/app/(app)/plan/GoalEditor.tsx`, `src/app/(app)/plan/PlanView.tsx` |
| Shared PLAN types/helpers | `src/lib/plan-recurrence.ts`, `src/lib/plan-money.ts` |
| Unit tests | `src/lib/plan-recurrence.test.mjs`, `src/lib/plan-money.test.mjs` |
| Database tests | `scripts/plan-phase2-db-fixture.mjs`, `scripts/plan-phase2-db-test.mjs` |
| Browser tests | `scripts/plan-phase2-fixture.tsx`, `scripts/plan-phase2-ui-test.mjs`; phase-1 UI regression updated for the removed temporary gate |
| Security/report | `scripts/plan-security-audit.sql`, this report |

The obsolete monthly/daily-only UI helper and its unit test were removed. Historical phase-1 database tests still apply only the migrations through phase 1 and continue to verify that older guard.

## Verification performed

| Check | Result / limits |
|---|---|
| Phase-2 DB | 26 passing cases in isolated PGlite PostgreSQL; includes actual cash-management boundary trigger from migration 014 |
| Phase-1 DB regression | 17 passing cases |
| Unit tests | 20 passing: 7 recurrence, 6 money, 7 existing cashflow selectors |
| Phase-2 browser/DB integration | 8 passing combinations: TH/EN × dark/light × 390/1280px. Actual PLAN React components and database triggers, local HTTP adapter using PostgREST-compatible date serialization. Includes save, savings check, extra confirmation/zero entry, locked edit and undo/unlock |
| Existing phase-1 browser regression | 8 passing combinations, updated to accept monthly recurrence now supported by phase 2 |
| TypeScript / targeted ESLint | Passed; ESLint prints the repository's legacy configuration deprecation notice |
| Working-tree production build | Passed. Existing warnings remain outside PLAN (hooks, image usage and chart dimensions during prerender). This is **not** a clean-checkout build |
| Rollback | Empty/safe copy downgrades and reapplies; copy containing phase-2 snapshots rejects downgrade without deleting data |
| Migration preservation | Existing financial rows compare unchanged before/after migration; legacy sub-cent undo preserves exact original values |
| Security | Private execute calls/client snapshot forgery/table writes rejected, cross-user access hidden, linked-leg edits rejected |

DB coverage includes leap February, midweek starts, year-end split weeks, selected weekdays, day-31 clamping, pause before/after lock, pause until month-end, edits during pause, archive/restore, all-undo during pause, deferred next-month changes, no auto-promotion, insufficient funds and separate THB wallets across portfolios / USD isolation. No-end rules remain covered.

Screenshots are local evidence under `output/plan-phase2/*-locked.png` and `output/plan-phase2/*.png`; they are deliberately **not staged**. These isolated screenshots do not include the app shell. The current mobile grid is the pre-phase-3 layout.

### Reproduce locally without touching Supabase

Run from the repository. Test dependencies were kept outside the project (no package/lockfile changes):

```powershell
npm install --prefix "$env:TEMP/fintrack-plan-db-qa" --no-save @electric-sql/pglite@0.5.12
npm install --prefix "$env:TEMP/fintrack-cashflow-qa" --no-save esbuild@0.28.2 playwright@1.64.1
node --test src/lib/plan-recurrence.test.mjs src/lib/plan-money.test.mjs src/lib/cashflow-selectors.test.mjs
node scripts/plan-phase1-db-test.mjs
node scripts/plan-phase2-db-test.mjs
node scripts/plan-phase1-ui-test.mjs
node scripts/plan-phase2-ui-test.mjs
npx tsc --noEmit
$env:ESLINT_USE_FLAT_CONFIG='false'
npx eslint 'src/app/(app)/plan/GoalEditor.tsx' 'src/app/(app)/plan/PlanView.tsx' src/lib/plan-money.ts src/lib/plan-recurrence.ts
npm run build
```

Browser tests use installed Microsoft Edge at `C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe`. The test-only clock replacement is confined to the isolated fixture; the migration uses database `now() at time zone 'Asia/Bangkok'`.

## Test migration with a data copy before deployment

1. Restore a backup into a **separate disposable Supabase project/Postgres instance**. Copy schema, auth owner IDs and financial tables together; do not copy production cron schedules or enable external notifications. Confirm the project ID/DB host before running anything. Use separate app environment variables pointed only at the copy.
2. Record migration history on that copy and baseline counts/sums of `cash_activities`, `bucket_activities`, `plan_checks`, and `money_buckets` per owner/currency. Save an export of financial rows for comparison. Do not infer SQL equality from matching migration version alone.
3. Apply **only missing** PLAN migrations in order: `20261027070148`, `20261027070606`, `20261027075524`, `20261027081807`, `20261027084140`. The first two already exist on the real project; do not replay them there. Never run a blind push of all currently untracked repository migrations. Phase 2 requires the phase-1 migrations first.
4. Immediately compare original financial rows with the baseline: migration must not change their amounts, currencies, IDs or timestamps. The additive schema/new status history are expected changes. System wallets and month locks should still be empty until real test checks are made.
5. With two test users and native THB/USD buckets, test expense and savings separately: repeated check, undo after changing target, insufficient balance, cross-user requests, weekly extra confirmation, locked edit, partial/all undo, pause/resume/archive/restore and month boundaries. Verify savings sum is unchanged; expense total falls by the exact snapshot. Inspect `amount_minor`, `credited`, `cash_id`, `destination_cash_id`, `month_key` and `plan_month_locks` directly.
6. For a simple deterministic monthly test on the copy, use target 100.00 and exactly 3 required past dates: the first two **actual** checks are 33.33 and completing check is 33.34, irrespective of clicked date order. An extra weekly check must be zero/NULL and remain zero after a paid check is undone.
7. Run the security audit below and Data API exclusion probe with that copy's public URL/key. Test both a valid owner session and another user's session through the API.
8. Test multi-session concurrency on real Postgres: two sessions signed as the same owner insert the same plan/date; one may wait on the plan row, but only one check and one set of financial legs may exist. Also check two different goals spending the same nearly-empty source bucket. The isolated tests verify serial duplicate retries/atomic failure; **real multi-session contention has not been executed here**.
9. Exercise rollback on a fresh copy before entering phase-2 data. Once phase-2 checks, locks or system-wallet mappings exist, the rollback intentionally refuses to discard them; restore the backup to another copy or use a reviewed forward fix. Do not delete financial data merely to bypass the guard.

### Security on the real Supabase copy

- Run `scripts/plan-security-audit.sql`. `plan_private` must exist with `anon_usage=false`, `authenticated_usage=false`; every private/public trigger listed must have client execute=false. The three phase-2 tables must exist with RLS=true, authenticated SELECT=true and INSERT/UPDATE/DELETE=false.
- Dashboard → Data API → Exposed schemas: `plan_private` must be absent. Database grants alone do not prove PostgREST configuration.
- Run `scripts/plan-api-exposure-check.mjs` using the copy's public project URL/key. Only HTTP 406 / `PGRST106` verifies exclusion; HTTP 401 or a missing schema is **not** proof. Prior production probe returned 401, so production API exclusion remains unverified.
- In a rollback-only SQL transaction, set `ROLE authenticated` and attempt `SELECT plan_private.apply_money_check()`, `undo_money_check()` or `month_schedule(...)`; each must fail permission checks. Repeat for `anon`. Trigger execution through the authorized table mutation must still work. Never grant EXECUTE to make direct calls succeed.
- Run Supabase security advisors on the migrated copy. No phase-2 remote advisor result is claimed because this migration has not been deployed remotely.

## Deliberate migration boundaries / pending review

- An existing monthly goal with **pre-phase-2 check-ins in that month** is not silently repriced. Further allocation in that month is blocked with a specific message: preserve history and continue next month, or explicitly undo that month's checks before restarting. Old checks can still be undone. New writes with sub-cent amounts or unresolved/mixed native wallet amounts are rejected instead of rounded. Review real copied data for these cases before deployment.
- PGlite exercises the SQL engine/roles/triggers but is not the full hosted Supabase/PostgREST/Realtime environment. Full app integration and real concurrent sessions must be verified on the copy.
- Financial refresh still depends on previously uncommitted shared AppContext/cache work. Shared dependency groups 1–4 remain deferred, not partially staged.
- Predeploy: decide whether `output/`, `.impeccable/`, `project_architecture_summary.md` are committed or ignored; review/commit old work by whole topics; build from a clean Git worktree. No design skill was used.
- Phase 3, search refinements and calendar/reminder work have not been started in this phase.

## Previously authorized housekeeping

Group 5 was committed separately as `e7235b9`. The following untracked local files were renamed to their previously verified remote versions, without applying SQL or changing remote history; they remain uncommitted:

| Migration | Old local | Remote-aligned local |
|---|---|---|
| price_email_alerts | 20261026190226 | 20261026193556 |
| price_email_schedule | 20261026193632 | 20261026193649 |
| price_email_security | 20261026194008 | 20261026194020 |
| price_email_generated_ids | 20261026194223 | 20261026194238 |
| persistent_notifications | 20261027065643 | 20261027065744 |

Old versions remain only in historical audit/report tables, not executable references. No email feature was enabled.
