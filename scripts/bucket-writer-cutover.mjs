// Preparation only: no connection, credentials, execution or backup.
// A single DO statement keeps schema, original migration history and smoke checks
// atomic even when an operator's SQL transport does not supply a transaction.
import {readFileSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const migrations=[
 ['20261027075524_plan_recurrence_rules.sql','e1bc0b79b4baaad3e563ec589abfd56912a374205b3e8ad9ae608880182cc4d3'],
 ['20261027081807_plan_monthly_recurrence_guard.sql','d6cdbb1d5c5ae91b360b8a730af14c0dfc64d8c76065799c613c38beae598655'],
 ['20261027084140_plan_atomic_money.sql','73ff197b749cf2634e2c6b24c28f37902e79cbca22c227a201c05a8bdacbe8e2'],
 ['20261027131636_bucket_atomic_writer.sql','21462c93841975388899f9d3e793cd9e2c72bbdc45ac22d50690796984509ac1'],
];
const literal=value=>"'"+value.replaceAll("'","''")+"'";
const quote=value=>{assert(!value.includes('$cutover_source$'));return '$cutover_source$'+value+'$cutover_source$';};
const fingerprint=`foreach target in array array['money_buckets','cash_activities','bucket_activities','brokerage_cash_entries','daily_plans','plan_checks','portfolios'] loop
 execute format('select md5(coalesce(string_agg(md5(to_jsonb(r)::text), '''' order by to_jsonb(r)::text), '''')) from public.%I r',target) into digest;
 fingerprints:=fingerprints||jsonb_build_object(target,digest);
end loop;`;
export function prepareCutover(){
 const markerNames=readdirSync('supabase/migrations').filter(x=>x.endsWith('_bucket_writer_release_verified.sql'));
 assert.equal(markerNames.length,1);
 const marker=readFileSync('supabase/migrations/'+markerNames[0],'utf8');
 const smoke=readFileSync('scripts/bucket-writer-cutover-smoke.sql','utf8');
 const bodies=migrations.map(([file,hash])=>{
  const bytes=readFileSync('supabase/migrations/'+file);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),hash,`Source fingerprint changed: ${file}`);
  const original=bytes.toString('utf8');
  let body=original;
  if(file.includes('bucket_atomic_writer')){
   assert.equal((body.match(/^begin;\r?$/gmi)||[]).length,1);
   assert.equal((body.match(/^commit;\r?$/gmi)||[]).length,1);
   body=body.replace(/^begin;\r?$/mi,'').replace(/^commit;\r?$/mi,'');
  }
  const version=file.slice(0,14),name=file.slice(15,-4);
  return `execute ${quote(body)};\ninsert into supabase_migrations.schema_migrations(version,name,statements) values(${literal(version)},${literal(name)},array[${quote(original)}]);`;
 });
 return `do $cutover$
declare target text; digest text; fingerprints jsonb:='{}'; before_fingerprints jsonb;
begin
 perform set_config('lock_timeout','5s',true);
 perform set_config('statement_timeout','60s',true);
 lock table public.money_buckets,public.cash_activities,public.bucket_activities,public.brokerage_cash_entries,public.daily_plans,public.plan_checks,public.portfolios in share row exclusive mode;
 if current_setting('server_version_num')::integer/10000<>17
  or to_regnamespace('plan_private') is not null or to_regnamespace('bucket_private') is not null
  or exists(select 1 from supabase_migrations.schema_migrations where version in ('20261027075524','20261027081807','20261027084140','20261027131636'))
  or exists(select 1 from public.daily_plans) or exists(select 1 from public.plan_checks) then
  raise exception 'CUTOVER_BASELINE_CHANGED';
 end if;
 if exists(select 1 from pg_trigger where tgrelid='auth.users'::regclass and not tgisinternal) then
  raise exception 'CUTOVER_AUTH_TRIGGER_REVIEW_REQUIRED';
 end if;
 ${fingerprint}
 before_fingerprints:=fingerprints;
 ${bodies.join('\n')}
 execute ${quote(marker)};
 execute ${quote(smoke)};
 fingerprints:='{}';
 ${fingerprint}
 if fingerprints is distinct from before_fingerprints then raise exception 'CUTOVER_EXISTING_ROWS_CHANGED'; end if;
end $cutover$;`;
}
if(process.argv.includes('--print'))process.stdout.write(prepareCutover());
