import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
function moduleUrl(path, replacements = {}) {
  let code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  for (const [name, url] of Object.entries(replacements)) code = code.replaceAll(`from '${name}'`, `from '${url}'`);
  return `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
}
const ledger = moduleUrl('../src/lib/cost-basis-ledger.ts');
const fx = moduleUrl('../src/lib/fx.ts', {'./cost-basis-ledger':ledger});
const {getNativeLeg,bucketNativeAmount,nativeBucketBalance} = await import(moduleUrl('../src/lib/native-money.ts', {'./fx':fx}));
const row = Object.freeze({original_amount:1000,currency:'THB',rate_at_time:36.5,amount:27.3973});
const bytes = JSON.stringify(row);
for (const currentRate of [33.53,40,28]) {
  const fixture = {...row,currentRate};
  assert.equal(nativeBucketBalance(2000,fixture,'THB',-1),1000);
  assert.equal(nativeBucketBalance(1000,fixture,'THB',1),2000);
  assert.equal(nativeBucketBalance(0,fixture,'THB',1),1000);
}
assert.equal(JSON.stringify(row),bytes);
assert.throws(()=>bucketNativeAmount(row,'USD'),/สกุลรายการไม่ตรง/);
for (const invalid of [{currency:'THB'},{original_amount:1},{original_amount:null,currency:'THB'},{original_amount:' ',currency:'THB'},{original_amount:-1,currency:'THB'}]) assert.throws(()=>getNativeLeg(invalid));
assert.equal(getNativeLeg({original_amount:0,currency:'THB'}).amount,0);
assert.throws(()=>nativeBucketBalance(999,row,'THB',-1),/ไม่เพียงพอ/);
assert.equal(nativeBucketBalance(0.1,{original_amount:0.2,currency:'THB'},'THB',1),0.3);
const context = readFileSync(new URL('../src/context/AppContext.tsx',import.meta.url),'utf8');
const reverse = context.slice(context.indexOf('const removeCashActivity ='),context.indexOf('const updateAllocation ='));
assert.ok(!reverse.includes('exchangeRates'), 'reversal cannot depend on live rates');
const trade = context.slice(context.indexOf('const addTradeFromBucket ='),context.indexOf('const activePortfolio =',context.indexOf('const addTradeFromBucket =')));
assert.ok(!trade.includes('exchangeRates'), 'trade bucket debit cannot depend on live rates');
const board = readFileSync(new URL('../src/app/(app)/portfolio/page.tsx',import.meta.url),'utf8');
assert.ok(!board.includes('setItem(STORAGE_KEY'), 'legacy board snapshot remains untouched');
assert.ok(board.includes('JSON.stringify({ holdingGroups, holdingGroupIds })'));
console.log('PASS native: exact recorded reversal at 3 current rates, debit/credit, mismatch/missing rejection, zero, Decimal sum, source guards, legacy board preservation.');
