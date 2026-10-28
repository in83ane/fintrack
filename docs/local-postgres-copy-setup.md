# Local synthetic PostgreSQL runbook (operator-run only)

This is **not a restored Supabase project**. Use only a separate, fresh Windows PostgreSQL instance with synthetic fixtures. The assistant has not connected to any database, executed SQL (including PGlite), or run `run.mjs --run`. It must not do so under the current authorization.

Approved target: `127.0.0.1:5432`, database `fintrack_local_test`, login `fintrack_tester` (non-superuser). Owner-run report `27a69be8-e8be-4993-a948-6b088b882163` records actual server version 18.6, separately from the reported psql version. This is historical failed-run evidence, not a current inspection. Generated guards require server major 18 and the exact target. PG18 differs from the previously recommended PG17: SQL, planner, locking/catalog/permissions and extension behavior may differ. Passing here is not proof on the production server major.

## 0. Approved next attempt: new cluster, old data retained

The owner selected a **new data directory/cluster on port 5432**, retaining the entire old cluster without deletion. Step 0 is owner-run and still pending: identify the service/data directory and process listening on 5432, and establish whether any databases in the old cluster are still needed. The assistant has not inspected running services or connected to that cluster and cannot claim that it is safe to stop.

If other needed databases exist, **do not stop their cluster**. Report the conflict and propose a separate cluster on a different port; changing the hard-coded target and guards requires a separate approval. Do not silently switch ports or weaken identity checks. With the current code, creating another database name in the old cluster is insufficient: creation rejects existing user databases and bootstrap-role collisions, and the target database is fixed to `fintrack_local_test`.

After Step 0 is reviewed, the owner alone performs the approved service/cluster preparation. Use a new copy ID and freshly generated bundle/marker for the new cluster. Keep the failed database and its evidence intact. Return evidence and stop at each gate: (0) existing service/port/database inventory; (1) new cluster identity, loopback/PG18 and standard databases; (2) unprivileged runner with no memberships; (3) new bundle ID/hash; (4) admin-create exit code, database owner and role graph; (5) admin-apply exit code and all 34 manifest entries, zero auth users/markers, schema/trigger review; (6) exactly one approved marker; (7) non-secret runner configuration; (8) harness JSON and exit code. No step authorizes an assistant database connection. Failure at any bootstrap/harness stage is terminal; do not retry on that database.

The [evidence record](local-postgres-copy-evidence.md) distinguishes 110 passing offline tests from all seven failed owner-run attempts. No passing real result after the `AS day` fix is recorded.

## 1. Isolate the instance before connecting

**OS configuration changes, not database queries (operator only):** set `listen_addresses = '127.0.0.1,::1'` and `port = 5432` in this separate instance's `postgresql.conf`. Restart that Windows service. Do not change an unrelated instance's service/configuration. The harness intentionally accepts only numeric IPv4 `127.0.0.1` for this approved local target, not DNS aliases or remote addresses.

In this instance's `pg_hba.conf`, use SCRAM rules scoped to the local runner/database and temporary admin maintenance connections, with `127.0.0.1/32` or `::1/128`; do not use `trust`. Review existing first-match rules and remove broad remote access on this test instance. Set Windows firewall/egress isolation before loading any schema. No SMTP, webhooks, Edge Functions, cron, pg_net, Vault, FDW servers or subscriptions are needed here.

References: [PostgreSQL connection settings](https://www.postgresql.org/docs/18/runtime-config-connection.html), [pg_hba.conf](https://www.postgresql.org/docs/18/auth-pg-hba-conf.html).

## 2. Read-only identity/inventory first

**Read-only queries, operator-run, no mutation:** open psql with `-X` (ignore psqlrc), explicit `-h 127.0.0.1 -p 5432 -d postgres -U <temporary_admin> -W`. Enter the password at the prompt; never put it in a command or report. Before *each* later mutation, verify database, loopback address, port and server version again. The generated scripts repeat those checks server-side.

```sql
SELECT current_database(),session_user,current_user,inet_server_addr(),inet_server_port(),version();
SHOW listen_addresses;
SHOW port;
SELECT datname,pg_get_userbyid(datdba) AS owner FROM pg_database ORDER BY datname;
SELECT rolname,rolcanlogin,rolsuper,rolbypassrls,rolcreatedb,rolcreaterole,rolreplication
FROM pg_roles WHERE rolname IN ('fintrack_tester','fintrack_local_owner','anon','authenticated','service_role');
SELECT parent.rolname AS parent,child.rolname AS member,m.admin_option,m.inherit_option,m.set_option
FROM pg_auth_members m JOIN pg_roles parent ON parent.oid=m.roleid JOIN pg_roles child ON child.oid=m.member
WHERE child.rolname='fintrack_tester';
SELECT extname,extversion FROM pg_extension ORDER BY extname;
SELECT nspname FROM pg_namespace WHERE nspname IN ('cron','net','vault');
SELECT to_regclass('cron.job'),to_regclass('net.http_request_queue'),to_regclass('vault.decrypted_secrets');
```

If unexpected databases, roles or outbound objects exist: **stop**. Do not bypass guards or modify those objects to get a pass. This local bootstrap refuses any pre-existing user database (including an empty `fintrack_local_test`) during creation. If you already created that name, report its inventory and obtain a separate preparation decision; no auto-drop/reset/reuse is provided.

## 3. Prepare the offline bundle

**Offline file reads / local artifact writes only, no DB connections:** from the repository root:

```powershell
npm test --prefix scripts/plan-copy
npm run check --prefix scripts/plan-copy
node scripts/plan-copy/local-bootstrap.mjs --plan
$copyId = [guid]::NewGuid().ToString()
node scripts/plan-copy/local-bootstrap.mjs --emit --copy-id $copyId
```

Review `scripts/plan-copy/reports/local-bootstrap/<copyId>/manifest.json` and all three `.psql` files before running them. The directory is gitignored and cannot be overwritten by the generator. Keep the generated bundle/checksums with the evidence. Regenerate into a new ID if sources change; do not silently edit the reviewed bundle. Source bytes are strictly decoded as UTF-8 or BOM-marked UTF-16 LE/BE. Only a leading encoding BOM is removed; malformed bytes, interior BOM, NUL, replacement characters and UTF-32 are rejected. Output is UTF-8 without BOM and LF. The manifest records raw-byte SHA256, source encoding/BOM removal and LF-normalized complete-text SHA256. Each migration's BEGIN/COMMIT boundaries are preserved. This proves which source was packaged, **not that the database still matches that source**.

Encoding incident: original bundle `45261baf-a75a-40c7-8502-065535d09267` incorrectly decoded the UTF-16LE `trade_journal_schema.sql` as UTF-8, causing replacement characters/NUL at apply line 360. Retain it only as failure evidence, do not run it again. Corrected bundle `f3ec6f76-0848-482f-81f2-d55f0c42c804` is a **full fresh bootstrap, not a resume/recovery script**. Existing partial schema/cluster roles remain blocked by the freshness guards. Do not rerun onto the partial database, skip earlier sources, delete/reset objects or edit its marker/hash without a separately reviewed recovery plan. No database recovery was performed by this task.

Syntax incident: bundle `c95d11ea-04f9-4aaa-8f2f-208471a7a2f5` embedded the complete corrupt migration `017_name_legacy_default_cash_accounts.sql`, whose only byte is ASCII `3` (hex `33`). Line 1609 was joined to the next `SET ROLE` statement, so psql reported the error at line 1610. This was not encoding contamination. Available Git history also contains only `3`; the original migration cannot be reconstructed from it.

The owner explicitly approved a **local fresh-database-only exception**: replace 017 in the local manifest with `local/empty-legacy-accounts.sql`, which raises `LOCAL_017_REQUIRES_EMPTY_LEGACY_TABLES` if any auth users, portfolios, brokerage accounts or brokerage cash entries exist. The corrupt migration remains unchanged as evidence; its path, exact raw hash, reason and replacement are recorded in `manifest.json.skipped`. It is never recorded as applied. The original legacy rename remains unverified; this exception does not repair the production migration. If the original source bytes change, generation stops with `LOCAL_017_EXCEPTION_REQUIRES_REVIEW` so a recovered migration cannot be silently skipped.

Retained prior bundle: `scripts/plan-copy/reports/local-bootstrap/b7c6a6af-aa6b-4a61-8846-3f46bd655757/`. Manifest SHA256: `68db0e44d9154ba79f1047009ddc757488f3bb988eb0ae804d031fd51deb4ef0`. Its copy ID belongs to the previous attempt; generate a NEW ID/bundle for the approved new cluster. `verification.json` records artifact hashes, offline parsing and **106 tests at bundle creation time**; preserve that historical record. The later runner audit passed **110 = 86 + 24**. Generated bytes are UTF-8 without BOM/NUL/replacement characters and LF. The generator executed no SQL; later owner-run harness failures are separately recorded in the evidence document.

Generation now parses every included SQL source and assembled script using pinned `libpg-query@18.2.1` (PostgreSQL 18 WASM raw parser), before creating an output directory. For assembled scripts, only generated psql directives and the prompt-variable syntax are adapted in memory for parsing; emitted SQL is unchanged. This catches top-level syntax errors such as `3` and malformed joins. It does **not** execute SQL, parse function bodies, resolve tables/types, or validate runtime permissions. Tests of JavaScript syntax alone do not validate SQL. A failure remains terminal; retain the failed bundle and partial database for inspection, and use a separately prepared fresh isolated instance for the next full bootstrap. No resume, reset, role cleanup or database execution is performed by the generator.

Ordered manifest: auth emulation → both root schema files → migrations 002–008 → observed-schema prerequisite → 009–016 → local empty-legacy guard instead of corrupt 017 → 018–023 → local baseline grants → six PLAN/writer migrations (20261027070148, 20261027070606, 20261027075524, 20261027081807, 20261027084140, 20261027131636) → observer/seeder grants.

The complete included source files are embedded, not excerpts from PGlite fixtures. There is no test-clock override. Besides corrupt 017, five notification migrations are explicitly excluded: `price_email_alerts`, `price_email_schedule`, `price_email_security`, `price_email_generated_ids`, `persistent_notifications`. The last depends on the first group. Record all exclusions as **not exercised**, not passed.

## 4. Admin provisioning, then leave the runner unprivileged

The existing `fintrack_tester` must be LOGIN, NOSUPERUSER, NOBYPASSRLS, NOCREATEDB, NOCREATEROLE, NOREPLICATION, with no memberships before provisioning. If it differs, stop for review rather than automatically altering it. Do not give it ownership or admin credentials. Set its password interactively with psql `\password fintrack_tester` only if needed; that is a **manual role mutation** on the verified isolated instance.

Use a separate temporary **admin session**, never elevate the runner. Admin creates the database and cluster roles. `service_role` is NOLOGIN/BYPASSRLS solely to model migration grants; the runner is never a member. `fintrack_local_owner` is NOLOGIN/NOBYPASSRLS and owns schema/functions. `authenticated` and `anon` are NOLOGIN/NOBYPASSRLS. Role names already present cause provisioning to stop.

**Mutates the verified local instance, operator-run:** execute `01-admin-create.psql` as admin against `postgres`, after the identity checks. It requires a typed confirmation and rejects pre-existing target/user databases. It creates roles, grants only SET (not INHERIT/ADMIN) membership in authenticated to the runner, creates the new template0 database, and gives the runner CONNECT. CREATE DATABASE is outside a transaction; if it fails after roles were created, stop and retain evidence. No rerun/cleanup is automatic.

**Mutates the verified new local database, operator-run:** execute `02-admin-apply.psql` as admin against `fintrack_local_test`. It refuses existing application schemas, relations, functions, types, extensions other than plpgsql, foreign servers or subscriptions. It installs uuid-ossp in `extensions`, switches to the schema owner and applies the full manifest. A failure is terminal: ON_ERROR_STOP stops the script; previously committed migrations may remain. Do not retry onto the partial database, add missing objects ad hoc, or relax guards. Report the failing source/SQLSTATE without credentials.

The runner receives only: CONNECT; SET ROLE authenticated; INSERT synthetic auth users; SELECT financial result tables via **local-only observer policies**; SELECT two private evidence tables and guard metadata; schema USAGE needed for those checks. It gets no CREATE/CREATEROLE/BYPASSRLS, private writer execution, or marker writes. App actions still SET ROLE authenticated and exercise its RLS/grants. Local baseline grants are explicitly labeled and applied **before** the writer's final revocations; no broad grants are restored afterward.

`uuid-ossp` is a trusted extension and can be installed by a non-superuser with database CREATE, but this runbook keeps provisioning separate so the runner never needs CREATE. Role creation and BYPASSRLS setup require the appropriate privileged admin. See [CREATE ROLE](https://www.postgresql.org/docs/18/sql-createrole.html) and [uuid-ossp](https://www.postgresql.org/docs/18/uuid-ossp.html).

Command templates (operator only; replace admin name and bundle path, no secrets in commands):

```powershell
# MUTATES local cluster / creates NEW database:
psql -X -h 127.0.0.1 -p 5432 -U <temporary_admin> -W -d postgres -f <bundle>/01-admin-create.psql
# MUTATES NEW local database / full bootstrap:
psql -X -h 127.0.0.1 -p 5432 -U <temporary_admin> -W -d fintrack_local_test -f <bundle>/02-admin-apply.psql
```

## 5. Inspect, then create your marker manually

**Read-only, on the verified local target:** repeat identity/extension/role checks. Inspect installed triggers (including auth user → profile creation) before confirming fixture safety:

```sql
SELECT current_database(),session_user,inet_server_addr(),inet_server_port(),version();
SELECT * FROM plan_copy_guard.applied ORDER BY ordinal;
SELECT * FROM plan_copy_guard.bootstrap;
SELECT count(*) AS synthetic_users_before_first_run FROM auth.users;
SELECT n.nspname,c.relname,t.tgname,pg_get_triggerdef(t.oid)
FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE NOT t.tgisinternal AND n.nspname IN ('auth','public') ORDER BY 1,2,3;
```

There must be zero auth users before the first marker. Check that no triggers/functions contact outside services. Absence of cron/net/Vault does not prove absence of arbitrary external code: review the manifest/instance too.

**Mutates local guard metadata, operator-run:** only after that review, run `03-admin-marker.psql` as admin against `fintrack_local_test`; it requires the second typed confirmation. It inserts the copy ID chosen in step 3 and refuses existing markers/users or the wrong bootstrap hash. The bootstrap itself never creates the approval marker.

## 6. Masked runner configuration and three races

**Local process environment only; no DB connection yet.** Use PowerShell 7, no transcript/screen recording of secrets. No `.env` is loaded. Fill only the generated ID/hash, never a real project credential:

```powershell
$env:PLAN_COPY_MODE = 'local-synthetic'
$env:PLAN_COPY_CONFIRM = 'I_UNDERSTAND_THIS_IS_A_DISPOSABLE_COPY'
$env:PLAN_COPY_EXPECTED_HOST = '127.0.0.1'
$env:PLAN_COPY_EXPECTED_PORT = '5432'
$env:PLAN_COPY_EXPECTED_DATABASE = 'fintrack_local_test'
$env:PLAN_COPY_EXPECTED_LOGIN_ROLE = 'fintrack_tester'
$env:PLAN_COPY_EXPECTED_SERVER_ADDRS = '127.0.0.1'
$env:PLAN_COPY_ID = '<copyId from reviewed manifest>'
$env:PLAN_COPY_MANIFEST_SHA256 = '<sha256 from reviewed manifest>'
$runnerSecret = Read-Host 'Local fintrack_tester password' -AsSecureString
$runnerCredential = [pscredential]::new('fintrack_tester', $runnerSecret)
$env:PLAN_COPY_DATABASE_URL = 'postgresql://fintrack_tester:' + [uri]::EscapeDataString($runnerCredential.GetNetworkCredential().Password) + '@127.0.0.1:5432/fintrack_local_test'
```

**Mutates synthetic fixtures on the local target; operator-run only:**

```powershell
try {
  node scripts/plan-copy/run.mjs --run
} finally {
  Remove-Item Env:PLAN_COPY_DATABASE_URL -ErrorAction SilentlyContinue
  Remove-Variable runnerCredential,runnerSecret -ErrorAction SilentlyContinue
}
```

Do not print env/config or the URL. All three rounds still require 200/200/1/1, real B waiting via pg_blocking_pids, and P0001 `Insufficient bucket balance` in commit rounds; rollback round requires B to commit once. Use the existing audit SQL **read-only** as a separate operator action; audit access outside the harness's narrow grants may require admin. Synthetic audit findings do not characterize legacy user data. Keep fixtures/reports; no auto cleanup or purge.

## 7. Guard failures and evidence

Seven retained owner-run JSON reports failed: six `LIVE_SERVER_MISMATCH` and one SQLSTATE `42601`. All have zero rounds and `connectionsClosed: true`. Full IDs, timestamps, SHA256 hashes and interpretation limits are in [the evidence record](local-postgres-copy-evidence.md). The guard code alone does not reveal whether the actual address or port mismatched; do not guess or bypass it.

Run `27a69be8-e8be-4993-a948-6b088b882163` failed with SQLSTATE `42601`, `day: null`, and no rounds. The runner's first fixture query used the invalid bare alias `::date::text day`. The offline PostgreSQL 18 parser reproduces that syntax error; `::date::text AS day` parses. `fixture.mjs` and `competitors.mjs` now share the corrected Bangkok-date query. IDs are allocated before seed queries, so their presence in the report is not evidence that rows were inserted. This incident does not establish an incompatibility in the money writer or PG18-specific financial behavior.

The offline protocol tests now parse every submitted query, not just bootstrap SQL. They also enforce the live server-address allowlist: a local edit had removed that check while retaining only the port comparison; the check has been restored. No database connection, retry, recovery or cleanup was performed during this fix. The bootstrap SQL and manifest hash are unchanged; this is a runner-code fix, not a reason to reapply `02-admin-apply.psql`. Retain the failed report and follow the terminal-failure/fresh-instance procedure before any operator-run test.

Existing guard errors in the cloud checklist still apply. Additional failures:

| Code | Meaning / safe action |
|---|---|
| INVALID_COPY_MODE | Use the documented explicit mode; never auto-fallback. |
| LOCAL_LOOPBACK_REQUIRED / LOCAL_SERVER_ADDRESS_REQUIRED / LOCAL_TARGET_MISMATCH | Wrong local host/backend allowlist/name/port/runner; correct to the approved target, not a broader allowlist. |
| LOCAL_MANIFEST_HASH_REQUIRED / ENV_MANIFEST_SHA256_REQUIRED | Copy the hash from the reviewed bundle; do not invent a hash. |
| LOCAL_SERVER_VERSION_MISMATCH | Actual server is not PG18; stop and review version policy. |
| LOCAL_RUNNER_PRIVILEGES_UNSAFE | Runner has elevated attributes/membership; review admin setup, do not grant more. |
| LOCAL_UNEXPECTED_CAPABILITIES | Unexpected extension/schema/FDW/subscription; stop and investigate isolation. |
| LOCAL_BOOTSTRAP_MISMATCH / LOCAL_MARKER_WRITABLE | Wrong bootstrap/marker or writable marker; stop for admin review. |
| VAULT_INVENTORY_UNAVAILABLE | Extension inventory inconsistent; never interpret as absent/pass. |
| BOOTSTRAP_SOURCE_MISSING / BOOTSTRAP_SOURCE_HASH_MISMATCH / SOURCE_PSQL_COMMAND_FORBIDDEN | Missing/changed/unexpected source; stop and review the manifest, no substitutions. |
| SOURCE_ENCODING_UNSUPPORTED / SOURCE_ENCODING_INVALID / SOURCE_ENCODING_CONTAMINATION | Unsupported/malformed source encoding or hidden BOM/NUL/replacement characters. Stop and inspect original bytes; never strip unknown bytes or run a partial bundle. |
| SOURCE_SQL_SYNTAX_INVALID / SOURCE_SQL_EMPTY | Offline PostgreSQL raw parsing failed or the source has no SQL statements. Repair the source before regenerating; do not run the failed bundle. |
| LOCAL_017_EXCEPTION_REQUIRES_REVIEW | Original corrupt 017 bytes changed; review the local exception instead of silently skipping a potentially restored migration. |
| LOCAL_017_REQUIRES_EMPTY_LEGACY_TABLES | Data exists where the local 017 exception requires empty tables. Stop; do not delete rows or bypass the guard. |
| LOCAL_ENDPOINT_MISMATCH / BOOTSTRAP_DATABASE_FORBIDDEN | Wrong endpoint/database for the operation; stop. |
| TEMPORARY_ADMIN_SESSION_REQUIRED | Provisioning is separate from runner execution; use the authorized temporary admin session only. |
| LOCAL_CONFIRMATION_REQUIRED | Read the script/review first, then type the exact requested confirmation. |
| FRESH_INSTANCE_REQUIRED_NO_EXISTING_TARGET_OR_USER_DATABASES / EMPTY_DATABASE_REQUIRED_NO_REUSE | Target/instance not fresh; no auto-drop/reset. Report inventory for a new preparation decision. |
| LOCAL_ROLE_COLLISION_REQUIRES_REVIEW / EXISTING_RUNNER_MUST_BE_UNPRIVILEGED_AND_WITHOUT_MEMBERSHIPS | Existing role graph differs; no automatic role repair. |
| LOCAL_DATABASE_OWNER_MISMATCH / MARKER_REQUIRES_UNUSED_SYNTHETIC_DATABASE | Wrong owner or already-used database; stop, do not clear rows. |

Reports now classify each cron/pgNet/Vault capability as `present-and-checked` or `absent-not-exercised`; absent queues have count null, not a fabricated zero. Errors fail closed. Include mode, actual server version, manifest hash and skipped migrations when returning the results template.

## Schema drift and remaining release gates

`public.user_categories` and `public.assets.allocation` are owner-reported production schema drift absent from tracked schema/migrations. `local/observed-schema-prerequisite.sql` reconstructs the supplied DDL after 008 and before 009. It is **not the original DDL**; grants, comments and additional triggers were not supplied/verified. Do not treat successful local bootstrap as a complete production schema inventory.

The owner accepts the enumerated reconstructed structure (CHECK, UNIQUE, FKs, two indexes, RLS policy, icon default '🏷️', and `allocation text NULL`), **not a line-for-line match** to original DDL. No additional missing dependency was established by the offline audit; completeness of runtime/catalog dependencies remains unverified.

Before deploy, propose a separate owner-operated **read-only schema comparison**: export `pg_dump --schema-only` for public/plan_private/bucket_private from each database using explicit reviewed connections. Capture constraints, indexes, policies, functions, triggers, ownership and grants; do not use `--no-acl` to hide grant drift. Compare exports offline and classify local-only Auth/observer/guard differences separately. Production export requires separate authorization; this task neither connects nor runs it. Raw dumps may contain sensitive function bodies/URLs/comments: keep private, send only redacted object-level differences. A read-only catalog query using `pg_get_functiondef`, `pg_get_triggerdef`, `pg_policies`, `pg_indexes` and `information_schema.columns` is another operator-run option.

PG18 multi-session tests can show real lock waits, commits/rollbacks, exact debit/mirror totals and observed deadlocks for tested scenarios. They do not prove JWT/PostgREST/Auth, actual Supabase grants/role inheritance, extension services, production-major behavior, legacy data reconciliation, or absence of all deadlocks. None of goal completion/Phase 3/purge/FX is resumed.
