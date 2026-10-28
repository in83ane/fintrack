// OFFLINE GENERATOR ONLY: no pg import, network, environment files or subprocesses.
// The operator reviews and runs generated psql scripts manually, in order.
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve, join } from 'node:path';
import { UUID, requireSafe, safeError } from './guard.mjs';
import { loadManifest, sha256, assertCleanSql } from './local-manifest.mjs';
import { assertSqlSyntax, assertGeneratedSyntax, SYNTAX_VALIDATION } from './local-syntax.mjs';

export const TARGET = Object.freeze({ host: '127.0.0.1', port: 5432, database: 'fintrack_local_test',
 runner: 'fintrack_tester', serverMajor: 18 });
const header = `\\set ON_ERROR_STOP on
\\set VERBOSITY terse
\\encoding UTF8
-- MUTATES LOCAL SYNTHETIC DATABASE ONLY. Review before running; never production.
SET statement_timeout='30s';
SET lock_timeout='10s';
SET idle_in_transaction_session_timeout='60s';
SET timezone='Asia/Bangkok';
`;
export function identityGuard(database) {
 requireSafe(['postgres', TARGET.database].includes(database), 'BOOTSTRAP_DATABASE_FORBIDDEN');
 return `DO $local_guard$ BEGIN
 IF current_database() <> '${database}' OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet
 OR inet_server_port() IS DISTINCT FROM 5432 THEN RAISE EXCEPTION 'LOCAL_ENDPOINT_MISMATCH'; END IF;
 IF current_setting('server_version_num')::int NOT BETWEEN 180000 AND 189999
 THEN RAISE EXCEPTION 'LOCAL_SERVER_VERSION_MISMATCH'; END IF;
 IF NOT (SELECT rolsuper FROM pg_roles WHERE rolname=session_user)
 THEN RAISE EXCEPTION 'TEMPORARY_ADMIN_SESSION_REQUIRED'; END IF;
END $local_guard$;
`;
}

export function buildBundle(manifest, copyId) {
 requireSafe(UUID.test(copyId), 'INVALID_COPY_ID');
 requireSafe(/^[a-f0-9]{64}$/.test(manifest.sha256), 'LOCAL_MANIFEST_HASH_REQUIRED');
 const provision = header + identityGuard('postgres') + `
\\prompt 'Confirm fresh isolated instance: type CREATE_NEW_LOCAL_SYNTHETIC_DATABASE: ' local_confirmation
SELECT set_config('plan_copy.confirmation', :'local_confirmation', false);
DO $provision_guard$ BEGIN
 IF current_setting('plan_copy.confirmation') <> 'CREATE_NEW_LOCAL_SYNTHETIC_DATABASE'
 THEN RAISE EXCEPTION 'LOCAL_CONFIRMATION_REQUIRED'; END IF;
 IF EXISTS(SELECT FROM pg_database WHERE datname NOT IN ('postgres','template0','template1'))
 THEN RAISE EXCEPTION 'FRESH_INSTANCE_REQUIRED_NO_EXISTING_TARGET_OR_USER_DATABASES'; END IF;
 IF EXISTS(SELECT FROM pg_roles WHERE rolname IN ('fintrack_local_owner','anon','authenticated','service_role'))
 THEN RAISE EXCEPTION 'LOCAL_ROLE_COLLISION_REQUIRES_REVIEW'; END IF;
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='fintrack_tester' AND rolcanlogin
 AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication)
 OR EXISTS(SELECT FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.member WHERE r.rolname='fintrack_tester')
 THEN RAISE EXCEPTION 'EXISTING_RUNNER_MUST_BE_UNPRIVILEGED_AND_WITHOUT_MEMBERSHIPS'; END IF;
END $provision_guard$;
BEGIN;
CREATE ROLE fintrack_local_owner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE anon NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE authenticated NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE service_role NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION BYPASSRLS;
GRANT authenticated TO fintrack_tester WITH INHERIT FALSE, SET TRUE, ADMIN FALSE;
COMMIT;
-- CREATE DATABASE cannot be inside a transaction. No automatic recovery/delete.
CREATE DATABASE fintrack_local_test OWNER fintrack_local_owner TEMPLATE template0;
REVOKE ALL ON DATABASE fintrack_local_test FROM PUBLIC;
GRANT CONNECT ON DATABASE fintrack_local_test TO fintrack_tester;
`;

 let apply = header + identityGuard(TARGET.database) + `
DO $empty_guard$ BEGIN
 IF (SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname=current_database()) <> 'fintrack_local_owner'
 THEN RAISE EXCEPTION 'LOCAL_DATABASE_OWNER_MISMATCH'; END IF;
 IF EXISTS(SELECT FROM pg_namespace WHERE nspname NOT IN ('public','information_schema') AND nspname !~ '^pg_')
 OR EXISTS(SELECT FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public')
 OR EXISTS(SELECT FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public')
 OR EXISTS(SELECT FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public')
 OR EXISTS(SELECT FROM pg_extension WHERE extname<>'plpgsql')
 OR EXISTS(SELECT FROM pg_foreign_server) OR EXISTS(SELECT FROM pg_subscription)
 THEN RAISE EXCEPTION 'EMPTY_DATABASE_REQUIRED_NO_REUSE'; END IF;
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='fintrack_tester' AND rolcanlogin
 AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication)
 OR pg_has_role('fintrack_tester','fintrack_local_owner','MEMBER')
 OR pg_has_role('fintrack_tester','service_role','MEMBER')
 THEN RAISE EXCEPTION 'LOCAL_RUNNER_PRIVILEGES_UNSAFE'; END IF;
END $empty_guard$;
-- Admin installs extension; runner receives no CREATE/CREATEROLE or ownership.
CREATE SCHEMA extensions AUTHORIZATION fintrack_local_owner;
CREATE EXTENSION "uuid-ossp" WITH SCHEMA extensions;
CREATE SCHEMA auth AUTHORIZATION fintrack_local_owner;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
SET ROLE fintrack_local_owner;
CREATE SCHEMA plan_copy_guard;
CREATE TABLE plan_copy_guard.applied (ordinal integer PRIMARY KEY,path text UNIQUE NOT NULL,sha256 text NOT NULL);
CREATE TABLE plan_copy_guard.bootstrap (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton), environment text NOT NULL,
 manifest_sha256 text NOT NULL, server_major integer NOT NULL, purpose text NOT NULL
);
CREATE TABLE plan_copy_guard.identity (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),copy_id uuid NOT NULL,database_name text NOT NULL,
 purpose text NOT NULL,outbound_disabled boolean NOT NULL,fixture_triggers_reviewed boolean NOT NULL
);
`;
 for (const [i,f] of manifest.files.entries()) {
   assertCleanSql(f.sql);
   requireSafe(/^[\w/.-]+$/.test(f.path) && /^[a-f0-9]{64}$/.test(f.sha256) && sha256(f.sql)===f.sha256, 'BOOTSTRAP_SOURCE_HASH_MISMATCH');
   requireSafe(!/^\s*\\/m.test(f.sql), 'SOURCE_PSQL_COMMAND_FORBIDDEN');
   assertSqlSyntax(f.sql, f.path);
   apply += `\n-- BEGIN SOURCE ${f.path} SHA256 ${f.sha256}\nSET ROLE fintrack_local_owner;\nSET search_path=public,extensions;\n${f.sql}\n`;
   // Existing migration transaction boundaries remain intact; do not strip BEGIN/COMMIT.
   apply += `SET ROLE fintrack_local_owner;\nINSERT INTO plan_copy_guard.applied VALUES(${i+1},'${f.path}','${f.sha256}');\n`;
 }
 apply += `
INSERT INTO plan_copy_guard.bootstrap VALUES(true,'local-synthetic','${manifest.sha256}',18,'fintrack-disposable-concurrency-copy');
RESET ROLE;
-- Success does NOT create the operator's copy marker. Review triggers first.
SELECT current_database(),current_setting('server_version'),count(*) AS manifest_entries FROM plan_copy_guard.applied;
`;
 const marker = header + identityGuard(TARGET.database) + `
\\prompt 'After reviewing triggers, roles and outbound inventory, type APPROVE_LOCAL_SYNTHETIC_MARKER: ' local_confirmation
SELECT set_config('plan_copy.confirmation', :'local_confirmation', false);
BEGIN;
DO $marker_guard$ BEGIN
 IF current_setting('plan_copy.confirmation') <> 'APPROVE_LOCAL_SYNTHETIC_MARKER'
 THEN RAISE EXCEPTION 'LOCAL_CONFIRMATION_REQUIRED'; END IF;
 IF EXISTS(SELECT FROM auth.users) OR EXISTS(SELECT FROM plan_copy_guard.identity)
 THEN RAISE EXCEPTION 'MARKER_REQUIRES_UNUSED_SYNTHETIC_DATABASE'; END IF;
 IF NOT EXISTS(SELECT FROM plan_copy_guard.bootstrap WHERE singleton AND environment='local-synthetic'
 AND manifest_sha256='${manifest.sha256}' AND server_major=18)
 OR (SELECT count(*) FROM plan_copy_guard.applied) <> ${manifest.files.length}
 THEN RAISE EXCEPTION 'LOCAL_BOOTSTRAP_MISMATCH'; END IF;
END $marker_guard$;
SET LOCAL ROLE fintrack_local_owner;
INSERT INTO plan_copy_guard.identity VALUES(true,'${copyId}','fintrack_local_test',
 'fintrack-disposable-concurrency-copy',true,true);
COMMIT;
`;
 for(const sql of [provision,apply,marker]) assertCleanSql(sql);
 for(const [name,sql] of [['01-admin-create.psql',provision],['02-admin-apply.psql',apply],['03-admin-marker.psql',marker]]) assertGeneratedSyntax(sql,name);
 return { '01-admin-create.psql': provision, '02-admin-apply.psql': apply, '03-admin-marker.psql': marker,
   'manifest.json': JSON.stringify({ target: TARGET, copyId, sha256: manifest.sha256,
     entries: manifest.entries, skipped: manifest.skipped, outputEncoding: 'UTF-8 without BOM; LF', ddlProvenance: 'Owner-supplied observed schema, not original migration; grants/comments/other triggers not verified',
     syntaxValidation: SYNTAX_VALIDATION,
     limitations: ['PG18 differs from recommended PG17','Auth emulation, no JWT/PostgREST','SQL runtime/catalog/function bodies NOT validated by offline parsing','Migration 017 unavailable; fresh local empty-table guard only, legacy rename NOT exercised'] },null,2) };
}

export async function main(args=process.argv.slice(2)) {
 if (!args.length || (args.length===1 && args[0]==='--help')) {
   console.log('OFFLINE ONLY. --plan prints source checksums. --emit --copy-id UUID writes a NEW reports/local-bootstrap/UUID directory. No DB connections. Review docs/local-postgres-copy-setup.md.'); return 0;
 }
 requireSafe(args.length===1 && args[0]==='--plan' || args.length===3 && args[0]==='--emit' && args[1]==='--copy-id' && UUID.test(args[2]), 'INVALID_ARGUMENTS');
 const manifest = await loadManifest();
 if (args[0]==='--plan') { console.log(JSON.stringify({target: TARGET,sha256:manifest.sha256,entries:manifest.entries,skipped:manifest.skipped},null,2)); return 0; }
 const bundle = buildBundle(manifest,args[2]);
 const parent = fileURLToPath(new URL('./reports/local-bootstrap/',import.meta.url));
 await mkdir(parent,{recursive:true});
 const destination=join(parent,args[2]);
 await mkdir(destination); // Fail if it exists: never overwrite reviewed artifacts.
 for (const [name,content] of Object.entries(bundle)) await writeFile(join(destination,name),content,{flag:'wx',mode:0o600});
 console.log(JSON.stringify({databaseConnections:0,destination,manifestSha256:manifest.sha256,reviewRequired:true})); return 0;
}
if (process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
 try { process.exitCode=await main(); } catch(error) { console.error(JSON.stringify(safeError(error))); process.exitCode=1; }
}
