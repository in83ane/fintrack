// Isolated regression/diagnostic probes. Never connects to a hosted database.
// Account deletion remains deferred. Writer interleavings are acceptance tests.
import {writerDatabase} from './bucket-writer-db-fixture.mjs';
import assert from 'node:assert/strict';
import {planDatabase,owner,bucket,sql} from './plan-phase2-db-fixture.mjs';
const portfolio='44444444-4444-4444-8444-444444444444';
const result={productionTouched:false,findings:[],auditPassed:false};
async function fresh(body){const db=await planDatabase();try{await body(db,async(s,a=[])=>(await db.query(s,a)).rows);}finally{await db.close();}}
await fresh(async(db,q)=>{
 const [p]=await q("insert into daily_plans(name,amount,amount_period,money_mode,bucket_id,starts_on,ends_on) values('Delete probe',10,'month','saving',$1,'2026-10-01','2026-10-01') returning id",[bucket]);
 await q("insert into plan_checks(plan_id,day) values($1,'2026-10-01')",[p.id]);
 const counts=async()=> (await q('select (select count(*) from plan_checks) checks,(select count(*) from plan_month_locks) locks,(select count(*) from plan_system_buckets) wallets'))[0];
 assert.deepEqual(await counts(),{checks:1,locks:1,wallets:1});
 await db.exec('reset role');await q("select set_config('request.jwt.claim.sub','',false)");
 let deletionError;try{await q('delete from auth.users where id=$1',[owner]);}catch(e){deletionError={code:e.code,message:e.message};}
 assert.ok(deletionError,'Probe expectation changed: re-review account deletion');
 assert.equal((await q('select count(*) count from auth.users where id=$1',[owner]))[0].count,1);
 assert.deepEqual(await counts(),{checks:1,locks:1,wallets:1});
 let directUndoError;try{await q('delete from plan_checks where plan_id=$1',[p.id]);}catch(e){directUndoError={code:e.code,message:e.message};}
 assert.ok(directUndoError);assert.deepEqual(await counts(),{checks:1,locks:1,wallets:1});
 result.findings.push({case:'admin auth.users delete with NULL auth.uid',acceptancePassed:false,deletionError,directUndoError,rolledBack:true});
});
// Acceptance now runs the new RPC in both orders; stale UI state cannot bypass it.
for(const planFirst of [true,false]){
 const db=await writerDatabase(),q=async(s,a=[])=>(await db.query(s,a)).rows;
 try{
  const [p]=await q("insert into daily_plans(name,amount,bucket_id,starts_on) values('Interleaving',800,$1,'2026-10-01') returning id",[bucket]);
  const ledger=()=>q('select write_bucket_cash($1,$2)',[crypto.randomUUID(),{op:'create',rows:[{id:crypto.randomUUID(),portfolio_id:portfolio,bucket_id:bucket,type:'EXPENSE',original_amount:800,currency:'THB',rate_at_time:35,date:'2026-10-01T12:00:00+07:00'}]}]);
  const plan=()=>q("insert into plan_checks(plan_id,day) values($1,'2026-10-01')",[p.id]);
  await (planFirst?plan():ledger());await assert.rejects(planFirst?ledger:plan,/Insufficient/);
  const [r]=await q("select current_amount,(select sum(case when type in ('INCOME','DEPOSIT') then original_amount else -original_amount end) from cash_activities where bucket_id=$1) native_total from money_buckets where id=$1",[bucket]);
  assert.equal(Number(r.native_total),200);assert.equal(Number(r.current_amount),200);
  assert.equal((await q('select count(*) n from bucket_activities'))[0].n,1);
  result.findings.push({case:planFirst?'PLAN then stale Ledger':'Ledger then PLAN',acceptancePassed:true,initial:1000,successfulDebits:1,rejectedDebits:1,nativeTotal:200,cachedBalance:200,realMultiSession:false});
 }finally{await db.close();}
}
await fresh(async(db,q)=>{
 const clean=await db.exec(sql('scripts/plan-bucket-audit.sql'));assert.equal(clean.flatMap(r=>r.rows).length,0);
 await q('update money_buckets set current_amount=999 where id=$1',[bucket]);
 const mismatch=await db.exec(sql('scripts/plan-bucket-audit.sql'));const [m]=mismatch.flatMap(r=>r.rows);assert.equal(m.balance_mismatch,true);assert.equal(Number(m.difference),-1);
 for(const [type,amount,currency] of [['EXPENSE',null,'THB'],['EXPENSE',1,'USD'],['EXPENSE',0.001,'THB'],['OTHER',1,'THB']])await q('insert into cash_activities(user_id,portfolio_id,bucket_id,type,original_amount,currency) values($1,$2,$3,$4,$5,$6)',[owner,portfolio,bucket,type,amount,currency]);
 const before=await q('select * from cash_activities order by id');
 const audited=(await db.exec(sql('scripts/plan-bucket-audit.sql'))).flatMap(r=>r.rows);
 const summary=audited.find(r=>Object.hasOwn(r,'unresolved_count'));assert.equal(summary.unresolved_count,3);assert.equal(summary.unknown_type_count,1);assert.equal(summary.expected_current_amount,null);
 assert.deepEqual(new Set(audited.flatMap(r=>r.reasons||[])),new Set(['original_amount_null','currency_mismatch','sub_cent','unknown_type']));
 assert.deepEqual(await q('select * from cash_activities order by id'),before);result.auditPassed=true;
});
console.log(JSON.stringify(result,null,2));
