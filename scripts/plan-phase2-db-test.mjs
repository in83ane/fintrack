import {writerDatabase} from './bucket-writer-db-fixture.mjs';
import assert from 'node:assert/strict';
import {planDatabase,owner,other,bucket,sql} from './plan-phase2-db-fixture.mjs';
const writer=process.argv.includes('--writer');
const db=await (writer?writerDatabase():planDatabase()),results=[];
const q=async(s,args=[])=>(await db.query(s,args)).rows;
const clock=day=>q("select set_config('test.today',$1,false)",[day]);
const reject=async(s,args,pattern)=>{await db.exec('savepoint expected_failure');try{await assert.rejects(()=>q(s,args),pattern);}finally{await db.exec('rollback to savepoint expected_failure; release savepoint expected_failure');}};
const goal=async(patch={})=>{
 const row={name:'Test plan',amount:10,bucket_id:bucket,starts_on:'2026-10-01',ends_on:null,...patch};
 const keys=Object.keys(row);return (await q(`insert into daily_plans(${keys.join(',')}) values(${keys.map((_,i)=>'$'+(i+1)).join(',')}) returning id`,Object.values(row)))[0].id;
};
const check=(id,day,extra=false,requested=null)=>q('insert into plan_checks(plan_id,day,confirm_extra,requested_minor) values($1,$2,$3,$4) returning *',[id,day,extra,requested]);
const undo=(id,day)=>q('delete from plan_checks where plan_id=$1 and day=$2',[id,day]);
const lock=async id=>(await q('select * from plan_month_locks where plan_id=$1',[id]))[0];
const balance=async id=>Number((await q('select current_amount from money_buckets where id=$1',[id]))[0].current_amount);
const run=async(name,body)=>{await db.exec('begin');try{await body();results.push(name);}finally{await db.exec('rollback');}};
try{
 await run('expense, exact snapshot, duplicate retry and undo',async()=>{
  const id=await goal({amount:0.29});let [c]=await check(id,'2026-10-05');assert.equal(Number(c.amount_minor),29);assert.equal(await balance(bucket),999.71);
  assert.equal((await check(id,'2026-10-05')).length,0);assert.equal(await balance(bucket),999.71);
  await q('update daily_plans set amount=2 where id=$1',[id]);await undo(id,'2026-10-05');assert.equal(await balance(bucket),1000);
  await check(id,'2026-10-27');assert.equal(await balance(bucket),998);
 });
 await run('lazy savings wallet, matched legs, isolation, currency, unchanged net worth',async()=>{
  assert.equal((await q('select * from plan_system_buckets')).length,0);
  const a=await goal({money_mode:'saving'}),b=await goal({money_mode:'saving'});
  const [c]=await check(a,'2026-10-05');await check(b,'2026-10-05');
  const wallets=await q('select * from plan_system_buckets');assert.equal(wallets.length,1);const dest=wallets[0].bucket_id;
  assert.equal(await balance(bucket)+await balance(dest),1000);assert.equal(await balance(dest),20);
  const legs=await q('select type,is_transfer,original_amount,currency from cash_activities where id in ($1,$2)',[c.cash_id,c.destination_cash_id]);
  assert.equal(legs.length,2);assert.ok(legs.every(l=>l.is_transfer&&Number(l.original_amount)===10&&l.currency==='THB'));
  await reject('delete from cash_activities where id=$1',[c.destination_cash_id],/Manage this linked|permission denied/);
  await reject('update bucket_activities set amount=1 where id=$1',[c.destination_activity_id],/Manage this linked|permission denied/);
  await undo(a,'2026-10-05');assert.equal(await balance(dest),10);assert.equal(await balance(bucket)+await balance(dest),1000);
  await q("select set_config('request.jwt.claim.sub',$1,true)",[other]);assert.equal((await q('select * from plan_system_buckets')).length,0);
 });
 await run('insufficient funds and invalid sub-cent input are rejected atomically',async()=>{
  const id=await goal({amount:1001,money_mode:'saving'});
  await reject('insert into plan_checks(plan_id,day) values($1,$2)',[id,'2026-10-05'],/Insufficient/);
  assert.equal((await q('select * from plan_system_buckets')).length,0);assert.equal((await q('select * from plan_checks')).length,0);assert.equal(await balance(bucket),1000);
  await reject('update daily_plans set amount=0.001 where id=$1',[id],/plan_money_exact_cents/);
 });
 await run('same-currency savings accounts are separate per portfolio; USD never enters THB',async()=>{
  await db.exec('reset role');
  await q("insert into portfolios(id,user_id,kind) values('55555555-5555-4555-8555-555555555555',$1,'cash_management')",[owner]);
  let u;
  if(writer){const id=crypto.randomUUID();await q('select save_cash_bucket($1,$2,$3,$4)',[crypto.randomUUID(),id,{name:'USD',portfolio_id:'55555555-5555-4555-8555-555555555555',currency:'USD',current_amount:500},1]);u={id};}
  else{
  const [seed]=await q("insert into money_buckets(user_id,portfolio_id,name,currency,current_amount) values($1,'55555555-5555-4555-8555-555555555555','USD','USD',500) returning id",[owner]);
  await q("insert into cash_activities(user_id,portfolio_id,bucket_id,type,amount,original_amount,currency,rate_at_time,date) values($1,'55555555-5555-4555-8555-555555555555',$2,'INCOME',500,500,'USD',1,now())",[owner,seed.id]);
   u=seed;
  }
  await db.exec('set role authenticated');
  const id=await goal({bucket_id:u.id,money_mode:'saving',amount:1.01});await check(id,'2026-10-05');
  const [wallet]=await q('select * from plan_system_buckets');assert.equal(wallet.currency,'USD');assert.equal(wallet.portfolio_id,'55555555-5555-4555-8555-555555555555');assert.equal(await balance(wallet.bucket_id),1.01);assert.equal(await balance(bucket),1000);
  await undo(id,'2026-10-05');assert.equal(await balance(u.id),500);
 });
 for(const [month,frequency,start,end,expected] of [
  ['2024-02','daily','2024-02-01',null,29],
  ['2026-10','weekly_target','2026-10-30',null,2],
  ['2024-12','weekly_target','2024-12-30',null,2],
  ['2025-01','weekly_target','2025-01-01','2025-01-05',3],
  ['2024-02','monthly','2024-02-01',null,1],
  ['2026-10','weekdays','2026-10-01','2026-10-10',4],
 ])await run(`complete month exact cents: ${month} ${frequency}`,async()=>{
  await clock('2026-12-31');const id=await goal({amount:100.01,amount_period:'month',starts_on:start,ends_on:end,frequency,weekly_target:3,monthly_day:31,days_of_week:[1,3,5]});
  // Independent calendar selection, reverse order to ensure remainder follows actual checks.
  const days=[];for(let n=1;n<=31;n++){const d=`${month}-${String(n).padStart(2,'0')}`;const date=new Date(d+'T00:00:00Z');if(date.toISOString().slice(0,10)!==d||d<start||(end&&d>end))continue;
   if(frequency==='monthly'&&n!==new Date(Date.UTC(+month.slice(0,4),+month.slice(5),0)).getUTCDate())continue;
   if(frequency==='weekdays'&&![1,3,5].includes(date.getUTCDay()||7))continue;days.push(d);
  }
  await check(id,days.at(-1));const l=await lock(id);assert.equal(l.required_count,expected);
  const needed=Object.values(l.schedule).flatMap(g=>[...g.days].reverse().slice(0,g.quota));
  for(const d of needed)if(d!==days.at(-1))await check(id,d);
  const rows=await q('select amount_minor from plan_checks where plan_id=$1 and credited',[id]);assert.equal(rows.length,expected);assert.equal(rows.reduce((s,r)=>s+BigInt(r.amount_minor),0n),10001n);assert.equal(await balance(bucket),899.99);
  for(const d of needed)await undo(id,d);assert.equal(await lock(id),undefined);assert.equal(await balance(bucket),1000);
 });
 await run('partial month has no remainder until completing check; partial undo retains lock',async()=>{
  const id=await goal({amount:100,amount_period:'month',starts_on:'2026-10-01',ends_on:'2026-10-03'});
  await check(id,'2026-10-03');await check(id,'2026-10-01');assert.equal(await balance(bucket),933.34);
  await undo(id,'2026-10-03');assert.ok(await lock(id));await check(id,'2026-10-02');
  const [last]=await check(id,'2026-10-03');assert.equal(Number(last.amount_minor),3334);assert.equal(await balance(bucket),900);
  await undo(id,'2026-10-01');await check(id,'2026-10-01');assert.equal(await balance(bucket),900);
 });
 await run('over-quota monthly checks stay zero and never promote after undo',async()=>{
  const id=await goal({amount:10,amount_period:'month',frequency:'weekly_target',weekly_target:1,starts_on:'2026-10-01',ends_on:'2026-10-04'});
  await check(id,'2026-10-01');const [extra]=await check(id,'2026-10-02');assert.equal(extra.credited,false);assert.equal(Number(extra.amount_minor),0);assert.equal(extra.cash_id,null);
  await undo(id,'2026-10-01');const [still]=await q('select * from plan_checks where plan_id=$1',[id]);assert.equal(still.credited,false);assert.equal(still.cash_id,null);assert.ok(await lock(id));assert.equal(await balance(bucket),1000);
  await undo(id,'2026-10-02');assert.equal(await lock(id),undefined);assert.equal(await balance(bucket),1000);
 });
 await run('per-check weekly money still requires explicit extra-debit confirmation',async()=>{
  const id=await goal({frequency:'weekly_target',weekly_target:1});await check(id,'2026-10-05');
  await reject('insert into plan_checks(plan_id,day) values($1,$2)',[id,'2026-10-06'],/Confirm extra/);
  const [extra]=await check(id,'2026-10-06',true);assert.equal(Number(extra.amount_minor),1000);assert.equal(extra.credited,false);assert.equal(await balance(bucket),980);
 });
 await run('edit locked month defers new target/rules; next month takes new values',async()=>{
  await clock('2026-10-01');const id=await goal({amount:31,amount_period:'month'});await check(id,'2026-10-01');
  await clock('2026-10-02');await q("update daily_plans set amount=60,frequency='monthly',monthly_day=1 where id=$1",[id]);
  assert.equal(Number((await lock(id)).target_minor),3100);
  await clock('2026-10-31');for(let d=2;d<=31;d++)await check(id,`2026-10-${String(d).padStart(2,'0')}`);
  assert.equal(Number((await q('select sum(amount_minor) sum from plan_checks where plan_id=$1',[id]))[0].sum),3100);
  await clock('2026-11-01');await check(id,'2026-11-01');const [nov]=await q("select * from plan_month_locks where plan_id=$1 and month_key='2026-11-01'",[id]);assert.equal(Number(nov.target_minor),6000);assert.equal(nov.required_count,1);
 });
 await run('pause/resume locked month, edit during pause, archive restore, no makeup money',async()=>{
  await clock('2026-10-01');const id=await goal({amount:31,amount_period:'month'});await check(id,'2026-10-01');
  await clock('2026-10-02');await q("update daily_plans set status='paused' where id=$1",[id]);
  await q("update daily_plans set amount=62,frequency='weekdays',days_of_week='{1}' where id=$1",[id]);
  await clock('2026-10-05');await q("update daily_plans set status='active' where id=$1",[id]);
  await reject('insert into plan_checks(plan_id,day) values($1,$2)',[id,'2026-10-03'],/paused/);
  await check(id,'2026-10-05');assert.equal((await lock(id)).stopped,true);assert.equal(Number((await lock(id)).target_minor),3100);
  await clock('2026-10-06');await q("update daily_plans set status='archived' where id=$1",[id]);await clock('2026-10-07');await q("update daily_plans set status='active' where id=$1",[id]);await check(id,'2026-10-07');
  assert.equal(await balance(bucket),997);assert.equal(Number((await lock(id)).target_minor),3100);
  await q("update daily_plans set status='paused' where id=$1",[id]);await clock('2026-10-31');
  assert.equal(await balance(bucket),997);for(const d of ['2026-10-01','2026-10-05','2026-10-07'])await undo(id,d);
  assert.equal(await lock(id),undefined);assert.equal(await balance(bucket),1000);
 });
 await run('pause before first check reduces actual weekly quota',async()=>{
  await clock('2026-10-01');const id=await goal({amount:100,amount_period:'month',frequency:'weekly_target',weekly_target:3});
  await clock('2026-10-06');await q("update daily_plans set status='paused' where id=$1",[id]);await clock('2026-10-11');await q("update daily_plans set status='active' where id=$1",[id]);
  await check(id,'2026-10-11');const l=await lock(id);assert.equal(l.schedule['week:2026-10-05'].quota,2);assert.equal(l.schedule['week:2026-10-05'].days.length,2);
  await clock('2026-10-31');for(const g of Object.values(l.schedule))for(const d of [...g.days].reverse().slice(0,g.quota))if(d!=='2026-10-11')await check(id,d);
  assert.equal(Number((await q('select sum(amount_minor) sum from plan_checks where plan_id=$1',[id]))[0].sum),10000);
 });
 await run('flexible monthly amount is explicit, bounded and undoable',async()=>{
  const id=await goal({amount:100,amount_period:'month',monthly_method:'flexible'});await check(id,'2026-10-01',false,2900);await check(id,'2026-10-02',false,7100);
  await reject('insert into plan_checks(plan_id,day,requested_minor) values($1,$2,1)',[id,'2026-10-03'],/exceeds remaining/);
  assert.equal(await balance(bucket),900);await undo(id,'2026-10-01');assert.equal(await balance(bucket),929);
 });
 await run('private lock and system tables cannot be forged or called by client',async()=>{
  await reject('delete from plan_month_locks',[],/permission denied/);
  await reject('select plan_private.apply_money_check()',[],/permission denied/);
  await reject('select plan_private.month_schedule($1,current_date)',[bucket],/permission denied/);
  const id=await goal();await q("select set_config('request.jwt.claim.sub',$1,true)",[other]);await reject('insert into plan_checks(plan_id,day) values($1,$2)',[id,'2026-10-05'],/Plan unavailable/);
 });
 await run('spent PLAN funds block undo atomically; system identity stays fixed',async()=>{
  const id=await goal({money_mode:'saving'});const [c]=await check(id,'2026-10-05');
  await reject('update money_buckets set name=$1 where id=$2',['Renamed',c.destination_bucket_id],/identity cannot|permission denied/);
  let spent;
  if(writer){const id=crypto.randomUUID();await q('select write_bucket_cash($1,$2)',[crypto.randomUUID(),{op:'create',rows:[{id,portfolio_id:'44444444-4444-4444-8444-444444444444',bucket_id:c.destination_bucket_id,type:'EXPENSE',original_amount:10,currency:'THB',rate_at_time:34,date:'2026-10-05'}]}]);spent={id};}
  else{
  const [seed]=await q("insert into cash_activities(user_id,portfolio_id,bucket_id,type,amount,original_amount,currency,rate_at_time,date) values($1,'44444444-4444-4444-8444-444444444444',$2,'EXPENSE',10/34.0,10,'THB',34,now()) returning id",[owner,c.destination_bucket_id]);
   spent=seed;
  }
  await reject('delete from plan_checks where plan_id=$1',[id],/Insufficient/);
  assert.equal((await q('select * from plan_checks where plan_id=$1',[id])).length,1);assert.equal(await balance(bucket),990);
  if(writer)await q('select write_bucket_cash($1,$2)',[crypto.randomUUID(),{op:'delete',id:spent.id}]);else await q('delete from cash_activities where id=$1',[spent.id]);await undo(id,'2026-10-05');assert.equal(await balance(bucket),1000);
 });
 await run('no client can forge snapshots, execute trigger functions or read another owner locks',async()=>{
  const id=await goal({amount_period:'month'});await check(id,'2026-10-05');
  await reject('insert into plan_checks(plan_id,day,amount_minor) values($1,$2,0)',[id,'2026-10-06'],/permission denied/);
  await reject('select public.protect_plan_bucket_activity()',[],/permission denied/);
  await reject('select public.protect_plan_bucket_identity()',[],/permission denied/);
  await q("select set_config('request.jwt.claim.sub',$1,true)",[other]);assert.equal((await q('select * from plan_month_locks')).length,0);
 });
 await run('unlock cancels obsolete queued rules before a subsequent edit',async()=>{
  await clock('2026-10-01');const id=await goal({amount:31,amount_period:'month'});await check(id,'2026-10-01');
  await clock('2026-10-02');await q('update daily_plans set amount=62 where id=$1',[id]);await undo(id,'2026-10-01');
  await clock('2026-10-03');await q('update daily_plans set amount=93 where id=$1',[id]);
  await clock('2026-11-01');await check(id,'2026-11-01');assert.equal(Number((await lock(id)).target_minor),9300);
 });
 await run('habit retaining monthly amount period still enforces its scheduled day',async()=>{
  const id=await goal({amount:0,amount_period:'month',frequency:'monthly',monthly_day:15});
  await reject('insert into plan_checks(plan_id,day) values($1,$2)',[id,'2026-10-14'],/not scheduled/);
  const [c]=await check(id,'2026-10-15');assert.equal(Number(c.amount_minor),0);assert.equal(c.cash_id,null);
 });
 await run('two THB portfolios have distinct lazy PLAN wallets',async()=>{
  await db.exec('reset role');
  await q("insert into portfolios(id,user_id,kind) values('55555555-5555-4555-8555-555555555555',$1,'cash_management')",[owner]);
  let b;
  if(writer){const id=crypto.randomUUID();await q('select save_cash_bucket($1,$2,$3,$4)',[crypto.randomUUID(),id,{name:'Other THB',portfolio_id:'55555555-5555-4555-8555-555555555555',currency:'THB',current_amount:100},34]);b={id};}
  else{
  const [seed]=await q("insert into money_buckets(user_id,portfolio_id,name,currency,current_amount) values($1,'55555555-5555-4555-8555-555555555555','Other THB','THB',100) returning id",[owner]);
  await q("insert into cash_activities(user_id,portfolio_id,bucket_id,type,amount,original_amount,currency,rate_at_time,date) values($1,'55555555-5555-4555-8555-555555555555',$2,'INCOME',100/34.0,100,'THB',34,now())",[owner,seed.id]);
   b=seed;
  }
  await db.exec('set role authenticated');
  await check(await goal({money_mode:'saving'}),'2026-10-05');await check(await goal({bucket_id:b.id,money_mode:'saving'}),'2026-10-05');
  const wallets=await q('select * from plan_system_buckets');assert.equal(wallets.length,2);assert.ok(wallets.every(w=>w.currency==='THB'));assert.notEqual(wallets[0].portfolio_id,wallets[1].portfolio_id);
 });
 // Snapshot reset was introduced by the writer migration, not the historical Phase 2 migration.
 if(writer) await run('forged reference inserts are denied to clients and reset on every zero-money path',async()=>{
  const cols=['cash_id','bucket_activity_id','destination_cash_id','destination_activity_id','source_bucket_id','destination_bucket_id','month_key','group_key'];
  const fake='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const values=[fake,fake,fake,fake,fake,fake,'1999-01-01','forged'];
  const habit=await goal({amount:0});
  for(let i=0;i<cols.length;i++)await reject(`insert into plan_checks(plan_id,day,${cols[i]}) values($1,$2,$3)`,[habit,'2026-10-05',values[i]],/permission denied/);
  // Bypass column ACL only in this rolled-back test to verify trigger defence
  // independently of grants (e.g. privileged internal caller/future ACL drift).
  await db.exec('reset role');await db.exec(`grant insert(${cols.join(',')}) on plan_checks to authenticated`);await db.exec('set role authenticated');
  const forged=(id,day)=>q(`insert into plan_checks(plan_id,day,${cols.join(',')}) values(${Array.from({length:10},(_,i)=>'$'+(i+1)).join(',')}) returning *`,[id,day,...values]);
  const [h]=await forged(habit,'2026-10-05');for(const col of cols)assert.equal(h[col],null,col);
  const monthly=await goal({amount:0.01,amount_period:'month'});const [zero]=await forged(monthly,'2026-10-05');
  assert.equal(Number(zero.amount_minor),0);assert.equal(zero.source_bucket_id,bucket);assert.equal(zero.group_key,'2026-10-05');assert.equal(new Date(zero.month_key).toISOString().slice(0,10),'2026-10-01');
  for(const col of cols.slice(0,4).concat('destination_bucket_id'))assert.equal(zero[col],null,col);
  const weekly=await goal({amount:1,amount_period:'month',frequency:'weekly_target',weekly_target:1,starts_on:'2026-10-01',ends_on:'2026-10-04'});
  await check(weekly,'2026-10-01');const [extra]=await forged(weekly,'2026-10-02');assert.equal(extra.credited,false);assert.equal(Number(extra.amount_minor),0);
  for(const col of cols.slice(0,4).concat('destination_bucket_id'))assert.equal(extra[col],null,col);
  assert.equal(extra.source_bucket_id,bucket);assert.equal(extra.group_key,'week:2026-09-28');
 });
 // Independent migration copies test real database time and safe downgrade/reapply.
 const copy=await planDatabase({testClock:false});
 try {
  await copy.exec('reset role');
  assert.equal((await copy.query("select plan_private.today()=(now() at time zone 'Asia/Bangkok')::date correct")).rows[0].correct,true);
  await copy.exec(sql('supabase/rollbacks/20261027084140_plan_atomic_money.down.sql'));
  await copy.exec(sql('supabase/migrations/20261027084140_plan_atomic_money.sql'));
  results.push('safe downgrade/reapply and actual Bangkok database clock');
  await copy.exec('set role authenticated');
  const p=(await copy.query("insert into daily_plans(name,amount,bucket_id,starts_on) values('Rollback guard',1,$1,'2026-01-01') returning id",[bucket])).rows[0];
  await copy.query("insert into plan_checks(plan_id,day) values($1,'2026-01-01')",[p.id]);
  await copy.exec('reset role');
  await assert.rejects(()=>copy.exec(sql('supabase/rollbacks/20261027084140_plan_atomic_money.down.sql')),/Unsafe phase-2 downgrade/);
  await copy.exec('rollback');assert.equal((await copy.query('select count(*) count from plan_checks')).rows[0].count,1);
  results.push('downgrade refuses to discard existing financial snapshots');
 }finally{await copy.close();}
 const legacy=await planDatabase({phase2:false});
 try {
  const [p]=(await legacy.query("insert into daily_plans(name,amount,bucket_id,starts_on) values('Legacy',0.001,$1,'2026-01-01') returning id",[bucket])).rows;
  for(const day of ['2026-01-01','2026-01-02'])await legacy.query('insert into plan_checks(plan_id,day) values($1,$2)',[p.id,day]);
  const before=(await legacy.query('select * from cash_activities order by id')).rows;
  await legacy.exec('reset role');await legacy.exec(sql('supabase/migrations/20261027084140_plan_atomic_money.sql'));
  assert.deepEqual((await legacy.query('select * from cash_activities order by id')).rows,before);
  assert.equal((await legacy.query("select count(*) count from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='plan_private' and (has_function_privilege('anon',p.oid,'EXECUTE') or has_function_privilege('authenticated',p.oid,'EXECUTE'))")).rows[0].count,0);
  await legacy.exec('set role authenticated');await legacy.query("delete from plan_checks where plan_id=$1 and day='2026-01-01'",[p.id]);
  assert.equal(Number((await legacy.query('select current_amount from money_buckets where id=$1',[bucket])).rows[0].current_amount),999.999);
  await legacy.query('delete from plan_checks where plan_id=$1',[p.id]);assert.equal(Number((await legacy.query('select current_amount from money_buckets where id=$1',[bucket])).rows[0].current_amount),1000);
  results.push('migration leaves legacy transactions intact; legacy sub-cent undo remains exact; private execute denied');
 }finally{await legacy.close();}
 console.log(JSON.stringify({passed:results.length,writer,cases:results,productionTouched:false},null,2));
}finally{await db.close();}
