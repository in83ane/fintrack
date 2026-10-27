# PLAN phase 1 — recurrence and goal lifecycle

27 October 2026. This phase is local code plus an **unapplied** migration. No customer database was changed. Email remains off. Savings transfers and PLAN currency accounts belong to phase 2; the new calendar/mobile dashboard belongs to phase 3.

## Changes

- Extend `daily_plans` and `plan_checks` instead of renaming or replacing them. Existing IDs, cash entries and check-in amount snapshots stay intact.
- `ends_on` becomes nullable. Rules support daily, selected ISO weekdays (Monday=1), flexible weekly quota (1–7) and monthly day (1–31, clamped to month end).
- Compatibility fields remain: `amount=0` denotes a habit; positive `amount` denotes money. `amount_period=day/month` represents per-check amount/monthly target. No duplicate monetary columns that could disagree are introduced.
- `plan_rule_versions` stores rules and active/paused/archived status effective on Bangkok calendar dates. Edits take effect today; earlier dates use earlier versions. Same-day edits replace that day's version. New goals may start in the past; their first rule starts on that chosen date.
- Historical archive dates were not stored by the old model. Migration preserves prior schedules and records already-archived status effective on migration day; it does not invent historical pause dates.
- Pause days are excluded from the generated eligible dates. Resume day is eligible again. Existing check-ins remain visible and can be undone even when paused/archived.
- Flexible weekly goals permit extra checks; `weeklyPlanProgress` caps credited checks at the weekly quota. An extra money check requires confirmation in both UI and database. Final streak display is phase 3.
- Edit/create use a whitelist of editable fields. The database derives money currency from the owned source bucket. Start date changes are rejected once check-ins exist. Existing recorded amounts never change when editing a goal.
- Deleting a goal with financial history archives it. The ever-had-money flag persists even after undo, so subsequent deletion still preserves the goal. Nonfinancial goals can be deleted, with confirmation, together with their checks. Archive can be restored.
- Rule versions are client-read-only. Two narrowly scoped internal trigger functions in non-exposed `plan_private` write audit versions and remember financial history. They use an empty search path, check `auth.uid()`, and have no client execute privileges. All user-facing operations remain invoker/RLS protected.

## Files in this phase

- `src/lib/plan-recurrence.ts`, `src/lib/plan-recurrence.test.mjs`
- `src/app/(app)/plan/GoalEditor.tsx`, `src/app/(app)/plan/PlanView.tsx`
- `supabase/migrations/20261027075524_plan_recurrence_rules.sql`
- `supabase/rollbacks/20261027075524_plan_recurrence_rules.down.sql`
- `scripts/plan-phase1-db-test.mjs`
- `scripts/plan-phase1-ui-test.mjs`, `scripts/plan-phase1-fixture.tsx`, `scripts/plan-phase1-adapter.ts`
- This report.

The pre-existing uncommitted route, skeleton, shared UI and Supabase client remain the working baseline. They are not swept into this phase commit. The touched `PlanView.tsx` was previously untracked, so Git records that phase-owned view as a new file rather than a delta against the stash.

## Validation

- Pure recurrence unit tests: 7 cases, including leap day, year/week boundaries, month end, pause/resume, invalid rules and timezone-independent date arithmetic.
- Isolated PostgreSQL tests: 13 cases using PGlite 0.5.12, actual legacy PLAN migrations and the new migration, synthetic auth identities/buckets/records. Tests cover unchanged legacy cash rows, unique checks, pause/resume, validation, immutable check amounts, undo, archive/delete, cross-account isolation, protected audit history, extra money confirmation, safe rollback/reapply and refusal of destructive downgrade.
- Browser tests: 8 combinations (390/1280px × TH/EN × dark/light), real view/editor and a synthetic API adapter. Create, required fields, endless dates, weekdays, edit monthly day, pause/undo/resume, archive/restore/delete. These are fixture tests, not a production Supabase browser session.
- TypeScript and lint are run at phase completion. Project-wide lint has pre-existing warnings; the three changed production TypeScript files pass scoped lint without warnings.

Run in PowerShell from the repository:

```powershell
node --test src/lib/plan-recurrence.test.mjs
node scripts/plan-phase1-db-test.mjs
node scripts/plan-phase1-ui-test.mjs
npx tsc --noEmit --pretty false
npm run lint
```

Test-only packages live outside the project. To reproduce the database test:

```powershell
npm install --prefix "$env:TEMP/fintrack-plan-db-qa" --no-audit --no-fund @electric-sql/pglite@0.5.12
```

The browser runner uses the existing `fintrack-cashflow-qa` temporary Playwright/esbuild installation and installed Edge, just like the earlier test scripts. Screenshots/results are in `output/plan-phase1/` and are not staged.

## Test migration on a copy before rollout

1. Make a new database snapshot. Restore into a **separate disposable database/project**, including auth user IDs, schema, triggers, permissions and financial data. Confirm its hostname/project ID differs from the live project. Stash is a code backup, not a database backup.
2. Disable outbound jobs, email providers and scheduled workers on the copy. Use dedicated test credentials. Do not point the existing production/local app session at the copy accidentally; use a separate checkout/runtime configuration.
3. The copy must already contain the two deployed PLAN migrations ending in `daily_plans` and `plan_monthly_targets`. Record row counts and native balances grouped by user, bucket and currency before applying this phase. In particular, snapshot `cash_activities`, `bucket_activities` and `plan_checks`; this migration must not change their existing rows.
4. Apply only the named phase-1 migration to the copy, inside one transaction. With `psql` installed and `FINTRACK_TEST_DATABASE_URL` set privately to the **copy**:

```powershell
psql "$env:FINTRACK_TEST_DATABASE_URL" -X -v ON_ERROR_STOP=1 --single-transaction -f supabase/migrations/20261027075524_plan_recurrence_rules.sql
```

5. Compare the saved counts/balances/rows; confirm all old goal/check IDs remain. Sign in as two separate test users and verify neither sees the other's goals, rule versions or check-ins.
6. In the test app: create an endless habit; select weekdays; set a monthly goal for day 31; pause and resume; edit a name/rule; archive and restore. Check/uncheck a money goal and verify the legacy expense remains the same mechanism. Edit its amount, then undo an older check: the older amount must be restored. Confirm deletion of that goal archives it.
7. Before creating new rule data, test the supplied rollback and then reapply. After new rule data exists, the rollback intentionally raises `Unsafe downgrade` instead of deleting history or fabricating end dates. At that point retain the additive schema and use a fresh backup restored to another copy for recovery testing.

```powershell
psql "$env:FINTRACK_TEST_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f supabase/rollbacks/20261027075524_plan_recurrence_rules.down.sql
```

The local PostgreSQL test above uses a minimal financial schema, not a full customer database clone or the full PostgREST/Auth stack. A real restored-copy rehearsal is still required before production rollout.

## Remaining / rollout boundary

- Phase 2: lazily create PLAN · THB / PLAN · USD per portfolio; add savings transfer vs planned expense; complete monthly target allocation for arbitrary recurrence, ad-hoc amounts, cents and financial snapshot/version behavior.
- Do not deploy phase 1 on its own for money goals using monthly targets with non-daily recurrence: the old financial allocator divides by calendar days. That integration is deliberately part of phase 2, not silently redefined here.
- Phase 3: Today view, calendar/activity dots, final streak/month/year statistics, scroll-to-today and currency-pill size.
- Phase 4 search and phase 5 ICS/in-app reminder jobs remain separate. Future channel fields will accommodate email/push; neither is enabled.
- Stop after phase 2 for the user's review, before starting phase 3.
