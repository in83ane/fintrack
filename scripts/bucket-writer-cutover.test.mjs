// Isolated PGlite 18 rehearsal, not a representative PG17 copy or REST test.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {writerDatabase} from './bucket-writer-db-fixture.mjs';
import {prepareCutover} from './bucket-writer-cutover.mjs';
const db=await writerDatabase();
try {
 await db.exec('reset role');
 for(const name of ['20261027131636_bucket_atomic_writer','20261027084140_plan_atomic_money',
  '20261027081807_plan_monthly_recurrence_guard','20261027075524_plan_recurrence_rules']){
  await db.exec(readFileSync(`supabase/rollbacks/${name}.down.sql`,'utf8'));
 }
 await db.exec('create schema supabase_migrations; create table supabase_migrations.schema_migrations(version text primary key,name text,statements text[])');
 const query=prepareCutover();
 assert(query.includes("current_setting('server_version_num')::integer/10000<>17"));
 // Only this in-memory test adapts the expected major; generated operator SQL stays PG17-only.
 const localQuery=query.replace("current_setting('server_version_num')::integer/10000<>17",
  "current_setting('server_version_num')::integer/10000<>18");
 await db.exec(localQuery);
 assert.equal(Number((await db.query('select count(*) n from supabase_migrations.schema_migrations')).rows[0].n),4);
 assert.equal(Number((await db.query('select count(*) n from bucket_private.requests')).rows[0].n),0);
 assert.equal(Number((await db.query('select count(*) n from auth.users')).rows[0].n),2);
 console.log('PASS: atomic dependency install, four original histories, grants, rolled-back smoke and existing-row fingerprints (PGlite 18)');
} catch(error){
 console.error(JSON.stringify({code:error.code,message:error.message}));process.exitCode=1;
} finally {await db.close();}
