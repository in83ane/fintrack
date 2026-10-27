# PLAN phase 1 — recurrence and goal lifecycle

27 October 2026. This phase is local code plus an **unapplied** migration. No customer database was changed. Email remains off. Savings transfers and PLAN currency accounts belong to phase 2; the new calendar/mobile dashboard belongs to phase 3.

Base migration history: `supabase/migrations/20261027070148_daily_plans.sql` precedes `supabase/migrations/20261027070606_plan_monthly_targets.sql`; both precede `20261027075524_plan_recurrence_rules.sql`. These filenames match the deployed history. SQL content matches after normalizing line endings and outer newlines; no remote history or SQL was changed.

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

- Pure recurrence unit tests: 8 cases, including an explicit endless rule (`ends_on: null`), leap day, year/week boundaries, month end, pause/resume, invalid rules, timezone-independent date arithmetic and the temporary monthly-money guard.
- Isolated PostgreSQL tests: 17 cases using PGlite 0.5.12, actual legacy PLAN migrations and the new migrations, synthetic auth identities/buckets/records. Tests cover unchanged legacy cash rows, unique checks, pause/resume, validation, immutable check amounts, undo, archive/delete, cross-account isolation, protected audit history, extra money confirmation, safe rollback/reapply and refusal of destructive downgrade. Added direct INSERT/UPDATE guard tests, direct trigger-call rejection under anon/authenticated, and database-generated Bangkok effective dates while the session timezone is Pacific/Honolulu.
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
- Temporary guard: `20261027081807_plan_monthly_recurrence_guard.sql` adds validated CHECK `plan_monthly_money_daily_only`: `amount=0 OR amount_period<>'month' OR frequency='daily'`. The same condition disables both create/save in the editor with a localized explanation. Habit goals and per-check money goals retain all recurrence options. Existing unsupported rows cause migration failure, not silent conversion. The reverse script is in `supabase/rollbacks/`; apply/revert it in sequence after/before the phase-1 migration. Do not remove this guard until phase 2's allocator is verified.
- Phase 3: Today view, calendar/activity dots, final streak/month/year statistics, scroll-to-today and currency-pill size.
- Phase 4 search and phase 5 ICS/in-app reminder jobs remain separate. Future channel fields will accommodate email/push; neither is enabled.
- Stop after phase 2 for the user's review, before starting phase 3.

## Pre-phase-2 review / commit proposal (awaiting approval)

No additional commit or staging was performed for this review. Do not rewrite `18a111c` or include unrelated dirty files.

Proposed explicit base commits:

1. `chore(plan): track deployed base migrations` — only `supabase/migrations/20261027070148_daily_plans.sql` and `supabase/migrations/20261027070606_plan_monthly_targets.sql`. This records already-deployed files; it does not apply them again to the live project.
2. `chore(plan): track route and loading shell` — only `src/app/(app)/plan/page.tsx` and `src/app/(app)/plan/PlanSkeleton.tsx`.
3. After approval/base commits, commit the guard and its tests/audit report separately using an exact file allowlist.

These four base files close the named PLAN gaps, but **are not sufficient to claim a fully self-contained clean checkout**. `PlanSkeleton` also imports the untracked shared `src/components/skeleton/index.tsx`. The current shared `CustomSelect` uses untracked `FloatingPopover`; current `Modal` uses untracked `scroll-lock`. Shared CSS and financial-refresh integration also remain in earlier uncommitted work. Do not sweep those into a PLAN base commit. A separate dependency audit/explicit approval is needed for their minimal related changes and clean-checkout validation. Keep the original stash until this is resolved.

## Verify private schema and server dates on Supabase

Read-only live check on 27 October 2026: `plan_private` does not exist yet. SQL-exposed PostgREST settings returned NULL, which is **not evidence of exclusion**. HTTP verification returned 401, so the live API allowlist could not be verified; no credentials/configuration were changed. Repeat all checks on the copy after applying the migrations, and again after an approved deployment.

1. In the project's Data API settings, inspect **Exposed schemas**: `plan_private` must not be present. Creating a schema does not prove whether the API allowlist contains it.
2. Run `scripts/plan-security-audit.sql` in SQL Editor. Expect one `plan_private` schema row with both USAGE columns false. Expect the two private audit functions and the five named public trigger functions, with both EXECUTE columns false. Missing rows mean the migration/functions are absent, not a pass. Private functions must have `search_path=""`.
3. The returned `capture_rule_version` definition must set the UPDATE effective date to `(now() at time zone 'Asia/Bangkok')::date`. The editor sends no `effective_on`. INSERT intentionally uses the user-selected start date; that is distinct from the server-owned date of an edit.
4. Use a valid public/publishable key for the intended project and run:

```powershell
node --env-file=.env --env-file=.env.local scripts/plan-api-exposure-check.mjs
```

This read-only request sends `Accept-Profile: plan_private` to `/rest/v1/`. Expected: HTTP 406 and `PGRST106` (schema not exposed). HTTP 401, missing objects, or arbitrary errors are **not** treated as success. Do not use a service-role key for client-role verification; the script never reads it or logs keys.

5. In a separate rollback-only SQL Editor transaction, `SET LOCAL ROLE authenticated; SELECT plan_private.capture_rule_version();` must fail with permission denied. End with `ROLLBACK`, then repeat under `anon` and for `remember_plan_money`, `public.validate_daily_plan_rule`, `public.guard_plan_schedule`. `scripts/plan-phase1-db-test.mjs` already performs these actual calls in the isolated database. Do not grant EXECUTE to make a client test succeed; these functions run only through their attached triggers.

Phase 2 acceptance is now explicitly integer satang/cents, division by required occurrences under the effective rule, and remainder on the check that completes the month's required count (including out-of-date-order checks). Include exact-equality tests for a completed month, undo/recheck, February/leap years and year boundaries. Flexible weekly quotas/partial weeks and rule changes mid-month need an explicit allocation policy before implementation. No phase-2 code was started in this review.


## Base reconciliation completed — 27 October 2026

Authorized commits (no rebase):

- `3e03aff`: only the deployed `daily_plans` / `plan_monthly_targets` migration files under the remote version names.
- `3d76bf1`: only migration filename references in the DB test and this report. Pending guard/test/audit changes were excluded from the index.
- `40beac2`: only PLAN `page.tsx` and `PlanSkeleton.tsx`.

Every commit followed individual-file staging and `git diff --cached --name-only`. The index was empty afterwards. No remote migration was repaired or reapplied. Recurrence migration `20261027075524` sorts after base versions `20261027070148` and `20261027070606`. The current isolated DB suite passed all 17 cases after renaming.

Read-only audit of the other untracked, already-applied migrations:

| Name | Local version | Remote version | SQL comparison |
|---|---|---|---|
| price_email_alerts | 20261026190226 | 20261026193556 | Matches after CRLF/LF and outer-newline normalization |
| price_email_schedule | 20261026193632 | 20261026193649 | Matches after normalization |
| price_email_security | 20261026194008 | 20261026194020 | Matches after normalization |
| price_email_generated_ids | 20261026194223 | 20261026194238 | Local has two extra comment lines; executable REVOKE statement matches |
| persistent_notifications | 20261027065643 | 20261027065744 | Matches after normalization |

These five files are unchanged and uncommitted. Remote data was read through the connected Supabase SQL tool; CLI migration list remains unavailable without CLI login.

### Remaining dependency groups — proposal only

1. Loading primitives: `src/components/skeleton/index.tsx` plus only the skeleton and shared page-container rules PLAN uses from `src/index.css`. Do not include every route skeleton.
2. Form primitives: `src/components/CustomSelect.tsx`, `src/components/FloatingPopover.tsx`, `src/components/Modal.tsx`, `src/lib/scroll-lock.ts`, and the relevant field/select/popover CSS hunks. These are shared components, so regression tests must include another existing modal/select.
3. PLAN navigation integration: only the PLAN entry/title in `Sidebar.tsx` and `TopBar.tsx`, plus its route-skeleton registration. The present `skeleton/RouteSkeleton.tsx` imports many uncommitted page skeletons; do not commit it wholesale. Isolate the PLAN registration or propose the exact dependency closure before staging.
4. Financial refresh integration: the PLAN event emitted on a successful check requires the corresponding `fintrack:financial-change` listener in `AppContext.tsx`. Current uncommitted code uses `financial-snapshot.ts`, `memory-resource.ts`, `loading-policy.js` and changes to `lib/supabase.ts`. Isolate the minimal listener/refresh slice or obtain separate approval for the full cache dependency group; do not sweep the full AppContext diff (charts, inbox, cache, etc.) into PLAN.
5. Pending phase-1 guard/audit changes are a separate follow-up, not old baseline dependencies: GoalEditor, recurrence gate/test, DB/UI tests, guard migration/rollback, API exposure checker, security audit SQL and this report.

Clean-checkout self-containment remains unverified until these dependencies are approved and isolated. Await approval before committing any group or starting phase 2. Stop again after phase 2 for user review.


## Approved sequencing update

Shared dependency groups 1–4 are deferred until pre-deploy review. Do not hunk-split shared files or create untested partial dependency commits; review and commit old work in complete topic groups instead. Group 5 (temporary guard, editor, recurrence gate/tests, DB/UI tests, security audit, API check, rollback and report) is approved as one follow-up commit. Phase 2 may proceed on the current full working tree; stop for user review when phase 2 finishes.

Pre-deploy checklist: decide explicitly whether `output/`, `.impeccable/` and `project_architecture_summary.md` should be committed or ignored (do not read/invoke design skills); then verify the build in a clean Git worktree. Current working-tree tests are not evidence that committed HEAD builds independently.
