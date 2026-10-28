# Local PostgreSQL copy evidence — 28 October 2026

This records observed files, offline tests and owner-run results. Latest result: **ผ่านบน local PostgreSQL 18 synthetic schema** in the three races below; this is not a passing real-copy/Supabase/PG17 certificate. The assistant has not connected to any database, executed SQL/PGlite, read application .env files, or run the integration CLI in this task. The owner runs all database commands. No goal completion, Phase 3, purge or FX work is resumed.

## Repository and validation snapshot

The read-only audit found HEAD 4aeffc202904db03b92111e0fc4cb0d776f6ff0c on codex/ledger-transitions, zero commits after 4aeffc2, and an empty index. At that audit the changes were uncommitted. Subsequently, the owner authorized two scoped local commits: tooling was committed as ca9f882 after npm test passed 110/110 and npm run check passed; the six documentation files are the separately authorized second commit. No push or database connection was performed. Whole-workspace status at that audit was 62 tracked modified files and 676 untracked files; these counts precede this approved documentation update and include unrelated app/QA work. They are not the proposed commit scope.

| Actual offline invocation | Tests | Pass | Fail |
|---|---:|---:|---:|
| node --test --test-reporter=tap offline.test.mjs | 86 | 86 | 0 |
| node --test --test-reporter=tap local-bootstrap.test.mjs | 24 | 24 | 0 |
| Combined in-memory TCP/TLS-blocked rerun | 110 | 110 | 0 |

Both named test commands ran from scripts/plan-copy. npm run check --prefix scripts/plan-copy also passed JavaScript syntax checks. Repeated executions do not increase the distinct test count: **110 = 86 + 24**. No tests were skipped or cancelled.

The audit's combined process replaced net.Socket.prototype.connect, net.connect, net.createConnection and tls.connect with a counter/throw function before importing the two test files, and synchronized builtin ESM exports. Its final output was **AUDIT_TCP_TLS_CONNECTION_ATTEMPTS=0**, with 110 passing tests. This is evidence for those test invocations, not an OS-wide network audit. Tests inject MockClient instead of a real pg.Client and keep report saves in memory. libpg-query parses text offline; it does not execute SQL or resolve database objects.

## Retained failed owner-run reports

All times below are **28 October 2026, Asia/Bangkok (UTC+07)**, converted from each report's UTC startedAt. All seven reports have passed=false, connectionsClosed=true and zero rounds. Every report uses copyId b7c6a6af-aa6b-4a61-8846-3f46bd655757.

| Run ID / original local report | Time | Reported mode | Error code / SQLSTATE | Fixture descriptors | Rounds |
|---|---|---|---|---:|---:|
| [c18ad8e7-81fd-4fbb-8f5a-33b1e226e58e](../scripts/plan-copy/reports/c18ad8e7-81fd-4fbb-8f5a-33b1e226e58e.json) | 06:44:00 | supabase-copy | LIVE_SERVER_MISMATCH | 0 | 0 |
| [25bc420e-bba7-4911-9c76-c71b7f2c7ca1](../scripts/plan-copy/reports/25bc420e-bba7-4911-9c76-c71b7f2c7ca1.json) | 06:44:26 | supabase-copy | LIVE_SERVER_MISMATCH | 0 | 0 |
| [9cfc7936-8f92-4c82-87b6-30b59a280120](../scripts/plan-copy/reports/9cfc7936-8f92-4c82-87b6-30b59a280120.json) | 06:45:09 | local-synthetic | LIVE_SERVER_MISMATCH | 0 | 0 |
| [bf9fc334-eac5-464f-8dfb-1ce7fc230cec](../scripts/plan-copy/reports/bf9fc334-eac5-464f-8dfb-1ce7fc230cec.json) | 06:46:09 | local-synthetic | LIVE_SERVER_MISMATCH | 0 | 0 |
| [4b9eb5fe-a52b-4c40-83cc-c2fd169360f7](../scripts/plan-copy/reports/4b9eb5fe-a52b-4c40-83cc-c2fd169360f7.json) | 06:47:34 | local-synthetic | LIVE_SERVER_MISMATCH | 0 | 0 |
| [1666b326-e44b-4cd9-88c6-5d2ad7c10492](../scripts/plan-copy/reports/1666b326-e44b-4cd9-88c6-5d2ad7c10492.json) | 06:48:03 | local-synthetic | LIVE_SERVER_MISMATCH | 0 | 0 |
| [27a69be8-e8be-4993-a948-6b088b882163](../scripts/plan-copy/reports/27a69be8-e8be-4993-a948-6b088b882163.json) | 06:49:18 | local-synthetic | DATABASE_OR_TRANSPORT_FAILURE / 42601 | 1 | 0 |

The first six stop at the live-server guard before fixtures. LIVE_SERVER_MISMATCH could represent address or port mismatch; those reports omit actual values and cannot independently distinguish the cause of each attempt. The owner subsequently supplied an IPv4 server address with a /32 host netmask: comparing that text directly with the expected host caused the address mismatch. Commit **83d786a** normalizes only host masks (IPv4 /32, IPv6 /128), compares ports numerically, and splits address/port/database/role mismatch codes without exposing actual identities. Exact host matching and the remaining guards stay enforced. The first two reports use the default supabase-copy mode; this does not prove they contacted a cloud server. These reports do not independently record enough endpoint identity to reconstruct every connection.

Run 27a69be8-e8be-4993-a948-6b088b882163 records server 18.6, three backend PIDs, bootstrap manifest SHA256 68db0e44d9154ba79f1047009ddc757488f3bb988eb0ae804d031fd51deb4ef0, and cron/pgNet/Vault as absent-not-exercised. It passes its recorded Preflight and stops during fixture setup with SQLSTATE 42601, day=null and plan=null. UUIDs are allocated before seed writes; one fixture descriptor is not evidence that rows were inserted. The report does not confirm rollback success or the current state of the database. It also lacks a runner source hash, so its Preflight result cannot certify the current runner revision.

### Raw report fingerprints

SHA256 values below were computed from the retained file bytes during this documentation update. They identify these artifacts, not the server that produced them or a signed attestation. Raw JSON reports remain gitignored under scripts/plan-copy/reports; links work only where those local files are retained. Do not force-add reports or bundles to the proposed commits.

| File | SHA256 |
|---|---|
| c18ad8e7-81fd-4fbb-8f5a-33b1e226e58e.json | `25259e98b5f23cedbcf09a09ab6df869ace1a8d0b12e2c73ff4be542ed8a0807` |
| 25bc420e-bba7-4911-9c76-c71b7f2c7ca1.json | `163dad01bd362d1b032c88805ce72adc2de74729b1da3a8c26449eb25cf2d9c9` |
| 9cfc7936-8f92-4c82-87b6-30b59a280120.json | `e79368f4165b4f3cb377707d110171cefaa914d65f6b3a3c95a088d655c66698` |
| bf9fc334-eac5-464f-8dfb-1ce7fc230cec.json | `854e3f7a3b9abee39471a9c20e2c62c291ce721b782bfeecf292435b61e32723` |
| 4b9eb5fe-a52b-4c40-83cc-c2fd169360f7.json | `a8da84be17432a233718f473cec371218913d1bd4afc0067423f6af4e2dcf255` |
| 1666b326-e44b-4cd9-88c6-5d2ad7c10492.json | `8525e9127fbf4e5ccc730c49040a996e084124e0dbae5efae6c31fba714b2169` |
| 27a69be8-e8be-4993-a948-6b088b882163.json | `add1c34259fb8e0a271609911f3de59f03a33692f9a4eaa78664f445ade1aad3` |

## Passing owner-run local synthetic result

**ผ่านบน local PostgreSQL 18 synthetic schema**: the assistant read the retained [eddd52e6-e1a9-4c96-b921-ba48ebe0e499.json](../scripts/plan-copy/reports/eddd52e6-e1a9-4c96-b921-ba48ebe0e499.json) report. The owner identifies this as the run after guard fix **83d786a**; the JSON does not itself attest the runner commit. It records passed=true, all three rounds passed=true, sessionErrors=[], and connectionsClosed=true.

| Report field | Recorded value |
|---|---|
| runId | eddd52e6-e1a9-4c96-b921-ba48ebe0e499 |
| copyId | a9498705-9893-4bd1-8318-6a88e83d4216 |
| mode / serverVersion | local-synthetic / 18.6 |
| startedAt (UTC) | 2026-10-28T00:42:51.452Z |
| finishedAt (UTC) | 2026-10-28T00:42:51.745Z |
| Asia/Bangkok start / finish | 28 October 2026, 07:42:51.452 / 07:42:51.745 |
| manifestSha256 | `68db0e44d9154ba79f1047009ddc757488f3bb988eb0ae804d031fd51deb4ef0` |
| Raw report SHA256 | `fa607bd46e89d646d98494319aa1782ed58e88714e39dc217ff748b6794ba84e` |

Two contender sessions (A/B) and a read-only observer supplied the following summarized evidence; full lock snapshots and backend identities are intentionally omitted. The financial tuple is **current_amount / cash_sum / debits / mirrors**. Checks and receipts refer to **checks / ledger_receipts**.

| Round / schedule | B waiting evidence | B outcome / SQLSTATE | Financial tuple | cash_rows / mirror_rows | checks / receipts | bad_cash_links / orphan_mirrors |
|---|---|---|---|---|---|---|
| 1: PLAN holds; Ledger waits | Snapshot 1: wait_event_type=Lock, wait_event=advisory, blocker=A, advisory ExclusiveLock granted=false | rejected_insufficient / P0001 | 200 / 200 / 1 / 1 | 2 / 2 | 1 / 0 | 0 / 0 |
| 2: Ledger holds; PLAN waits | Snapshot 2: wait_event_type=Lock, wait_event=advisory, blocker=A, advisory ExclusiveLock granted=false | rejected_insufficient / P0001 | 200 / 200 / 1 / 1 | 2 / 2 | 0 / 1 | 0 / 0 |
| 3: PLAN rolls back; Ledger waits then succeeds | Snapshot 1: wait_event_type=Lock, wait_event=advisory, blocker=A, advisory ExclusiveLock granted=false | committed_once / no bError recorded | 200 / 200 / 1 / 1 | 2 / 2 | 0 / 1 | 0 / 0 |

Round 2's first snapshot has no wait event, no blocker and no ungranted B lock; the second snapshot establishes the wait. All rounds record observedWaiting=true. In rounds 1–2, bError.code is DATABASE_OR_TRANSPORT_FAILURE with sqlstate=P0001; **bOutcome=rejected_insufficient** identifies the expected insufficient-balance rejection, rather than inferring it from the generic error code alone. No 40P01 is recorded anywhere in this report; this is not proof that deadlocks are impossible under other schedules.

Scope: Auth is emulated; no signed JWT, PostgREST or GoTrue is exercised. Preflight records cron, pgNet and Vault as **absent-not-exercised**. Migration 017 is replaced by the approved fresh-local empty-table guard, and five notification migration files are skipped. The prerequisite DDL is a **reconstruct**, not a certification of original DDL. Broker/transfer/edit/undo concurrency, actual Supabase grants/RLS and role audits, representative-copy migration runtime/locks, and PG17 behavior remain untested by this run. The result does not close the release blockers, including Delete All Data deployment/purge controls.

## Earlier bootstrap failures and runner correction

| Evidence | Finding | Limit |
|---|---|---|
| Owner message: bundle 45261baf-a75a-40c7-8502-065535d09267, apply line 360 | UTF-16LE trade_journal_schema.sql decoded as UTF-8; confirmed by byte inspection in the earlier turn | Original message did not provide SQLSTATE; old bundle is no longer present in the audited bundle directory |
| Owner message: bundle c95d11ea-04f9-4aaa-8f2f-208471a7a2f5, apply line 1610 | Source migration 017 contains only ASCII 3, joined to the next SET ROLE | Original message did not provide SQLSTATE; no recovered original 017 SQL |
| Retained b7c6a6af-aa6b-4a61-8846-3f46bd655757 bundle | 34 included sources; six exclusions; historical verification.json records 106 tests at generation time | No complete admin-script transcript; do not rewrite the historical verification as 110 |
| Fixture/actor date query | Bare ::date::text day fails PostgreSQL 18 raw parsing; ::date::text AS day parses | Offline reproduction identifies a concrete code defect; it is not a successful live rerun |

The runner correction is in [fixture.mjs](../scripts/plan-copy/fixture.mjs) and [competitors.mjs](../scripts/plan-copy/competitors.mjs): both use BANGKOK_TODAY_SQL with explicit AS day. [offline.test.mjs](../scripts/plan-copy/offline.test.mjs) parses every query submitted to the mock and checks all nine seed/A/B date calls across three rounds. [guard.mjs](../scripts/plan-copy/guard.mjs) again checks actual server address against the configured allowlist as well as the port. A previous working-tree version had omitted the address comparison; the restored comparison matches the baseline guard intent. The failure reports alone cannot establish which code revision ran or who changed it.

The later owner-run result above passes all three local synthetic races after the AS day correction and guard fix 83d786a. SQL bootstrap/manifest content was not changed by those runner/guard corrections. This does not justify reapplying bootstrap to an existing database or retrying a failed run.

## Reconstructed prerequisite accepted by the owner

[observed-schema-prerequisite.sql](../scripts/plan-copy/local/observed-schema-prerequisite.sql) is included after 008 and before 009. Owner acceptance covers the following structure only, **not a line-for-line or byte-for-byte match to original DDL**:

| Item | Definition inspected |
|---|---|
| Primary key | id uuid PRIMARY KEY DEFAULT gen_random_uuid() |
| User FK | user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE |
| Portfolio FK | portfolio_id uuid NULL REFERENCES public.portfolios(id) ON DELETE CASCADE |
| Type/label | type varchar NOT NULL; label varchar NOT NULL |
| Icon/time | icon varchar NOT NULL DEFAULT '🏷️'; created_at timestamptz NOT NULL DEFAULT now() |
| CHECK | user_categories_type_check; type is INCOME or EXPENSE |
| UNIQUE | user_categories_user_id_type_label_key (user_id,type,label) |
| Index 1 | idx_user_categories_user_type USING btree(user_id,type) |
| Index 2 | idx_user_categories_user_portfolio USING btree(user_id,portfolio_id) |
| RLS | ENABLE ROW LEVEL SECURITY |
| Policy | Users can manage their own categories; FOR ALL USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id) |
| Asset column | public.assets ADD COLUMN allocation text NULL |

This is a **reconstruct** from the owner's structure report, not the original migration. Grants, comments and additional triggers were not supplied or certified. No additional missing schema dependency was established by this offline audit; parser success does not establish catalog/runtime completeness. Corrupt 017 is replaced only for this fresh local bootstrap by an approved empty-table guard, and is not marked applied. Its original behavior remains unverified. Five notification/outbound migrations are additionally excluded.

## Accepted next step and remaining gates

The owner selected a NEW cluster/data directory on port 5432, retaining the entire old cluster without deletion. The later passing report records a new copy ID, but is not an OS/service inventory or a complete bootstrap transcript. Step 0 remains owner-run: identify service/data directory, port-owning process and whether other databases still need that cluster before any future fresh-cluster preparation. **No current service or database inventory is available to the assistant.** If other needed databases exist, do not stop their cluster; propose another port and obtain approval for the corresponding target/guard changes first. A differently named database in the existing cluster does not satisfy current freshness guards.

Follow [the operator runbook](local-postgres-copy-setup.md) with a new copy ID/bundle and return evidence at each checkpoint. A bootstrap or harness failure is terminal: retain reports/data, stop and review, then prepare a new cluster for any approved next attempt. No reset, drop, cleanup, guard bypass or repeat run on the failed database is authorized.

| Established | Still not established |
|---|---|
| Historical offline tests 110/110 and JavaScript checks | Passing representative Supabase/PG17 copy execution |
| Top-level SQL parsing and encoding checks | Function-body/catalog/permission correctness throughout execution |
| Owner report: real B lock waits and 200/200/1/1 in all three local synthetic races | Broker/transfer/edit/undo concurrency, timeout/deadlock/pool coverage |
| Recorded PG18.6 Preflight and passing local synthetic run | Current server state, OS/service inventory and complete bootstrap transcript |
| Enumerated reconstructed prerequisite | Complete production schema/grant/trigger parity |

REST/signed JWT/PostgREST/GoTrue, actual Supabase grants and role inheritance, private-schema API exposure, pg_cron/pg_net/Vault and outbound isolation, production-major behavior, legacy-data audits and other writer concurrency paths remain release gates. Passing the three local races does not certify those areas. Goal completion/Phase 3/purge/FX remain paused.
