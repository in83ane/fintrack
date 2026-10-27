# PLAN copy-only two-session harness

**Prepared offline only. No database execution has been authorized or performed.**
Offline tests validate the JavaScript guards and mocked orchestration, not SQL,
PostgreSQL locks, deployed grants, JWT integration, or a production schema.
Do not run the integration command until the owner supplies a disposable copy
and explicitly authorizes connections to it. Never use production credentials.

## Files and dependencies

`run.mjs` coordinates; `guard.mjs` checks the target; `fixture.mjs` seeds synthetic
identities; `competitors.mjs` defines the operations; `observe.mjs` proves waiting;
`assertions.mjs` checks financial results. These seams can support future races,
but goal completion/Phase 3/purge/FX are not implemented here.

`pg` is pinned to **8.23.1** in this directory's package and lockfile only.
Commands below for installation/tests do not connect to a database:

```powershell
Set-Location scripts/plan-copy
npm ci --ignore-scripts --no-audit --no-fund
npm test
npm run check
node run.mjs --help
```

Installation contacts the npm registry, not a database. Offline tests do not
import `pg`: they inject a mock `pg.Client`, including assertions that invalid
env/URL/endpoints cause **zero connect calls and zero client constructions**.
No command reads application `.env` files. Do not install at the app root.

## Prepare the copy manually — not automated by this harness

Keep copied schedulers, email/webhooks and **outbound networking blocked before
starting/restoring the copy**, and throughout this test. A preflight cannot undo
an HTTP request sent before it starts. Strip/disable copied credentials and
review auth/financial triggers for external side effects. Use a separate server
or Supabase project and a direct connection, not a transaction/session pooler.

The copy must already contain the approved schema through writer migration
`20261027131636`. This tool never restores, applies migrations, grants roles,
rewrites cached balances, changes schedulers, or purges users.

### 1. READ ONLY: verify the target and inspect schedulers/queues first

Only after independently confirming the copy's hostname/project in your admin
client, run the following **read-only inspection** there. These commands neither
disable jobs nor modify financial data. Do not copy a production connection URL
into this README or into logs.

```sql
select current_database(), session_user, inet_server_addr(), inet_server_port();
select to_regclass('cron.job') as cron_jobs,
       to_regclass('net.http_request_queue') as outbound_queue,
       to_regclass('vault.decrypted_secrets') as vault_view;
```

Run the next queries only when the corresponding relation exists. They return
IDs and safety classifications, **not job SQL, request headers/bodies or tokens**:

```sql
-- READ ONLY: cron job state and whether its command is an inert SELECT 1.
select jobid, active,
       command ~* '^\s*select\s+1\s*;?\s*$' as inert_command
from cron.job order by jobid;

-- READ ONLY: pending outbound request count/IDs; no payloads or headers.
select count(*) as pending_requests from net.http_request_queue;
select id from net.http_request_queue order by id;

-- READ ONLY: only the known worker URL secret is classified, never the token.
select id, name, decrypted_secret = 'https://disabled.invalid' as neutralized_url
from vault.decrypted_secrets where name = 'fintrack_price_alert_url';

-- READ ONLY: inspect seed-user trigger definitions locally before attesting.
-- Review output privately; custom trigger bodies can contain sensitive values.
select t.tgname, pg_get_triggerdef(t.oid), pg_get_functiondef(t.tgfoid)
from pg_trigger t where t.tgrelid = 'auth.users'::regclass and not t.tgisinternal;
```

Unknown/missing privileges, a pg_net/cron extension without its expected inventory
relation, any active job, any inactive non-inert job, a pending request, or a
worker URL other than `https://disabled.invalid` will stop the harness. This is
deliberately stricter than identifying only price-alert jobs: arbitrary SQL can
hide a network call behind a function/Vault indirection. It does not claim to
discover every external integration or prove outbound isolation.

### 2. COPY-ONLY MUTATIONS: neutralize only reviewed jobs/URLs/queue entries

The following are **templates for the operator**, not commands executed or
generated with real IDs by the harness. Substitute only the IDs you just read
from the disposable copy. Never run these on production. Keep outbound blocked.

```sql
-- MUTATES one reviewed copy cron row: disables it and removes executable SQL.
select cron.alter_job(job_id := <reviewed_job_id>,
                     active := false, command := 'SELECT 1');

-- MUTATES only the reviewed copy's worker URL secret, not its authorization token.
select vault.update_secret('<reviewed_worker_url_secret_uuid>'::uuid,
                           'https://disabled.invalid');

-- MUTATES only the reviewed copy's queued HTTP requests; NOT financial records.
-- Inspect IDs first; this does not cancel requests already dispatched.
delete from net.http_request_queue
where id in (<reviewed_request_id_list>) returning id;
```

If no corresponding object exists, skip its template. If there are duplicate
worker URL secrets, stop and resolve the copy's setup manually. Re-run all
read-only checks and confirm the queue stays empty. The harness never changes
cron/Vault/pg_net itself, and does not provide a bypass flag for these checks.
On a guard failure it prints a safe error code; use these read-only queries first,
then the relevant mutation template if you choose to change the copy.

### 3. COPY-ONLY MUTATIONS: create a manual marker after restore

Choose a new UUID v4 outside the harness (e.g. `[guid]::NewGuid()` in PowerShell).
Use the copy admin who will run the harness. Verify required permissions before
proceeding; do not grant anything on production. Review trigger side effects
before asserting `fixture_triggers_reviewed`.

```sql
-- MUTATES only a QA schema on the verified copy. Creates an operator attestation.
-- This is NOT an app migration and must never be created on production.
create schema plan_copy_guard;
revoke all on schema plan_copy_guard from public, anon, authenticated;
create table plan_copy_guard.identity (
  singleton boolean primary key default true check (singleton),
  copy_id uuid not null,
  database_name text not null,
  purpose text not null,
  outbound_disabled boolean not null,
  fixture_triggers_reviewed boolean not null,
  created_at timestamptz not null default clock_timestamp()
);
revoke all on plan_copy_guard.identity from public, anon, authenticated;
insert into plan_copy_guard.identity
  (copy_id,database_name,purpose,outbound_disabled,fixture_triggers_reviewed)
values ('<new-copy-uuid-v4>'::uuid,current_database(),
        'fintrack-disposable-concurrency-copy',true,true);

-- READ ONLY: confirm exactly one marker, and check the login can assume the app role.
select * from plan_copy_guard.identity;
select pg_has_role(session_user,'authenticated','MEMBER'),
       has_table_privilege(session_user,'auth.users','INSERT'),
       has_table_privilege(session_user,'bucket_private.links','SELECT'),
       has_table_privilege(session_user,'bucket_private.requests','SELECT');
```

The marker must be newly created after restoring this particular copy, not
inherited from another backup. It is an operator attestation, not cryptographic
proof that an administrator cannot point the script at a different database.
No automatic marker creation or permission escalation is available.

## Explicit environment (only when a copy is ready and connection is approved)

In PowerShell 7 use masked input so the connection URL is not echoed or stored
as a literal command in shell history. It still exists in this process's env;
use copy-only credentials and close the shell afterward. Do not paste secrets
into chat. Supply a URL with explicit user/password/host/port/database, **without
query parameters**; encode reserved characters in credentials.

```powershell
$env:PLAN_COPY_DATABASE_URL = Read-Host 'Copy-only PostgreSQL URL' -MaskInput
$env:PLAN_COPY_EXPECTED_HOST = '<independently-verified-copy-host>'
$env:PLAN_COPY_EXPECTED_PORT = '5432'
$env:PLAN_COPY_EXPECTED_DATABASE = '<copy-database-name>'
$env:PLAN_COPY_EXPECTED_LOGIN_ROLE = '<copy-admin-login>'
$env:PLAN_COPY_EXPECTED_SERVER_ADDRS = '<inet_server_addr-from-copy>'
$env:PLAN_COPY_ID = '<same-manually-created-copy-uuid-v4>'
$env:PLAN_COPY_CONFIRM = 'I_UNDERSTAND_THIS_IS_A_DISPOSABLE_COPY'
```

Multiple expected IP addresses may be comma-separated, with no wildcard. Server
address/port, database and login role are checked after connection; URL host/port,
database, role, known production project and confirmation are checked **before**
connection. Hosted TLS requires certificate verification; only loopback hosts
allow plaintext. A tunnel/NAT whose backend address/port does not match will
fail closed; do not loosen the guard to make a mismatch pass. PostgreSQL reports
a server IP, not necessarily the DNS name in your URL.

No fallback to app `DATABASE_URL`, `PGHOST`, `PGOPTIONS`, `.env`, Supabase keys or
app clients. Three dedicated `pg.Client`s start with
`default_transaction_read_only=on`. Only A/B use explicit `BEGIN READ WRITE`
after preflight. The observer remains read-only. Login must be a copy admin;
financial writes use `SET LOCAL ROLE authenticated` and the synthetic user's
claims, checked by `current_user`/`auth.uid()` before mutations. This does not
test signed JWTs/PostgREST. No automatic retry after uncertain commit results.

## Integration command — connects and writes synthetic fixtures; NOT RUN YET

```powershell
# MUTATES THE APPROVED COPY: creates fixtures and exercises the financial writer.
node scripts/plan-copy/run.mjs --run
```

Each of three rounds uses a new synthetic user, cash-management portfolio,
THB wallet opened with 1,000 via `save_cash_bucket`, and expense PLAN for 800 due
on DB Bangkok today. Fixed fixture FX 35 is supplied at the existing seam; no
quotes are fetched and no historical FX policy changes. Users have `.invalid`
emails and no login password. IDs are saved before writes/commit, with PLAN's
DB-generated UUID saved before the seed transaction commits. Crossing Bangkok
midnight aborts the run; use fresh fixtures next time, never reset old balances.

| Round | A | B while A holds | Release A | Expected B |
|---|---|---|---|---|
| 1 | PLAN debit 800 | Ledger debit 800 | Commit | Insufficient-balance rejection |
| 2 | Ledger debit 800 | PLAN debit 800 | Commit | Insufficient-balance rejection |
| 3 | PLAN debit 800 | Ledger debit 800 | Rollback | Commit once |

Observer polls fresh `pg_stat_activity`/`pg_locks` every 100 ms; requires B's
`wait_event_type='Lock'`, A in `pg_blocking_pids(B)`, and an ungranted B lock.
Sleeping alone is not evidence. Poll timeout 5s, connection timeout 5s, lock
timeout 15s, statement timeout 30s, client query timeout 35s, idle transaction
timeout 45s, run watchdog 180s. A is released only after observing the wait.
An expected failure must be `P0001` **and** `Insufficient bucket balance`;
timeouts, arbitrary P0001 errors or deadlocks are failures, not acceptance.

Each final result must be `200 / 200 / 1 / 1` for cache/native cash sum/debits/
withdraw mirrors. Opening deposit and its mirror are counted separately:
2 total cash rows, 2 total mirror rows. Checks/receipts match the winning path;
explicit links, native amounts, currency and orphan counts are checked using
fixture IDs only, never matched by note/date/amount. Failure stops later rounds.

## Evidence and retention

`reports/<run-uuid>.json` (gitignored) and the console summary contain pass/fail,
fixture IDs, per-round totals, timestamps and sanitized session-specific lock
snapshots. No connection URL, password, raw SQL, request headers, server error
detail or Vault tokens are logged. `40P01` is recorded as a deadlock; no server
log download or cluster-wide claim of deadlock freedom is made.

Ctrl+C, exceptions and watchdogs close all three connections; open transactions
are rolled back by the server. No automatic reconnect, repeat debit, global
backend termination or fixture deletion. If commit/close status is uncertain,
the report is failed/incomplete; inspect the recorded synthetic IDs on the copy.
Keep fixtures for inspection. Dispose/restore the whole copy manually afterward;
do not use the app's Delete All Data or delete `auth.users` to clean up.

## Still required before release

Real execution of these three rounds and the copy-only financial/grant audits;
full schema/FK compatibility; signed JWT/PostgREST and private-schema exposure;
broker/transfer/edit/undo concurrency; scheduler/egress isolation; migration
duration and recovery; coordinated DB+app cutover. This harness does not certify
these other release gates, and passing it does not unlock paused feature work.

References: [node-postgres transactions](https://node-postgres.com/features/transactions),
[PostgreSQL monitoring](https://www.postgresql.org/docs/current/monitoring-stats.html),
[pg_net](https://supabase.com/docs/guides/database/extensions/pg_net).
