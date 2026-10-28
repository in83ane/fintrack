import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
const require = createRequire(path.join(os.tmpdir(), 'fintrack-cashflow-qa/package.json'));
const {build} = require('esbuild');
const bundle = await build({stdin:{contents:`export * from './src/lib/memory-resource'; export * from './src/lib/financial-snapshot'; export * from './src/lib/loading-policy';`,resolveDir:process.cwd()},bundle:true,write:false,platform:'node',format:'esm',plugins:[{name:'read-only-database-fixture',setup(b){
  b.onResolve({filter:/^\.\/supabase$/},()=>({path:'db',namespace:'fixture'}));
  b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:`const fetch=async(user)=>{globalThis.__reads++;return {error:null,data:[{id:'1',user_id:user,portfolio_id:'dime'},{id:'2',user_id:user,portfolio_id:'webull'},{id:'3',user_id:user,portfolio_id:'cash'}]}};export const db=Object.fromEntries(['assets','trades','allocations','buckets','bucketActivities','cashActivities','userCategories','brokerageAccounts','brokerageCashEntries'].map(key=>[key,{getAll:fetch,getBalances:fetch}]));`,loader:'js'}));
}}]});
const {MemoryResource,STALE_TTL,financialSnapshots,readFinancialSnapshot,scopeFinancialSnapshot,afterFinancialWrite} = await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
globalThis.__reads=0;
const [first,deduped]=await Promise.all([readFinancialSnapshot('alice'),readFinancialSnapshot('alice')]);
assert.equal(first,deduped);assert.equal(globalThis.__reads,10);
for(let i=0;i<10;i++) {
  const portfolio=[null,'dime','webull'][i%3];
  const snapshot=await readFinancialSnapshot('alice');
  const scoped=scopeFinancialSnapshot(snapshot,portfolio,'cash',portfolio);
  assert.equal(scoped,scopeFinancialSnapshot(snapshot,portfolio,'cash',portfolio),'Per-portfolio projection is reused');
  assert.equal(scoped[0].data.length,portfolio?1:3);
  if(portfolio)assert.equal(scoped[0].data[0].portfolio_id,portfolio);
  assert.equal(scoped[4].data[0].portfolio_id,'cash');
}
assert.equal(globalThis.__reads,10,'Ten fresh switches issue no duplicate reads');
const other=await readFinancialSnapshot('bob');assert.equal(other[0].data[0].user_id,'bob');assert.notEqual(first,other);
afterFinancialWrite({error:null});assert.equal(financialSnapshots.fresh('alice'),false);await readFinancialSnapshot('alice');assert.equal(globalThis.__reads,30);
const clock=Date.now;let now=100000;Date.now=()=>now;
try {
  const cache=new MemoryResource();let reads=0;
  await cache.read('p',async()=>({value:++reads}));now+=STALE_TTL-1;assert.equal(cache.fresh('p'),true);
  now+=2;assert.equal(cache.fresh('p'),false);assert.equal(cache.peek('p').value,1,'Stale value remains usable');
  await assert.rejects(cache.read('p',async()=>{throw Error('offline')}));assert.equal(cache.peek('p').value,1,'Error must not discard stale values');
  await cache.read('p',async()=>({value:++reads}));assert.equal(cache.peek('p').value,2);
  let resolve;const obsolete=cache.read('race',()=>new Promise(r=>resolve=r));cache.invalidate('race');await cache.read('race',async()=>({value:2}));resolve({value:1});await obsolete;assert.equal(cache.peek('race').value,2,'Late response must not replace newer data');
} finally {Date.now=clock;}
console.log('PASS: 10 portfolio switches / 0 duplicate reads, user isolation, per-portfolio projections, 60s TTL, stale-on-error, write invalidation, in-flight deduplication and obsolete response race');
