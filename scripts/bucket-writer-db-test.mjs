import assert from 'node:assert/strict';
import {writerDatabase,owner,bucket,portfolio} from './bucket-writer-db-fixture.mjs';
const db=await writerDatabase(),results=[];
const q=async(s,a=[])=>(await db.query(s,a)).rows;
const row=(type,amount,bid=bucket)=>({id:crypto.randomUUID(),type,original_amount:amount,currency:'THB',rate_at_time:35,bucket_id:bid,portfolio_id:portfolio,date:'2026-10-01T12:00:00+07:00',category:'QA',note:'QA'});
const write=async(command,id=crypto.randomUUID())=>(await q('select write_bucket_cash($1,$2) result',[id,command]))[0].result;
const rejects=async(s,a,pattern)=>{await db.exec('savepoint expected_failure');try{await assert.rejects(()=>q(s,a),pattern);}finally{await db.exec('rollback to expected_failure;release expected_failure');}};
const goal=async(amount=800)=>(await q("insert into daily_plans(name,amount,bucket_id,starts_on) values('Race',$1,$2,'2026-10-01') returning id",[amount,bucket]))[0].id;
const balances=async()=> (await q("select current_amount,(select sum(case when type in ('INCOME','DEPOSIT') then original_amount else -original_amount end) from cash_activities where bucket_id=$1) total from money_buckets where id=$1",[bucket]))[0];
const run=async(name,f)=>{await db.exec('begin');try{await f();results.push(name);}finally{await db.exec('rollback');}};
try{
 for(const planFirst of [true,false])await run(`race: ${planFirst?'PLAN then Ledger':'Ledger then PLAN'} rejects second 800`,async()=>{
  const id=await goal();const command={op:'create',rows:[row('EXPENSE',800)]};
  if(planFirst){await q("insert into plan_checks(plan_id,day) values($1,'2026-10-01')",[id]);await rejects('select write_bucket_cash($1,$2)',[crypto.randomUUID(),command],/Insufficient/);}
  else{await write(command);await rejects("insert into plan_checks(plan_id,day) values($1,'2026-10-01')",[id],/Insufficient/);}
  const b=await balances();assert.equal(Number(b.current_amount),200);assert.equal(Number(b.total),200);
  assert.equal((await q("select count(*) n from cash_activities where type='EXPENSE'"))[0].n,1);
  assert.equal((await q('select count(*) n from bucket_activities'))[0].n,1);
 });
 await run('identical intentional expenses remain separate; retry debits once',async()=>{
  const first={op:'create',rows:[row('EXPENSE',153)]};
  const second={op:'create',rows:[{...first.rows[0],id:crypto.randomUUID()}]};
  const firstKey=crypto.randomUUID(),secondKey=crypto.randomUUID();
  await write(first,firstKey);await write(first,firstKey);
  await write(second,secondKey);await write(second,secondKey);
  assert.equal(Number((await balances()).total),694);
  assert.equal(Number((await balances()).current_amount),694);
  assert.equal(Number((await q("select count(*) n from cash_activities where type='EXPENSE'"))[0].n),2);
  assert.equal(Number((await q('select count(*) n from bucket_activities'))[0].n),2);
 });
 await run('idempotency same request, changed payload and plain writes',async()=>{
  const command={op:'create',rows:[row('EXPENSE',100)]},key=crypto.randomUUID();await write(command,key);await write(command,key);
  await rejects('select write_bucket_cash($1,$2)',[key,{op:'create',rows:[row('EXPENSE',200)]}],/Idempotency conflict/);
  assert.equal(Number((await balances()).total),900);
  await rejects('update money_buckets set current_amount=9000 where id=$1',[bucket],/permission denied/);
  await rejects("insert into cash_activities(user_id,type) values($1,'INCOME')",[owner],/permission denied/);
  await rejects('delete from bucket_activities',[],/permission denied/);
  await rejects("select bucket_private.write_rows('[]','{}','ledger')",[],/permission denied/);
 });
 await run('edit and deletion use net effect, mirror and original snapshot',async()=>{
  const r=row('EXPENSE',100);await write({op:'create',rows:[r]});await write({op:'edit',id:r.id,patch:{original_amount:200}});
  await rejects('select write_bucket_cash($1,$2)',[crypto.randomUUID(),{op:'edit',id:r.id,patch:{rate_at_time:36}}],/immutable/);
  assert.equal(Number((await balances()).total),800);
  assert.equal(Number((await q('select amount from bucket_activities where id=$1',[r.id]))[0].amount),200);
  await write({op:'delete',id:r.id});assert.equal(Number((await balances()).total),1000);assert.equal((await q('select * from bucket_activities')).length,0);
  await rejects('select write_bucket_cash($1,$2)',[crypto.randomUUID(),{op:'delete',id:(await q('select id from cash_activities limit 1'))[0].id}],/Unlinked legacy/);
 });
 await run('deleting spent income is atomic and rejected',async()=>{
  const income=row('INCOME',100);await write({op:'create',rows:[income]});await write({op:'create',rows:[row('EXPENSE',1050)]});
  await rejects('select write_bucket_cash($1,$2)',[crypto.randomUUID(),{op:'delete',id:income.id}],/Insufficient/);
  assert.equal(Number((await balances()).total),50);assert.equal((await q('select * from bucket_activities')).length,2);
 });
 await run('PLAN check undo calls writer and leaves no legs',async()=>{
  const id=await goal(10);await q("insert into plan_checks(plan_id,day) values($1,'2026-10-01')",[id]);await q('delete from plan_checks where plan_id=$1',[id]);
  assert.equal(Number((await balances()).total),1000);assert.equal((await q('select * from bucket_activities')).length,0);
 });

 const wallet=async(currency='THB',opening=0)=>{const id=crypto.randomUUID();await q('select save_cash_bucket($1,$2,$3,$4)',[crypto.randomUUID(),id,{name:'New',portfolio_id:portfolio,currency,current_amount:opening},currency==='THB'?35:1]);return id;};
 await run('opening, metadata, zero wallet deletion and protected balance',async()=>{
  const id=await wallet('USD',1.29);assert.equal(Number((await q('select current_amount from money_buckets where id=$1',[id]))[0].current_amount),1.29);
  assert.equal((await q('select * from cash_activities where bucket_id=$1',[id])).length,1);
  await q('select save_cash_bucket($1,$2,$3)',[crypto.randomUUID(),id,{name:'Renamed'}]);
  await rejects('select save_cash_bucket($1,$2,$3)',[crypto.randomUUID(),id,{current_amount:900}],/Use deposit/);
  await rejects('select remove_empty_cash_bucket($1)',[id],/financial history/);
  const empty=await wallet();await q('select remove_empty_cash_bucket($1)',[empty]);assert.equal((await q('select * from money_buckets where id=$1',[empty])).length,0);
  await rejects('select save_cash_bucket($1,$2,$3)',[crypto.randomUUID(),crypto.randomUUID(),{name:'Forged',portfolio_id:crypto.randomUUID(),currency:'THB'}],/Invalid owned/);
 });
 await run('transfer two legs, paired reversal and no partial transfer',async()=>{
  const id=await wallet();const debit={...row('WITHDRAW',800),is_transfer:true},credit={...row('DEPOSIT',800,id),is_transfer:true};
  await write({op:'transfer',rows:[debit,credit]});assert.equal(Number((await balances()).total),200);
  await rejects('select write_bucket_cash($1,$2)',[crypto.randomUUID(),{op:'transfer',rows:[{...row('WITHDRAW',800),is_transfer:true},{...row('DEPOSIT',800,id),is_transfer:true}]}],/Insufficient/);
  assert.equal((await q('select * from bucket_activities')).length,2);
  await write({op:'delete',id:credit.id});assert.equal(Number((await balances()).total),1000);assert.equal((await q('select * from bucket_activities')).length,0);
 });
 await run('spent transfer destination prevents whole reversal',async()=>{
  const id=await wallet(),debit={...row('WITHDRAW',800),is_transfer:true};await write({op:'transfer',rows:[debit,{...row('DEPOSIT',800,id),is_transfer:true}]});
  await write({op:'create',rows:[row('EXPENSE',1,id)]});
  await rejects('select write_bucket_cash($1,$2)',[crypto.randomUUID(),{op:'delete',id:debit.id}],/Insufficient/);
  assert.equal(Number((await balances()).total),200);assert.equal((await q('select * from bucket_activities')).length,3);
 });
 await run('distribution validates entire batch before writing',async()=>{
  const id=await wallet();await write({op:'distribute',rows:[row('INCOME',0.33),row('INCOME',0.67,id)]});
  await rejects('select write_bucket_cash($1,$2)',[crypto.randomUUID(),{op:'distribute',rows:[row('INCOME',100),row('INCOME',100,crypto.randomUUID())]}],/Invalid owned bucket/);
  assert.equal(Number((await balances()).total),1000.33);assert.equal((await q('select * from bucket_activities')).length,2);
 });
 await run('currency, sub-cent, hostile owner and protected inputs reject',async()=>{
  for(const patch of [{currency:'USD'},{original_amount:0.001},{original_amount:1.00001},{rate_at_time:0},{user_id:owner},{brokerage_entry_id:crypto.randomUUID()}])
   await rejects('select write_bucket_cash($1,$2)',[crypto.randomUUID(),{op:'create',rows:[{...row('EXPENSE',1),...patch}]}],/mismatch|Invalid|Protected/);
  await q("select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true)");
  await rejects('select write_bucket_cash($1,$2)',[crypto.randomUUID(),{op:'create',rows:[row('EXPENSE',1)]}],/Invalid owned bucket/);
  await q("select set_config('request.jwt.claim.sub',$1,true)",[owner]);assert.equal(Number((await balances()).total),1000);
 });
 await run('table and column privileges, private schema and forged GUC cannot bypass',async()=>{
  for(const table of ['money_buckets','cash_activities','bucket_activities'])for(const privilege of ['INSERT','UPDATE','DELETE','TRUNCATE'])assert.equal((await q("select has_table_privilege('authenticated',$1,$2) ok",[table,privilege]))[0].ok,false);
  assert.equal((await q("select has_column_privilege('authenticated','money_buckets','current_amount','UPDATE') ok"))[0].ok,false);
  await rejects('insert into bucket_private.write_context values(pg_backend_pid(),txid_current(),auth.uid())',[],/permission denied/);
  await q("select set_config('app.correct_funding','on',true),set_config('app.allow_brokerage_ledger_mutation','on',true)");
  // Even an obsolete SECURITY DEFINER function cannot bypass the central guard.
  await db.exec("reset role; create function public.qa_obsolete_writer() returns void language sql security definer as $$update money_buckets set current_amount=9999$$;grant execute on function public.qa_obsolete_writer() to authenticated;set role authenticated;");
  await rejects('select qa_obsolete_writer()',[],/Use atomic bucket writer/);
  await db.exec('reset role;set role anon');await rejects('select write_bucket_cash($1,$2)',[crypto.randomUUID(),{op:'delete',id:crypto.randomUUID()}],/permission denied/);await db.exec('reset role;set role authenticated');
 });
 const broker=async()=>{const id=crypto.randomUUID(),pid=crypto.randomUUID();await db.exec('reset role');await q("insert into portfolios(id,user_id,kind,name) values($1,$2,'trading','QA broker')",[pid,owner]);await q("insert into brokerage_accounts(id,user_id,portfolio_id,name,currency) values($1,$2,$3,'QA','USD')",[id,owner,pid]);await db.exec('set role authenticated');return id;};
 await run('broker funding, idempotency, reversal and no orphan on insufficient',async()=>{
  const a=await broker(),id=crypto.randomUUID();const args=[id,bucket,a,700,20,0,35,35];
  await q('select transfer_bucket_to_broker($1,$2,$3,$4,$5,$6,$7,$8)',args);await q('select transfer_bucket_to_broker($1,$2,$3,$4,$5,$6,$7,$8)',args);
  assert.equal(Number((await balances()).total),300);
  await rejects('select transfer_bucket_to_broker($1,$2,$3,$4,$5,$6,$7,$8)',[crypto.randomUUID(),bucket,a,700,20,0,35,35],/Insufficient/);
  assert.equal((await q('select * from brokerage_cash_entries')).length,1);
  await q('select delete_broker_cash_movement($1)',[id]);assert.equal(Number((await balances()).total),1000);assert.equal((await q('select * from bucket_activities')).length,0);
 });
 await run('broker withdrawal snapshot unchanged, spent bucket blocks reversal',async()=>{
  const a=await broker(),deposit=crypto.randomUUID(),withdraw=crypto.randomUUID();await q('select transfer_bucket_to_broker($1,$2,$3,700,20,0,35,35)',[deposit,bucket,a]);
  await q('select transfer_broker_to_bucket($1,$2,$3,1,35.1234)',[withdraw,a,bucket]);await q('select transfer_broker_to_bucket($1,$2,$3,1,35.1234)',[withdraw,a,bucket]);
  const [cash]=await q('select amount,original_amount,rate_at_time from cash_activities where id=$1',[withdraw]);assert.equal(Number(cash.amount),1);assert.equal(Number(cash.original_amount),35.12);assert.equal(Number(cash.rate_at_time),35.1234);
  await write({op:'create',rows:[row('EXPENSE',330)]});await rejects('select delete_broker_cash_movement($1)',[withdraw],/Insufficient/);
  assert.equal(Number((await balances()).total),5.12);assert.equal((await q('select * from brokerage_cash_entries')).length,2);
 });
 await run('NULL auth RPC rejected and writer context cleaned',async()=>{
  await write({op:'create',rows:[row('EXPENSE',1)]});await db.exec('reset role');assert.equal((await q('select * from bucket_private.write_context')).length,0);await db.exec('set role authenticated');
  await q("select set_config('request.jwt.claim.sub','',true)");await rejects('select write_bucket_cash($1,$2)',[crypto.randomUUID(),{op:'create',rows:[row('EXPENSE',1)]}],/Authentication required/);
 });
 console.log(JSON.stringify({passed:results.length,cases:results,productionTouched:false},null,2));
}finally{await db.close();}
