import assert from 'node:assert/strict';
import {writerDatabase,owner,bucket,portfolio} from './bucket-writer-db-fixture.mjs';
import {sql} from './plan-phase2-db-fixture.mjs';
const migration='supabase/migrations/20261027131636_bucket_atomic_writer.sql',down='supabase/rollbacks/20261027131636_bucket_atomic_writer.down.sql';
const db=await writerDatabase(),q=async(s,a=[])=>(await db.query(s,a)).rows;let passed=0;
try{
 await db.exec('reset role');const before=await q('select * from cash_activities order by id');
 await db.exec(sql(down));assert.deepEqual(await q('select * from cash_activities order by id'),before);
 assert.equal((await q("select has_table_privilege('authenticated','cash_activities','INSERT') ok"))[0].ok,true);
 await db.exec(sql(migration));assert.deepEqual(await q('select * from cash_activities order by id'),before);passed++;
 // Corruption fixtures are admin-only and rolled back. The app cannot do this.
 for(const mutation of ["update money_buckets set current_amount=999 where id=$1","update cash_activities set original_amount=null where bucket_id=$1","update cash_activities set original_amount=0.001 where bucket_id=$1","update cash_activities set currency='USD' where bucket_id=$1","update cash_activities set type='UNKNOWN' where bucket_id=$1"]){
  await db.exec('begin');await q('insert into bucket_private.write_context values(pg_backend_pid(),txid_current(),$1)',[owner]);await q(mutation,[bucket]);await q('delete from bucket_private.write_context');await db.exec('set local role authenticated');
  await assert.rejects(()=>q('select write_bucket_cash($1,$2)',[crypto.randomUUID(),{op:'create',rows:[{id:crypto.randomUUID(),portfolio_id:portfolio,bucket_id:bucket,type:'EXPENSE',original_amount:1,currency:'THB',rate_at_time:35,date:'2026-10-01'}]}]),/audit required/);
  await db.exec('rollback');passed++;
 }
 const audited=await db.exec(sql('scripts/bucket-writer-audit.sql'));
 assert.equal(audited[0].rows.length,1);assert.equal(audited[0].rows[0].issue,'unlinked_legacy');
 assert.ok(audited.slice(1).every(r=>r.rows.length===0));passed++;
 await db.exec('set role authenticated');await q('select write_bucket_cash($1,$2)',[crypto.randomUUID(),{op:'create',rows:[{id:crypto.randomUUID(),portfolio_id:portfolio,bucket_id:bucket,type:'EXPENSE',original_amount:1,currency:'THB',rate_at_time:35,date:'2026-10-01'}]}]);
 await db.exec('reset role');await assert.rejects(()=>db.exec(sql(down)),/Unsafe bucket writer rollback/);await db.exec('rollback');
 assert.equal(Number((await q('select current_amount from money_buckets where id=$1',[bucket]))[0].current_amount),999);passed++;
 console.log(JSON.stringify({passed,productionTouched:false,cases:['safe down/up preserves rows and grants','cache mismatch blocked','null native amount blocked','subcent blocked','currency mismatch blocked','unknown type blocked','read-only link/grant audit','downgrade after use blocked']}));
}finally{await db.close();}
