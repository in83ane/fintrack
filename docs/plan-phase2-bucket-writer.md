# Phase 2 — atomic Bucket writer review

Status: implementation and local verification complete for the approved concurrency scope. **Not deployed, not committed; no hosted SQL or real user data touched. Phase 3 and account purge remain deferred.** FX selection remains unchanged pending the user's decision.

## What changed and why

The reproduced race was `client reads 1000 → PLAN spends 800 → Ledger inserts another 800 → client writes cached 200`, leaving native cash sum **−600**. UI clamping and locking only PLAN could not serialize those independent requests.

New migration `20261027131636_bucket_atomic_writer.sql` supplies a single private financial writer, `bucket_private.write_rows`. All approved Bucket paths call it inside their database transaction:

| App/DB path | New entry point |
|---|---|
| Ledger expense/income/deposit/withdraw, Cash Flow CSV, assistant record | `write_bucket_cash` create |
| Bucket allocation/profit distribution | same RPC, one distribute batch |
| Bucket↔Bucket transfer | same RPC, paired withdraw/deposit, one request |
| Ledger edit/delete and transfer reversal | same RPC, explicit link/group, net-effect validation |
| PLAN check/undo | existing triggers delegate to private writer |
| Bucket↔broker funding/reversal | existing three broker RPC signatures, delegate to private writer |
| New wallet opening balance | `save_cash_bucket`, explicit opening cash event |
| Wallet metadata/delete | `save_cash_bucket` / `remove_empty_cash_bucket`; never direct balance overwrite |

The writer takes the existing PLAN per-owner advisory lock (`hashtextextended(auth.uid()::text,761)`) before locking affected Bucket rows and cash rows. Broker paths additionally take the broker advisory lock before its account/entry locks. PLAN statement triggers acquire the owner lock before row-level PLAN triggers. It reads native cash rows, rejects unresolved history/cache disagreement, checks the **complete net effect**, then writes cash + mirror + cache atomically. Any exception rolls back every leg and request receipt.

Money input is validated **before** assigning into `numeric(18,4)` records, so `1.00001` cannot silently become `1.00`. Distributions use integer cents and give their final nonzero destination the remainder. No existing row is rounded/repaired.

The migration replaces functions in a transaction, then activates guards/revokes at its end. Direct INSERT/UPDATE/DELETE/TRUNCATE and column INSERT/UPDATE privileges are removed for PUBLIC/anon/authenticated on the three financial tables. Private schema usage/function execution is denied; private tables have RLS and no client policies. A private `(backend PID, transaction ID, owner)` context allows only trusted writers through triggers; a client-set GUC cannot create this context. SECURITY DEFINER RPCs check auth and ownership, with an empty search path. `service_role`/database administrators remain privileged operators, not supported client identities.

## Effects on existing Ledger / Cash Flow

- Success refreshes financial data; rejection shows an explicit insufficient-funds or audit-required message, retaining the form. No optimistic debit/clamp or separate mirror write remains in the active paths.
- UI balance checks are only early feedback. A stale 1000 balance cannot authorize an 800 expense after PLAN has spent 800.
- Auto-distribution now creates one real income/deposit per receiving wallet in a single transaction, instead of an unassigned income plus separately written transfer deposits. Aggregate income stays the original amount; wallet attribution now follows the actual allocation. Same-currency validation remains required. Zero shares produce no rows.
- Metadata editing no longer sends a stale `currentAmount` or attempts to change currency. New opening balances create both financial rows and the cache in the same transaction.
- Explicit links alone allow financial edits/reversals. Existing Ledger cash/mirror pairs without explicit IDs stay readable but are **blocked from edits/deletion**. We never infer identity from note, date or matching amount. Pre-existing PLAN IDs and exact broker ID links can be imported without modifying their financial data; inconsistencies are still rejected at use.
- Transfers must be reversed as a pair; individual transfer legs cannot be edited. Reversal fails if money has already been spent at the destination (including PLAN and broker reversals).
- Rates are supplied at one writer seam. Ledger/Add Record still uses its existing current-rate input; PLAN still chooses the latest eligible Bucket rate (USD=1). Broker withdrawal keeps its original USD snapshot before native cent rounding. Metadata edits preserve historical `amount`; edits cannot change historical currency/rate.
- Old `addTradeFromBucket` is already blocked by the provider; its dormant partial-write body was removed. Users fund the broker with the atomic transfer RPC and then trade. Mirror-only helpers fail closed. Anonymous financial mutations require login; they do not masquerade as DB writes.
- A legacy purge/reset function that directly deletes these tables will now fail closed. **Keep account deletion/reset unavailable** until the separate admin purge/FK-context work is approved and tested. This round does not implement or weaken purge guards.

## Retry behavior

`createBucketCommander` keeps a request ID, original row IDs, time and FX snapshot for an uncertain response. The pending envelope survives reload in tab sessionStorage; a retry of the same business-day form replays exactly that request. A different operation is blocked while its result is uncertain. After success a deliberate repeated submission is a new transaction. SQL rejection discards the failed request so the user can correct/retry it. Server receipts reject request-ID reuse with a different payload. If browser storage is unavailable, in-memory retry protection still works during that mount; cross-tab/cleared-storage retries require checking Ledger first. This is not an offline financial queue.

## Local verification

All commands use temporary PGlite databases and local browser fixtures, not Supabase remote:

| Suite | Result |
|---|---|
| `node scripts/bucket-writer-db-test.mjs` | 15 cases passed: both 800/800 orders; request deduplication; edits/deletes; transfers/distribution; opening balance; broker funding/reversal; native currency validation; auth/owner/column/table grants; forged GUC/obsolete privileged writer blocked |
| `node scripts/bucket-writer-recovery-test.mjs` | 8 cases passed: schema down/up before usage; unresolved/cache/sub-cent/type/currency rejection; read-only link/grant audit; downgrade refuses after use |
| `node scripts/bucket-command-test.mjs` | 8 cases passed: response loss, reload, changed-input block, intentional repeat, in-flight deduplication, SQL error retry, exact-cent splitting and invalid inputs |
| `node scripts/plan-phase2-db-test.mjs --writer` | 27 passed; main PLAN cases use the new writer. The final three phase-2 historical/downgrade controls deliberately use independent prior-schema copies. Legacy sub-cent undo is **blocked under the new writer**, not certified by the historical control. |
| `node scripts/plan-phase2-review-test.mjs` | Both interleavings now pass, cash sum/cache 200 with one debit and one mirror; read-only audit passes. Deferred account-delete probe still reports failure/rollback explicitly. |
| `node scripts/plan-phase2-ui-test.mjs` | 8 combinations passed, 8 empty duplicate check responses; TH/EN × dark/light × 390/1280px, using new DB writer |
| `node scripts/bucket-writer-ui-test.mjs` | 9 passed: Add Record stale balance, lost response retry and 1.01 split in all 8 language/theme/width combinations; real Bucket transfer page submits one pair. No page errors. |
| `npx tsc --noEmit`; `npm run build` | Passed; build includes existing hook/image lint warnings (see `output/bucket-writer/build.log`) |

Browser fixtures render the **real form, Bucket page and shared retry/error helpers**, with an isolated provider/HTTP adapter to PGlite. They do not prove deployed Supabase REST/JWT integration or a live AppContext session. Test fixtures include the existing broker validation/mutation triggers and native numeric precisions, but not every production extension/FK/job. Screenshots and UI JSON are in `output/bucket-writer/`; PLAN screenshots remain in `output/plan-phase2/`.

## What PGlite cannot establish

Single-session sequential interleavings establish the correct DB balance decision after the first commit; they do **not** establish PostgreSQL two-session waiting, deadlock freedom, pool behavior, statement-timeout behavior, production migration duration, REST grants/JWT claims, RLS under the deployed role graph, or all remote schema drift. These remain release gates on a disposable PostgreSQL/Supabase copy. Also exercise concurrent broker trade/funding/reversal, opposite-direction transfers, edits and PLAN undo. Inspect `pg_locks`/deadlock logs under load. No `psql`, local PostgreSQL server or Docker was available here.

## Two-session acceptance on a disposable copy

Restore a full backup to a separate test project/server; disable email, external jobs/webhooks and copied credentials. Verify the target host/project before connecting. Apply this migration only after its phase-2 prerequisites on that copy. Use a dedicated synthetic user, cash-management portfolio, a fresh THB wallet opened with exactly 1000 through `save_cash_bucket`, and an expense PLAN for 800 due today. Do not reuse a real user's balance or repair a copy by changing cache directly.

Open two psql sessions to **the copy** with identical fixture IDs:

```powershell
psql $env:PLAN_COPY_DATABASE_URL -v ON_ERROR_STOP=1 -v owner_id=TEST_USER_UUID -v bucket_id=TEST_BUCKET_UUID -v portfolio_id=TEST_CASH_PORTFOLIO_UUID -v plan_id=TEST_PLAN_UUID
```

In both sessions:

```sql
set role authenticated;
select set_config('request.jwt.claim.sub', :'owner_id', false);
select current_amount from public.money_buckets where id=:'bucket_id'; -- 1000
```

Session A (PLAN first), leave open:

```sql
begin;
insert into public.plan_checks(plan_id,day)
values(:'plan_id',(now() at time zone 'Asia/Bangkok')::date);
-- Do not commit until B is waiting.
```

Session B (Ledger, using its stale pre-A form balance):

```sql
select public.write_bucket_cash(gen_random_uuid(),jsonb_build_object(
 'op','create','rows',jsonb_build_array(jsonb_build_object(
 'id',gen_random_uuid(),'portfolio_id',:'portfolio_id'::uuid,
 'bucket_id',:'bucket_id'::uuid,'type','EXPENSE','original_amount',800,
 'currency','THB','rate_at_time',35,'date',now(),'category','QA','note','copy-only concurrency test'))));
```

B must wait. In A execute `COMMIT;`. B must fail with `P0001 / Insufficient bucket balance`. In autocommit B has no partial transaction; if testing with explicit BEGIN, issue ROLLBACK after the expected failure. Then:

```sql
select b.current_amount,
 (select sum(case when a.type in ('INCOME','DEPOSIT') then a.original_amount
                  else -a.original_amount end)
  from public.cash_activities a where a.bucket_id=b.id) cash_sum,
 (select count(*) from public.cash_activities a where a.bucket_id=b.id and a.type='EXPENSE') debits,
 (select count(*) from public.bucket_activities a where a.bucket_id=b.id and a.type='withdraw') mirrors
from public.money_buckets b where b.id=:'bucket_id';
-- Required: 200, 200, 1, 1.
```

Repeat on a **new synthetic wallet/plan**: A opens a transaction and runs the Ledger RPC, B attempts the PLAN INSERT, then A commits. B must wait then reject with the same result. Also repeat with A rolling back: B must succeed once and leave 200. Do not reset balances in place. Run `scripts/bucket-writer-audit.sql` as copy administrator to confirm no new orphan/mismatched legs; known old unlinked rows are separate audit findings.

## Coordinated deployment checklist (not executed)

1. Review/approve changes; keep phase 3 and purge disabled. Resolve FX policy separately. Group the old uncommitted shared work by complete topic before deployment, decide `output/`, `.impeccable/`, architecture-summary tracking, and test a **clean git worktree checkout**. Current dirty-tree build is not that acceptance.
2. Back up DB and app release; restore and verify a disposable copy. Inventory function definitions/grants/triggers and migration history on the copy, including manual `broker-cash-corrections.sql` functions. Check that `bucket_private`/`plan_private` are absent from exposed API schemas; run the existing exposure checker with copy settings and the new SQL grant audit. Test real JWT requests for anon and two synthetic users.
3. Run `scripts/plan-bucket-audit.sql` read-only before deployment and the link/grant audit on the migrated copy. Report legacy unlinked rows, wrong currencies/types, sub-cent rows and cache differences. They remain blocked; no note matching or automatic reconciliation. Confirm the expected user-facing impact before release.
4. Run all local suites plus the two-session procedures on the copy. Test broker transfers/reversals against the complete schema, request retries, REST access, and large-data migration/lock duration. The recovery fingerprint scans financial tables; measure this on the copy.
5. Enter maintenance mode for **all writers**, drain requests, stop financial workers/jobs and old browser sessions. Build/stage the app artifact. A frontend banner alone does not stop already-open tabs/API calls; enforce the maintenance gate at the service/DB entry layer with deployment tooling and verify no in-flight writers.
6. Apply the new migration in its single transaction, then activate the matching app before opening writes. Do **not** grant old direct-write permissions as a compatibility bridge. Reload the PostgREST schema cache through the normal deployment procedure, force stale app sessions to reload, and smoke-test synthetic fixtures while maintenance remains active.
7. Verify grant/link audit, cash/mirror/cache equality, insufficient-balance rejection, both transfer sides, PLAN check/undo and retries. Reopen writers only when DB and app agree. Observe error/deadlock rates and rejected unresolved histories.

## Recovery

`supabase/rollbacks/20261027131636_bucket_atomic_writer.down.sql` restores captured prior function definitions and client grants **only before financial usage**. Its guard checks both request receipts and an install-time financial fingerprint while taking exclusive locks. Tested down/up on a disposable DB with no data changes. It restores the older concurrency behavior, so keep maintenance closed; this is a recovery step, never a live workaround.

If the migration transaction fails, PostgreSQL rolls back that transaction; do not apply a manual partial undo. If new financial activity exists, the downgrade refuses. Keep writers closed, preserve the current DB backup, and either forward-fix or restore the **complete** approved pre-release backup + matching app with an explicit reconciliation plan for post-release activity. Do not selectively delete receipts, links or transactions to bypass the guard; do not run the prior PLAN rollback beneath this writer.

## Files for this concurrency change

- `supabase/migrations/20261027131636_bucket_atomic_writer.sql`
- `supabase/rollbacks/20261027131636_bucket_atomic_writer.down.sql`
- `src/lib/bucket-command.ts`, `src/lib/supabase.ts`
- `src/context/AppContext.tsx`
- `src/components/AddCashflowModal.tsx`, `src/components/AIFinancialAdvisor.tsx`
- `src/app/(app)/budget/BucketView.tsx`, `src/app/(app)/ledger/LedgerView.tsx`
- `scripts/bucket-writer-db-fixture.mjs`, `scripts/bucket-writer-db-test.mjs`, `scripts/bucket-writer-recovery-test.mjs`, `scripts/bucket-command-test.mjs`
- `scripts/bucket-writer-ui-fixture.tsx`, `scripts/bucket-writer-ui-test.mjs`, `scripts/bucket-writer-audit.sql`
- `scripts/plan-phase2-db-test.mjs`, `scripts/plan-phase2-review-test.mjs`, `scripts/plan-phase2-ui-test.mjs`
- This report and the supersession note in `docs/plan-phase2-review.md`.

Existing dirty changes—including `20261027084140_plan_atomic_money.sql` from the previous review—were not staged or committed. The concurrency implementation is in the **new** migration, not patched into an applied migration.

References checked: [Supabase function security](https://supabase.com/docs/guides/database/functions), [PostgreSQL locking](https://www.postgresql.org/docs/current/explicit-locking.html). Remote documentation was read; no remote database was queried or changed.

## Commit preparation — 27 October 2026

The seven-line snapshot-reset patch in the historical Phase 2 migration was restored to commit d642355. The reset remains in the new atomic-writer migration. The privileged forged-reference regression runs with `plan-phase2-db-test.mjs --writer`; baseline Phase 2 tests do not claim that later hardening. The original diff is retained locally in `output/bucket-writer/commit-validation/old-migration-review.patch`.

The approved commit candidate is validated from HEAD plus an explicit file manifest, without copying environment files or user data. Validation outcomes are recorded below before committing.

Candidate validation: production build passed with synthetic HTTPS configuration and existing lint warnings; writer DB 15, recovery 8, retry 8, PLAN with writer 27, historical PLAN 26, writer UI 9, PLAN UI 8. Both serialized 800/800 interleavings reject the second debit and retain 200. This does not prove real concurrent PostgreSQL sessions. Account purge remains deferred and the diagnostic still rejects deletion.

### Approved manifest extensions — 28 October 2026

The user approved the four whole-file dependencies (`src/lib/net-worth-chart.ts`, `src/lib/format.ts`, `supabase/functions/price-email-alerts/index.js`, `supabase/functions/price-email-alerts/core.js`) and subsequently approved `src/components/MoneyValue.tsx`. The complete net-worth/record-search suites now pass all 23 tests, including the dynamically loaded money typography component. No test was removed or weakened to hide a missing dependency.

The integration commit includes whole shared files and their existing presentation/loading/search work, not selected hunks. It depends on the preceding commit tracking the five previously applied notification migrations. Tracking these migrations and worker sources does not deploy them, schedule jobs, or enable email. The historical scheduler contains a project-specific URL; a disposable PostgreSQL/Supabase copy must have outbound scheduling disabled or safely redirected before replaying it. PGlite writer fixtures do not validate pg_cron/pg_net/Vault deployment.

The historical Phase 2 migration has no content changes from HEAD (line-ending normalization aside). All snapshot-reset hardening is in the new writer migration. Phase 2 baseline tests pass 26 cases; writer-mode tests pass 27 including the forged-reference defence.

Commit protocol: add each manifest path individually, compare the complete cached file list against that commit's manifest, review cached diffs, then commit. Do not include environment files, output artifacts, unrelated routes, or goal completion. After both commits, validate the committed tree in an isolated clean worktree; keep the original dirty checkout intact. Production deployment remains gated on the copy-only two-session/security checks above.
