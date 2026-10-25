import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
function moduleUrl(path, replacements = {}) {
  let code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  for (const [name, url] of Object.entries(replacements)) code = code.replaceAll(`from '${name}'`, `from '${url}'`);
  return `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
}
const fx = moduleUrl('./fx.ts', { './cost-basis-ledger': moduleUrl('./cost-basis-ledger.ts') });
const cashUrl = moduleUrl('./cashflow-selectors.ts', { './fx': fx });
const { getCashflowSummary, formatCashflowMoney } = await import(cashUrl);
const { getLedgerView } = await import(moduleUrl('./ledger-selectors.ts', { './cashflow-selectors': cashUrl }));
const row=(id,type,amount,more={})=>({id,type,originalAmount:amount,currency:'THB',amountUSD:amount/33.7,date:'2026-10-24T17:00:00Z',category:'Food',...more});
const records=[row('salary','INCOME',8270.28),row('food','EXPENSE',126),row('e2','EXPENSE',20),row('e3','EXPENSE',110),row('other','EXPENSE',5517.20),row('satang','EXPENSE',.01),row('transfer','DEPOSIT',500,{isTransfer:true})];
const scope={from:'2026-10-01',to:'2026-10-31',currency:'THB',exchangeRates:{THB:40}};
test('visible ledger rows, day nets, Dashboard and Cash Flow agree to the satang',()=>{
 const ledger=getLedgerView(records,scope), shared=getCashflowSummary(records,scope);
 assert.deepEqual([ledger.inMinor,ledger.outMinor,ledger.netMinor],[827028,577321,249707]);
 assert.equal(ledger.netMinor,shared.netMinor);
 assert.equal(ledger.groups.reduce((s,g)=>s+g.netMinor,0),ledger.netMinor);
 assert.equal(ledger.rows.filter(r=>r.included).reduce((s,r)=>s+r.signedMinor,0),ledger.netMinor);
 assert.equal(formatCashflowMoney(ledger.rows.find(r=>r.id==='cash:food').minor,'THB'),'฿126.00');
 assert.equal(getLedgerView(records.filter(r=>r.id!=='satang'),scope).netMinor-ledger.netMinor,1);
 assert.equal(ledger.groups[0].day,'2026-10-25');
});
test('type and wallet filters change rows and totals together without double counting transfers',()=>{
 const trades=[row('b','BUY',300),row('s','SELL',50),row('d','DIVIDEND',5)];
 const all=getLedgerView(records,{...scope,trades},'all');
 assert.equal(all.netMinor,getCashflowSummary(records,{...scope,trades,includeInvestments:true}).netMinor);
 const transfers=getLedgerView(records,{...scope,trades},'transfer');
 assert.equal(transfers.rows.length,1);assert.equal(transfers.netMinor,0);
 const only=getLedgerView(records,{...scope,trades},'trade');
 assert.equal(only.rows.length,3);assert.equal(only.netMinor,-24500);
 const pending=getLedgerView(records,scope,'cash',['cash:food']);assert.equal(pending.netMinor,249707+12600);
 const wallet=getLedgerView([row('a','INCOME',10,{bucketId:'a'}),row('b','EXPENSE',5,{bucketId:'b'})],{...scope,walletId:'a'});assert.equal(wallet.rows.length,1);assert.equal(wallet.netMinor,1000);
});
