# FinTrack project status — 28 October 2026

**Local commits only; not pushed or deployed. No copy database is available or authorized for connection.** Current work temporarily disables data reset in the new app, using offline mocks only. No SQL, including PGlite, is executed; no database connection is authorized.

| Area | Status / next gate |
|---|---|
| `5f66256` | Committed: existing notification migration chain tracked with deployed version names; no SQL reapplied. |
| `69df4f3` | Committed: atomic bucket writer and approved whole-file app/shared dependencies, tests, audits and guarded rollback. Historical Phase 2 migration unchanged. |
| `ee08705` | Committed: writer report's top status corrected. |
| `92bb583` | Committed: copy-only two-session harness and this status document; no live-copy run. |
| Previous local validation | Clean source worktree build passed with existing lint warnings, reusing installed dependencies (not fresh npm ci). PGlite writer 15, recovery 8, retry 8, PLAN writer 27/baseline 26; UI 9+8; net-worth/search 23 passed. These are not live-copy results. |
| Two-session tool | `scripts/plan-copy/`: three races using 2 contenders + 1 read-only observer, guarded synthetic fixtures and retained evidence. **59 offline tests passed**, plus JavaScript syntax checks; no DB driver connections or SQL execution. Awaits owner-prepared, isolated copy and separate connection authorization. Harness committed in `92bb583`; copy execution remains unapproved. |
| Copy audits | Pending: cash/cache/native reconciliation, unresolved/unlinked legacy records, exact grants/RLS/private API schemas, migration history and schema drift. No automatic repair or note-based matching. |

## Release blockers and PGlite limitations

- **Delete All Data/reset: disabled in the proposed new-app changes; not committed or deployed yet.** Settings retains a disabled button and visible TH/EN “ปิดชั่วคราว / Temporarily unavailable” explanation that data remains unchanged. The DELETE confirmation, destructive handler, local-storage removal, success toast and delayed reload have been removed (unrelated offline backup import is unchanged). `db.deleteAllUserData()` immediately returns `DATA_RESET_TEMPORARILY_DISABLED`, without RPC/Auth/network calls. **This protects only the new app; revoking the database RPC permission belongs to the future purge work.** Old app bundles or direct RPC callers are not disabled by this UI/helper change. No migration, database function or grants were changed. Release still requires approval/commit and deployment of this app version; never use the old purge to clean fixtures. No direct Auth-account deletion UI/endpoint was found in searched source.
- Reset validation: helper 6 cases / 12 invocations passed with RPC/Auth/network = 0; UI passed TH/EN × dark/light × 390/1280px (8 combinations, both route and skeleton = 16 renders). Working-tree `tsc --noEmit --incremental false` passed. Clean-checkout validation uses HEAD `92bb583` plus only the nine proposed files, shared installed dependencies (not fresh npm ci), synthetic environment values and a socket guard. Clean-checkout helper/UI tests, `tsc --noEmit --incremental false`, and `next build` passed (32/32 pages generated). Existing hook/image/chart warnings remain; no missing Settings dependency was found. The socket log contains only four allowed font connections and no database/other connection attempts. Settings' accepted older work moves the page into `SettingsView`, uses the already-committed `app-page-container`, and adds the static `SettingsSkeleton` re-export. The older confirmation-input focus-border change disappears with removal of that input. No other shared-file work is included.
- Pending real PostgreSQL two-session waiting, lock/statement timeouts, deadlocks, pool behavior, and broker/transfer/edit/undo concurrency. Serialized PGlite interleavings do not prove these.
- Pending full copy schema/FK/trigger compatibility, REST/signed JWT tests for anon/two synthetic users, role inheritance and `plan_private`/`bucket_private` API non-exposure. Mock clients do not prove SQL syntax or permissions.
- Pending scheduler/pg_net/Vault inspection and outbound isolation **before starting the copy**; disable/neutralize copied jobs/URLs manually. No real-user identities or remote endpoints may be exercised by fixtures.
- Pending migration runtime/locks on representative copy size, full backup/restore and guarded rollback rehearsal, DB+matching-app maintenance cutover and stale-session handling. Never restore legacy direct-write grants as a live compatibility bridge.
- Remaining older uncommitted work stays separate. Before deploy, review whole-topic groups, decide tracking of `output/`, `.impeccable/`, and `project_architecture_summary.md`, then validate the final release from a clean checkout.

## Paused work and explicit unlock conditions

| Paused item | Condition to resume |
|---|---|
| FX policy | User selects and approves policy (A preferred previously); then separate implementation/tests. Current rate selection and historical `rate_at_time` stay unchanged. |
| Account purge/self-service account deletion | Separate approval, copy FK inventory, admin-only transaction-bound context and archive/reversal bypass design, then copy security/cascade tests. Must pass before enabling self-service deletion; no purge in this tool. |
| Goal completion | Approved policy/spec exists; Phase 2/writer commit prerequisite is complete. Remains explicitly paused: require user instruction to resume and separate migration/history/lock tests. This tool does not implement it. |
| Phase 3: remaining search, unlimited-end habit behavior, ICS | Remains paused until user review of Phase 2 and explicit scope/resume approval. Existing search helpers and Phase 1 `ends_on=NULL` support do not imply Phase 3 acceptance. |

Runbook: [copy harness](../scripts/plan-copy/README.md). Financial design, recovery and deployment checklist: [writer report](plan-phase2-bucket-writer.md). **Offline test success is never reported as a passed copy/database test.**
