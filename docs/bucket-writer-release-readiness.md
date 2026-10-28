# Bucket writer release readiness — 28 October 2026

## Incident and verified scope

**Recovery applied on Supabase PostgreSQL 17.6 on 28 October 2026, around
16:44 Asia/Bangkok.** After the owner requested completion and explicitly waived
all backups, the four missing migrations below were installed together in one
atomic statement. The three writer RPCs now exist; catalog readiness is **18/18**.
This is production recovery evidence, not a representative-copy or full release
certification. No commit, push or hosting deployment had been performed at that
initial recovery checkpoint. The owner subsequently confirmed localhost saving
works and authorized deployment with the search-clear fix below.

An Expense save displayed only “Could not save. Retry with the same details.”
The screenshot alone did not identify an HTTP status or SQLSTATE. After the
owner permitted a connection for read-only investigation, catalog queries on
the connected **fintrack** project reported PostgreSQL 17.6 and no
`public.write_bucket_cash(uuid,jsonb)`, `public.save_cash_bucket(uuid,uuid,jsonb,numeric)`,
`bucket_private`, or `plan_private`. Migration history ended with the PLAN
monthly-target migration. That initial read-only investigation executed no writer
or migration. The later authorized cutover is recorded separately below.

The missing writer explained why this project could not serve the new app's
writer calls. The owner's subsequent localhost screenshot showed **PGRST202**.
The hosted deployment's exact project binding was not independently inspected.
PGRST202 can also indicate a stale function signature/schema cache, so it must
not be interpreted universally as proof that a migration is missing.
See [Supabase error codes](https://supabase.com/docs/guides/api/rest/postgrest-error-codes).

The owner's pasted SQL matches the repository's 599-line atomic-writer migration
after normalizing line endings. It is not a new repair or a rerunnable patch:
it creates tables/functions, installs triggers and revokes old write grants.
Running just that file against the observed schema skips required dependencies.

## Dependency sequence applied

| Order | Repository migration installed during recovery |
|---|---|
| 1 | `20261027075524_plan_recurrence_rules.sql` |
| 2 | `20261027081807_plan_monthly_recurrence_guard.sql` |
| 3 | `20261027084140_plan_atomic_money.sql` |
| 4 | `20261027131636_bucket_atomic_writer.sql` |

The owner explicitly requested skipping **all backups** on 28 October 2026,
including local dumps. No backup was created or restore tested; recoverability
is unverified. The later request to finish recovery authorized the cutover;
remaining copy, signed-JWT/PostgREST, scheduler/egress, runtime/locks and rollback
coverage in [project status](project-status.md) is not claimed complete.
Do not run all repository migrations blindly or replay historical
migrations already applied. Do not repair balances, restore direct-write grants,
or use purge as a workaround.

A subsequent catalog-only inspection found all nine inspected baseline tables
(`daily_plans`, `plan_checks`, `money_buckets`, `cash_activities`,
`bucket_activities`, `brokerage_cash_entries`, `portfolios`, `user_categories`,
`assets`). The inspected PLAN columns/triggers were at the pre-recurrence
baseline before cutover; `assets.allocation` is present as `text`. This checks object metadata,
not historical data compatibility, complete schema parity or migration runtime.

No PG17 copy has been created or tested. The inspected Supabase project has one
active HTTP cron job, and the historical scheduling migration embeds the
production worker URL. A test copy must have outbound isolation before startup;
blindly replaying that migration on a new branch is not an isolated test.

## Application protection

- Preserve the structured error through all four writer handlers. Translate
  schema errors, authentication failures and permission failures separately.
  Render only validated error codes, never raw database details/hints or payloads.
- A confirmed schema rejection pauses the shared cash/bucket writer transport
  for the current page. Further submissions do not call either writer RPC.
  Reload after the administrator repairs the release to create a fresh transport.
- Ordinary business rejections and authentication failures do not permanently
  disable the writer. Uncertain network failures retain the original request ID,
  IDs, timestamp and FX snapshot through the existing retry mechanism.
- Failed creation keeps the form open and retains its inputs. No success toast,
  direct-table fallback, synthetic balance update or automatic migration is added.

## Required gate before promotion

1. Keep deployment in preview/maintenance until DB and app readiness is reviewed;
   Git push or a successful Next.js build is not evidence of database readiness.
   `next.config.js` now invokes `bucket-writer-build-gate.mjs` during production
   builds, probing all three exact RPC signatures against the build's configured
   target. Missing RPCs, unexpected permissions, invalid keys and network errors
   fail the build. No signed-user JWT or financial payload is used. This code
   is included in the authorized deployment change; it does not retroactively gate an existing
   deployment or certify that a different runtime target matches the build.
2. Verify the deployment's Supabase project binding without publishing keys.
   An authorized operator runs [bucket-writer-release-check.sql](../scripts/bucket-writer-release-check.sql)
   against that exact target. This is a catalog/history-only SELECT and never
   invokes a writer. Keep its result with the deployment revision and timestamp.
   Any query error, false check or missing output blocks promotion.
3. Before recovery the investigation returned **catalog_ready=false: all 18 checks false**.
   Privilege checks return false for missing functions; they do not imply that
   an existing function grants anonymous access. After recovery all 18 pass.
   Passing all checks establishes
   only these metadata prerequisites, not function-body parity or full security.
4. After the approved migration operation, rerun the catalog check, verify API
   visibility/signatures and authenticated execution on the representative copy,
   and complete the real two-session and cutover gates before app promotion.
   Never use a real customer Expense as a smoke-test fixture.
5. If a schema error appears after deployment, stop further writer attempts and
   compare project binding, migration history, signatures, grants and schema
   cache. Collect only the safe error code and release revision. Do not repeatedly
   apply migration SQL. A stale-cache repair is relevant only after the functions
   and signatures are verified to exist.

If immediate service restoration is needed before those gates can pass, review
a hosting rollback to a proven compatible app release as a separate operation;
do not rewrite Git history or automatically roll back the database. The old app's
Delete All Data behavior must remain blocked before using that option.

## Verification of the local fix

`node --test scripts/bucket-writer-errors.test.mjs`: 13 passing offline tests.
`node scripts/bucket-command-test.mjs`: 8 passing existing retry/allocation cases.
TypeScript `--noEmit --incremental false` passed. Targeted ESLint passed with two
existing hook-dependency warnings. These tests use mocks, not a database/PGlite.
The existing database-backed UI harness was not run. The production results
below are separate from these initial offline checks.

## Authorized cutover evidence

- Preflight aggregate audit: 4 buckets, 192 cash rows, 222 mirror rows, zero
  cache/native mismatches, unresolved-history buckets or negative native balances.
  PLAN had zero plans/checks and no overflow/sub-cent values. No customer row
  details, credentials or financial amounts were exported.
- `bucket-writer-cutover.mjs` verifies SHA256 of all four original migration
  files and prepares one atomic DO statement. Only the original writer's outer
  BEGIN/COMMIT are removed in memory, so dependencies, source-version history,
  assertions and smoke verification commit together. Original migration files
  are unchanged. Lock timeout is 5 seconds; the statement sets a 60-second local
  statement timeout (server/transport limits also apply). Baseline guards reject
  non-PG17, already-applied/partial dependencies, nonempty PLAN or unreviewed Auth
  user triggers. This is a one-time incident procedure, not a rerun script.
- Original versions `20261027075524`, `20261027081807`, `20261027084140` and
  `20261027131636` are recorded with their original source statements. The MCP
  operation additionally records `20261028094429_bucket_writer_release_verified`.
  Its remote statement contains the incident wrapper; the matching repository
  migration contains the final assertion/notification for normal sequential replay.
- The migration's private rollback snapshot stores schema/grant metadata and a
  fingerprint; it is not a recoverable data backup. No external backup was made.
- Synthetic runtime test on actual PG17 under `authenticated`: opening 1000,
  expense 153, resulting 847; identical request replay produces no second debit;
  two cash rows/two mirrors; overspend rejected; direct balance write denied;
  another synthetic owner cannot read/write the wallet. Both test identities,
  portfolio, wallet, cash/mirrors, receipts and write context were rolled back
  before the enclosing schema operation completed. No customer Expense was used.
- Fingerprints of all pre-existing rows in seven affected baseline tables matched
  within the same locked statement before/after. Afterward: cash=192, mirrors=222,
  buckets=4, request receipts=0, write contexts=0. Cron remains one active job.
- Catalog readiness **18/18**, private function EXECUTE denied to anon/authenticated,
  and all three REST probes returned the expected anonymous permission rejection
  (`401`, `42501`, exact function name), rather than `PGRST202`. This verifies
  PostgREST discovery and anonymous denial, not signed-user REST success.
- All 192 legacy cash rows remain unlinked. New creation is supported when bucket
  history reconciles; editing/deleting legacy records remains deliberately blocked.
  Do not infer pairs from dates/notes or weaken the guard to bypass this limitation.
- Security advisors still report pre-existing mutable search paths, public
  definer entry points and disabled leaked-password protection. Four new private
  RLS tables intentionally have no client policies. Public writer definer RPCs
  are intentional authenticated entry points with ownership checks. These notices
  do not mean the full security audit is closed. See
  [Supabase database linter](https://supabase.com/docs/guides/database/database-linter).

## Recovery validation and remaining scope

Local checks: writer DB 16, recovery DB 8, PLAN writer 27 (PGlite 18); retry 8;
error mock tests 13; build-gate mock tests 10; atomic-wrapper rehearsal 1 on
PGlite 18 with only the test's expected-major check adapted in memory. The
unadapted rehearsal correctly stopped at the PG17 guard; it was closed and a
fresh isolated rehearsal was used. No failed hosted cutover occurred.

TypeScript passed; targeted ESLint passed with two existing hook warnings using
the repository's legacy ESLint configuration. `npm run build` passed, including
the new live API gate, compilation/typechecking and all 32 static pages; existing
hook/image/chart warnings remain. Package manifests/lockfiles are unchanged.
The pre-existing `next-env.d.ts` development-path change was preserved after build.
A representative PG17 copy,
two-session hosted concurrency, independently observed signed-JWT browser save, broader broker/edit/undo
coverage, restore rehearsal and full release gates remain unverified. The user
must reload an already-failed page to clear its schema-error transport latch.
This repair does not enable Delete All Data, purge, goal completion or Phase 3.

## Search clear and identical-entry regression (deployment request)

The owner confirmed saving works on localhost and requested deployment. The
double cross was the native WebKit search cancel control beside the application's
labeled clear button. A selector scoped to RecordSearch hides only the native
control; clearing restores input focus. Browser QA passes eight Ledger/Cash Flow
cases (TH/EN, 390/1440px), with one clear button and restored focus, and rendered
screenshots were inspected. QA output remains ignored/local.

The writer's existing request/row UUID scheme is retained. An additional database
regression proves two identical intentional expenses with distinct IDs both save,
while replaying each request does not double-debit. Actual form browser testing
also submits the same 153 expense twice after success and verifies two distinct
request IDs/row IDs and balance 694 from 1000. The full writer UI suite passes ten
cases, including uncertain-response retry and insufficient-funds handling. These
are isolated fixture tests, not new customer transactions. The search/unit suites
pass 25 tests and production build passes with existing warnings.

GitHub's existing main-to-Vercel Production integration is the deployment route.
Deployment success must be checked against the pushed commit, not inferred from
the local build; no database migration is run automatically by this build gate.
