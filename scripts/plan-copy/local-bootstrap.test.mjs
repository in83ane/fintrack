// Offline text, PostgreSQL raw parser and mocked protocol tests. No DB engine or sockets.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { FILES, SKIPPED, CORRUPT_017, loadManifest, sha256, decodeSql } from './local-manifest.mjs';
import { buildBundle, identityGuard, main } from './local-bootstrap.mjs';
import { assertSqlSyntax, assertGeneratedSyntax } from './local-syntax.mjs';
const id='11111111-1111-4111-8111-111111111111';

test('explicit full manifest: 008 -> observed DDL -> 009, baseline grants before PLAN, writer last migration',()=>{
 const i=FILES.findIndex(p=>p.includes('008_portfolios'));
 assert.match(FILES[i+1],/observed-schema-prerequisite/);assert.match(FILES[i+2],/009_scope/);
 assert.equal(FILES.filter(p=>p.startsWith('supabase/migrations/')).length,27);
 assert.match(FILES.at(-2),/20261027131636_bucket_atomic_writer/);
 assert.equal(SKIPPED.length,6);assert.ok(SKIPPED.every(s=>!FILES.includes(s.path)));
 assert.equal(new Set(FILES).size,FILES.length);
});
test('017 exception is explicit, pinned to corrupt bytes, and guarded against any legacy data',async()=>{
 const raw=await readFile(new URL('../../'+CORRUPT_017.path,import.meta.url));
 assert.equal(raw.toString('utf8'),'3');assert.equal(sha256(raw),CORRUPT_017.rawSha256);
 const i=FILES.findIndex(p=>p.includes('016_default_'));
 assert.equal(FILES[i+1],CORRUPT_017.replacement);assert.match(FILES[i+2],/018_bucket/);
 const m=await loadManifest();const b=buildBundle(m,id);const sql=m.files.find(f=>f.path===CORRUPT_017.replacement).sql;
 for(const table of ['auth.users','public.portfolios','public.brokerage_accounts','public.brokerage_cash_entries']) assert.ok(sql.includes(`EXISTS (SELECT 1 FROM ${table})`));
 assert.match(sql,/RAISE EXCEPTION 'LOCAL_017_REQUIRES_EMPTY_LEGACY_TABLES'/);
 assert.doesNotMatch(sql,/\b(?:UPDATE|DELETE|TRUNCATE)\b/i);
 assert.ok(!b['02-admin-apply.psql'].includes(`-- BEGIN SOURCE ${CORRUPT_017.path}`));
 assert.ok(!b['02-admin-apply.psql'].includes(`VALUES(20,'${CORRUPT_017.path}'`));
 assert.deepEqual(JSON.parse(b['manifest.json']).skipped[0],CORRUPT_017);
});
test('raw PostgreSQL parser rejects original 3 and malformed SQL; permits numbers in valid SQL',()=>{
 for(const sql of ['3','3\nSET ROLE fintrack_local_owner;','SELECT FROM;','CREATE TABLE broken (']) {
  assert.throws(()=>assertSqlSyntax(sql,'fixture.sql'),/SOURCE_SQL_SYNTAX_INVALID: fixture.sql/);
 }
 assert.throws(()=>assertSqlSyntax('-- empty source','fixture.sql'),/SOURCE_SQL_EMPTY/);
 assert.equal(assertSqlSyntax("-- 3\nSELECT 3, '3';",'fixture.sql'),1);
});
test('bundle construction rejects hash-consistent syntax corruption and parses assembled wrappers',async()=>{
 const m=await loadManifest();const b=buildBundle(m,id);
 for(const [name,sql] of Object.entries(b)) if(name.endsWith('.psql')) assert.ok(assertGeneratedSyntax(sql,name)>0);
 const broken=b['02-admin-apply.psql'].replace('SET search_path=public,extensions;','SET search_path=public,extensions;\n3');
 assert.throws(()=>assertGeneratedSyntax(broken,'02-admin-apply.psql'),/SOURCE_SQL_SYNTAX_INVALID/);
 m.files[0].sql='3';m.files[0].sha256=sha256('3');
 assert.throws(()=>buildBundle(m,id),/SOURCE_SQL_SYNTAX_INVALID/);
});
test('observed DDL preserves supplied constraints, types and RLS; has no production grants',async()=>{
 const text=await readFile(new URL('./local/observed-schema-prerequisite.sql',import.meta.url),'utf8');
 for(const part of ['user_categories_type_check','user_categories_user_id_type_label_key','idx_user_categories_user_type','idx_user_categories_user_portfolio','WITH CHECK (auth.uid()=user_id)','allocation text NULL',"DEFAULT '🏷️'"]) assert.ok(text.includes(part));
 assert.doesNotMatch(text,/\bGRANT\b|IF NOT EXISTS/i);assert.match(text,/NOT original migration/);
});
test('manifest hashes every full source and generated script preserves it without slicing',async()=>{
 const m=await loadManifest();const b=buildBundle(m,id);
 assert.equal(m.sha256,sha256(JSON.stringify(m.entries)));
 for(const f of m.files){assert.equal(f.sha256,sha256(f.sql));assert.ok(b['02-admin-apply.psql'].includes(f.sql));}
 assert.ok(!b['02-admin-apply.psql'].includes('CREATE EXTENSION pg_net'));
 assert.match(b['02-admin-apply.psql'],/EMPTY_DATABASE_REQUIRED_NO_REUSE/);
 assert.doesNotMatch(b['01-admin-create.psql'],/DROP DATABASE|ALTER ROLE/i);
 assert.match(b['01-admin-create.psql'],/WITH INHERIT FALSE, SET TRUE, ADMIN FALSE/);
 assert.match(b['01-admin-create.psql'],/FRESH_INSTANCE_REQUIRED/);
 assert.match(b['03-admin-marker.psql'],/APPROVE_LOCAL_SYNTHETIC_MARKER/);
 assert.ok(!b['02-admin-apply.psql'].includes('INSERT INTO plan_copy_guard.identity'));
 for(const name of ['01-admin-create.psql','02-admin-apply.psql','03-admin-marker.psql']){
  assert.match(b[name],/inet_server_addr\(\) IS DISTINCT FROM '127.0.0.1'/);
  assert.match(b[name],/inet_server_port\(\) IS DISTINCT FROM 5432/);
  assert.match(b[name],/180000 AND 189999/);assert.match(b[name],/ON_ERROR_STOP on/);
 }
});
test('incomplete or altered source refuses generation, bad target and ID rejected',async()=>{
 await assert.rejects(()=>loadManifest(new URL('./missing-source-root/',import.meta.url).pathname),/BOOTSTRAP_SOURCE_MISSING/);
 assert.throws(()=>identityGuard('production'),/BOOTSTRAP_DATABASE_FORBIDDEN/);
 const m=await loadManifest();assert.throws(()=>buildBundle(m,'bad'),/INVALID_COPY_ID/);
 m.files[0].sql+='--changed';assert.throws(()=>buildBundle(m,id),/BOOTSTRAP_SOURCE_HASH_MISMATCH/);
});
test('bootstrap help and invalid args never need env or connection driver',async()=>{
 assert.equal(await main(['--help']),0);await assert.rejects(()=>main(['--run']),/INVALID_ARGUMENTS/);
 for(const name of ['local-bootstrap.mjs','local-manifest.mjs']) {
 const source=await readFile(new URL(name,import.meta.url),'utf8');
 assert.doesNotMatch(source,/import\(['"]pg['"]\)|from ['"]pg['"]|child_process|process\.env|readFile.*\.env/);
 }
});
test('observer RLS covers all six evidence tables without private writer or owner grants',async()=>{
 const sql=await readFile(new URL('./local/runner-grants.sql',import.meta.url),'utf8');
 for(const table of ['bucket_private.links','bucket_private.requests','public.money_buckets','public.cash_activities','public.bucket_activities','public.plan_checks']) {
  assert.ok(sql.includes(`ON ${table} FOR SELECT TO fintrack_tester USING(true)`));
 }
 assert.doesNotMatch(sql,/GRANT\s+(?:ALL|EXECUTE|UPDATE|DELETE|TRUNCATE)|GRANT\s+fintrack_local_owner/i);
 assert.match(sql,/GRANT INSERT ON auth.users TO fintrack_tester/);
});

for(const encoding of ['utf8','utf8-bom','utf16le','utf16be']) test(`strict decoder ${encoding}: Thai/emoji preserved, no BOM/NUL/replacement`,()=>{
 const text="-- ไทย 🏷️\r\nSELECT 1;\r\n";
 let bytes;
 if(encoding==='utf8') bytes=Buffer.from(text);
 if(encoding==='utf8-bom') bytes=Buffer.concat([Buffer.from([0xef,0xbb,0xbf]),Buffer.from(text)]);
 if(encoding==='utf16le') bytes=Buffer.concat([Buffer.from([0xff,0xfe]),Buffer.from(text,'utf16le')]);
 if(encoding==='utf16be') bytes=Buffer.concat([Buffer.from([0xfe,0xff]),Buffer.from(text,'utf16le').swap16()]);
 const result=decodeSql(bytes);
 assert.equal(result.sql,text.replace(/\r\n/g,'\n'));assert.equal(result.rawSha256,sha256(bytes));
 assert.equal(result.bomRemoved,encoding!=='utf8');
});
for(const [name,bytes] of [
 ['invalid UTF8',Buffer.from([0xc3,0x28])],
 ['truncated UTF16',Buffer.from([0xff,0xfe,0x43])],
 ['unpaired UTF16 surrogate',Buffer.from([0xff,0xfe,0x00,0xd8])],
 ['unmarked UTF16',Buffer.from('CREATE TABLE t();','utf16le')],
 ['UTF32 LE',Buffer.from([0xff,0xfe,0,0,0x43,0,0,0])],
 ['UTF32 BE',Buffer.from([0,0,0xfe,0xff,0,0,0,0x43])],
 ['replacement character',Buffer.from('\ufffdSELECT 1;')],
 ['interior BOM',Buffer.from('SELECT 1;\n\ufeffSET ROLE x;')],
 ['double BOM',Buffer.from('\ufeff\ufeffSELECT 1;')],
]) test(`strict decoder refuses ${name}`,()=>assert.throws(()=>decodeSql(bytes),/SOURCE_ENCODING_/));

test('regression: original UTF16 trade_journal is decoded; every emitted psql file is strict UTF8 without NUL/BOM',async()=>{
 const m=await loadManifest();const f=m.files.find(f=>f.path==='trade_journal_schema.sql');
 assert.match(f.sql,/^CREATE TABLE trade_journal/);
 const original=await readFile(new URL('../../trade_journal_schema.sql',import.meta.url));
 assert.equal(f.rawSha256,sha256(original));
 const b=buildBundle(m,id);
 for(const [name,sql] of Object.entries(b)){
  const bytes=Buffer.from(sql,'utf8');
  assert.equal(new TextDecoder('utf8',{fatal:true}).decode(bytes),sql);
  assert.doesNotMatch(sql,/[\u0000\ufffd\ufeff]/);
  if(name.endsWith('.psql')) assert.equal(sql.startsWith('\\set ON_ERROR_STOP on'),true);
 }
 assert.ok(b['02-admin-apply.psql'].includes('SET search_path=public,extensions;\nCREATE TABLE trade_journal'));
});

test('recovery inventory is excluded from manifest, read-only, guarded and contains no mutation commands',async()=>{
 const path='scripts/plan-copy/local/recovery-inventory.psql';assert.ok(!FILES.includes(path));
 const bytes=await readFile(new URL('./local/recovery-inventory.psql',import.meta.url));
 const {sql}=decodeSql(bytes);
 const commands=sql.split('\n').filter(line=>!line.trimStart().startsWith('--')).join('\n');
 assert.match(commands,/BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY/);
 assert.match(commands,/current_database\(\)='fintrack_local_test'/);
 assert.match(commands,/127\.0\.0\.1/);assert.match(commands,/5432/);
 assert.match(commands,/\\quit 3/);assert.match(commands,/ROLLBACK;/);
 assert.doesNotMatch(commands,/\b(?:INSERT|UPDATE|DELETE|TRUNCATE|CREATE|ALTER|DROP|GRANT|REVOKE|CALL|DO)\b/i);
 assert.doesNotMatch(commands,/\u0000|\ufffd|\ufeff/);
});
