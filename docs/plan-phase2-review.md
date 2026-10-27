> Superseded for concurrency by [the atomic Bucket writer report](plan-phase2-bucket-writer.md). The approved writer is now implemented locally; both stale-Ledger orders pass. The two-session procedure below is the historical bug reproduction, **not** the current acceptance procedure. Use the linked report for RPC-based acceptance, release gates and recovery. Purge and FX policy remain deferred.

# Phase 2 migration review — 27 October 2026

No new commit, remote SQL, shared Ledger change or phase-3 work. Existing commit `d642355` is unchanged in history; this review's edits are unstaged working-tree changes.

## 1. Clear derived fields before computation — fixed

At the start of `apply_money_check`, reset `cash_id`, `bucket_activity_id`, `destination_cash_id`, `destination_activity_id`, `source_bucket_id`, `destination_bucket_id`, `month_key`, `group_key` to NULL. Also clear derived `currency` and `money_mode` for the habit early return. The trigger then computes the legitimate snapshots; monthly zero-value checks retain their **computed** source/month/group, never the caller's supplied values.

Tests attempt INSERT with each of the eight columns under normal authenticated grants: all are denied. A rolled-back test temporarily grants those insert columns and submits forged nonexistent UUIDs/old month/arbitrary group to independently exercise the trigger. Habit checks clear all eight; sub-cent split zero checks and weekly extras retain only the legitimate computed source/month/group and create no financial links. No ACL changes are made in the migration.

`node scripts/plan-phase2-db-test.mjs`: **27 cases passed** (26 prior cases plus the forged-field regression).

## 2. Account deletion — fails, proposal only

`node scripts/plan-phase2-review-test.mjs` creates a savings monthly goal, one paid check, one month lock and one system-wallet mapping in isolated PGlite, then runs admin `DELETE FROM auth.users` with `auth.uid() = NULL`.

Observed:

```text
SQLSTATE P0001: Archive this plan to preserve financial history
user remains; checks=1, locks=1, wallet mappings=1 (statement rolled back)
```

The first blocker is the existing `public.validate_daily_plan_rule` DELETE guard on `daily_plans`. Separately, an admin direct DELETE of the check with NULL identity fails in `undo_money_check` with `P0001: Unauthorized`. The fixture includes the actual PLAN migrations/FKs, not the complete hosted Auth/storage/account deletion graph. The full copied schema must still be tested.

**Do not simply skip undo whenever `auth.uid()` is NULL.** That would also permit unrelated privileged deletes to bypass reversal. It also would not fix the plan history guard and RESTRICT references.

Proposed approach, awaiting approval:

1. Inventory the complete account-owned FK graph on a disposable copy, including existing trading/broker data.
2. Implement one server/admin-only account-purge transaction with explicit target user and a private transaction-bound deletion context. Ordinary authenticated/anon clients must not create/activate this context; a client-settable GUC or trigger depth alone is insufficient authorization.
3. In that authorized purge context only, bypass the normal plan archive guard and skip financial **reversal** because all of that user's records are being erased. Delete check references first, locks/status/rule history and system-wallet mappings, then plans/financial legs/buckets and remaining account children in FK-safe order, then Auth user. The exact order must follow the full graph.
4. Preserve existing normal undo and cross-user checks outside purge. Test full rollback on failure, two-user isolation, anonymous/direct-delete denial and regular undo after the change.

No deletion guard, cascade or undo authorization was changed in this review.

## 3. FX source — differs from the current Add Record path

| Path | How `rate_at_time` is selected |
|---|---|
| PLAN migration | Most recent positive rate in the **same bucket**, ordered by transaction `date DESC, created_at DESC`; USD forced to 1. No cutoff relative to the check date, and no live quote fetch |
| Ledger Add Record | Ledger imports `AddCashflowModal`. The modal uses current `exchangeRates[inputCurrency]` from AppContext; THB legacy USD amount is `rawAmount / exchangeRates.THB`. AppContext stores the supplied rate unchanged |
| Ledger/Cash Flow display | `transactionMoney` prefers the row's recorded FX (`fxRateTHB`, then `rateAtTime`), falls back to current quote only if no valid stored rate. Same-currency display uses native amount |

References: `AddCashflowModal.tsx` around 186–187, 245 and 265; `AppContext.tsx` around 4016; `LedgerView.tsx` 14/143; `cashflow-selectors.ts` 68–89; the migration's `rate_at_time` query.

Example: 100 THB with a bucket's last rate 34 and current app rate 35 produces PLAN legacy USD ≈2.9412 versus modal ≈2.8571. Native THB debit is 100 in both, but USD conversion can differ. Thus the earlier claim of the same recorded-FX convention only describes storage/formula, **not equivalent rate selection**.

No FX logic changed. A follow-up should choose one authoritative quote snapshot source for both writers, record its value/time, and define unavailable/stale/backdated behavior. Do not silently replace historical rate snapshots during this review.

## 4. Read-only bucket audit — added and tested

Run `scripts/plan-bucket-audit.sql` in SQL Editor/psql against the intended copy. It explicitly opens a **READ ONLY** transaction and makes no repairs.

- Result 1: bucket IDs, owner/portfolio IDs, currency, cached amount, comparable native cash sum, difference, mismatch flag, unresolved and unknown-type counts.
- Result 2: offending activity IDs and reason arrays: missing original amount, currency mismatch, sub-cent amount, non-finite amount, unknown type, owner mismatch. No note/email content is returned.
- Only INCOME/DEPOSIT add and EXPENSE/WITHDRAW subtract. A bucket with unresolved/unknown rows has `expected_current_amount = NULL`, so the script does not invent a trustworthy balance by treating missing/unknown values as zero. `known_cash_subtotal` is diagnostic only in that case.
- Clean buckets produce no rows; an empty bucket with nonzero cached balance is flagged. Under an owner login RLS limits the audit to visible rows; use authorized admin access for a project-wide read-only audit.

The isolated review test checks clean data, a one-unit cache mismatch, NULL original amount, mismatched currency, 0.001 amount and unknown type, and verifies that financial rows are unchanged afterwards. No real user data was scanned in this review.

## 5. PLAN vs normal Ledger expense — fails current acceptance

Code evidence:

- AddCashflowModal checks `bucket.currentAmount` from client state before saving.
- `addCashActivity` sends a plain cash INSERT. Then the modal calls `updateMoneyBucket` and `addBucketActivity` separately (not a single DB transaction/RPC), using `Math.max(0, oldClientBalance - debit)` for the cache.
- PLAN locks the source row and uses a per-owner advisory lock, but this cannot force the normal Ledger writer to participate in the same balance protocol.

The local deterministic interleaving test performs exactly the stale-snapshot sequence of those statements:

| Step | Result |
|---|---|
| Ledger reads bucket | 1,000 THB; form passes 800 THB client check |
| PLAN commits an 800 THB expense | Native balance 200 |
| Ledger submits its already-validated 800 THB expense | Accepted by current SQL path |
| Ledger writes stale cache | `current_amount=200`, but cash rows sum to **−600** |

This is a reproduced failure, **not** a passing concurrency test. PGlite has one connection; real simultaneous PostgreSQL sessions were not available locally (`psql`, `postgres`, `docker` absent). The same schedule can be run on a copy as below.

Proposed fix before deployment: all bucket debits, including Ledger, must enter the same DB-side balance lock/check and atomic financial-entry/cache update protocol. Prefer a shared transactional writer/RPC; prevent clients from bypassing it through plain cash INSERT/cache UPDATE grants, or enforce an equivalent central trigger. Scope includes normal expenses, withdrawals, transfers, edits/deletes and reversal. Merely adding another lock inside PLAN or clamping the UI to zero does not fix the overdraft. This shared Ledger change is not implemented without approval.

### Two-session reproduction on a disposable copy

Use a dedicated test user and fresh THB bucket funded with **exactly 1000** native units; create an expense PLAN for **800 per check**, due today with no check today. Obtain that test user's UUID, bucket UUID, cash-management portfolio UUID and plan UUID. Never run this against a real user's bucket. Use two interactive psql sessions to the **copy**, with the same parameters:

```powershell
psql $env:PLAN_COPY_DATABASE_URL -v ON_ERROR_STOP=1 -v owner_id=TEST_USER_UUID -v bucket_id=TEST_BUCKET_UUID -v portfolio_id=TEST_CASH_PORTFOLIO_UUID -v plan_id=TEST_PLAN_UUID
```

Session B — establish the same client snapshot before starting A:

```sql
set role authenticated;
select set_config('request.jwt.claim.sub', :'owner_id', false);
select current_amount as cached_start from public.money_buckets where id=:'bucket_id' \gset
\echo starting balance :cached_start
-- Must be 1000. Do not SELECT FOR UPDATE here: the existing UI does not lock.
```

Session A — start PLAN and **leave this transaction open**:

```sql
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', :'owner_id', true);
insert into public.plan_checks(plan_id,day)
values(:'plan_id', (now() at time zone 'Asia/Bangkok')::date);
-- Leave open. Start the next INSERT in B, then COMMIT here.
```

Session B — submit the ordinary cash INSERT while A is open. It may wait on an FK/row lock; commit A from the other session to release it:

```sql
insert into public.cash_activities(user_id,portfolio_id,bucket_id,type,amount,category,note,date,is_transfer,currency,rate_at_time,original_amount)
values(:'owner_id',:'portfolio_id',:'bucket_id','EXPENSE',800/35.0,'QA','copy-only race probe',now(),false,'THB',35,800);
-- A: COMMIT; now continue B's separate requests, as the current modal does:
update public.money_buckets set current_amount=greatest(0,:cached_start::numeric-800) where id=:'bucket_id';
insert into public.bucket_activities(user_id,portfolio_id,bucket_id,type,amount,note,date,currency,rate_at_time,original_amount)
values(:'owner_id',:'portfolio_id',:'bucket_id','withdraw',800,'copy-only race probe',now(),'THB',35,800);
select b.current_amount,
 (select sum(case when a.type in ('INCOME','DEPOSIT') then a.original_amount when a.type in ('EXPENSE','WITHDRAW') then -a.original_amount else 0 end)
  from public.cash_activities a where a.bucket_id=b.id) cash_sum
from public.money_buckets b where b.id=:'bucket_id';
```

After a future fix, the second debit must be rejected atomically (or one writer must fail/retry safely), only one 800 debit may remain, both balances must be 200, and there must be no orphan bucket activity. Test both orderings. Restore/discard the disposable copy afterwards; no cleanup script deletes arbitrary user data.

## 6. Duplicate empty response — verified in real UI

The browser harness now commits the first check, simulates its lost response, executes the same INSERT again (trigger returns NULL / zero rows), and delivers only the duplicate empty response to PLAN. Four combinations use `{data: [], error: null}` and four use `{data: null, error: null}`.

**8/8 passed**: one check, one debit, correct checkbox after reload, no error toast, and undo remains usable. PlanView checks `result.error`, then refreshes/reloads authoritative data rather than assuming an inserted row exists. No production UI change was needed.

## Commands/results

```powershell
node scripts/plan-phase2-db-test.mjs       # 27 passed
node scripts/plan-phase2-review-test.mjs   # audit passed; two explicit unresolved findings
node scripts/plan-phase2-ui-test.mjs       # 8 passed, 8 duplicate empty responses
```

Only the derived-field reset, tests, read-only audit and documentation changed. Account-deletion handling, FX selection and Ledger concurrency fixes remain proposals. Phase 2 is **not ready to deploy** until the deletion/concurrency issues are addressed and the FX policy is agreed.
