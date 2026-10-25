import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

// Execute the production selector and existing Decimal engine without loading
// AppContext, credentials, storage or a database client.
function moduleUrl(path, replacements = {}) {
  let code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  for (const [name, url] of Object.entries(replacements)) code = code.replaceAll(`from '${name}'`, `from '${url}'`);
  return `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
}
const ledger = moduleUrl('./cost-basis-ledger.ts');
const fx = moduleUrl('./fx.ts', { './cost-basis-ledger': ledger });
const api = await import(moduleUrl('./cashflow-selectors.ts', { './fx': fx }));
const { getCashflowSummary, getMonthlySeries, getDailySeries, getFlowGraph, getCategoryBreakdown, transactionMoney, displayCashflowCategory, formatCashflowMoney } = api;
const scope = { from:'2026-10-01', to:'2026-10-31', currency:'THB', exchangeRates:{THB:33.709}, timeZone:'Asia/Bangkok' };
const row = (id,type,amount,wallet='a',extra={}) => ({ id,type,originalAmount:amount,currency:'THB',amountUSD:amount/33.7,rateAtTime:33.7,date:'2026-10-25T03:00:00Z',bucketId:wallet,category:'Food',...extra });

test('native THB survives USD projection drift and current rate changes to the satang', () => {
  for (const amount of [126,20,110,0.01]) for (const rate of [33.709,40,28]) {
    const value = transactionMoney(row('r','EXPENSE',amount), {...scope,exchangeRates:{THB:rate}});
    assert.equal(value.minor, amount*100);
    assert.equal(formatCashflowMoney(value.minor,'THB'), `฿${amount.toFixed(2)}`);
  }
  assert.equal(transactionMoney(row('r','EXPENSE',126), {...scope,currency:'USD'}).minor,374);
});
test('cash, monthly, daily, category and Sankey consumers reconcile exactly including one satang', () => {
  const records = [row('income','INCOME',8270.28), row('e1','EXPENSE',126), row('e2','EXPENSE',20), row('e3','EXPENSE',110), row('e4','EXPENSE',5517.20), row('one-satang','EXPENSE',.01), row('transfer','DEPOSIT',999,'a',{isTransfer:true}), row('next-month','INCOME',100,'a',{date:'2026-10-31T17:00:00Z'})];
  const summary = getCashflowSummary(records,scope);
  assert.deepEqual([summary.incomeMinor,summary.expenseMinor,summary.netMinor],[827028,577321,249707]);
  const monthly = getMonthlySeries(records,scope,1)[0];
  const daily = getDailySeries(records,scope,'2026-10','2026-10-31');
  assert.deepEqual([monthly.incomeMinor,monthly.expenseMinor,monthly.netMinor],[827028,577321,249707]);
  assert.equal(daily.rows.at(-1).netMinor,249707);
  assert.equal(getCategoryBreakdown(summary).reduce((s,c)=>s+c.minor,0),577321);
  const graph = getFlowGraph(summary,[{id:'a',name:'True Money'}]);
  assert.equal(graph.nodes.find(n=>n.id==='saved').minor,249707);
  assert.equal(graph.netMinor,249707);
  assert.equal(graph.inflowMinor-graph.expenseMinor-graph.investedMinor,graph.netMinor);
  // Integration contract: all three production pages pass native currency to the shared selector.
  for (const name of ['cashflow','ledger','dashboard']) {
    const page = readFileSync(new URL(`../app/(app)/${name}/page.tsx`,import.meta.url),'utf8');
    assert.match(page,/getCashflowSummary\(/,name);
    assert.match(page,/formatCashflowMoney\(/,name);
  }
});
test('investment toggle keeps sells out of income and buys out of normal expenses; dividend remains income', () => {
  const records=[row('salary','INCOME',1000),row('food','EXPENSE',100)];
  const trades=[row('buy','BUY',300,'a',{portfolioId:'p'}),row('sell','SELL',80,'a',{portfolioId:'p'}),row('div','DIVIDEND',5,'a',{portfolioId:'p'}),row('import','IMPORT',50000),row('other-portfolio','BUY',999,'b',{portfolioId:'q'})];
  const off=getCashflowSummary(records,{...scope,trades,portfolioId:'p'});
  const on=getCashflowSummary(records,{...scope,trades,portfolioId:'p',includeInvestments:true});
  assert.deepEqual([off.incomeMinor,off.expenseMinor,off.netMinor],[100500,10000,90500]);
  assert.deepEqual([on.incomeMinor,on.expenseMinor,on.investedMinor,on.proceedsMinor,on.netInvestedMinor,on.netMinor],[100500,10000,30000,8000,22000,68500]);
  assert.equal(getMonthlySeries(records,{...scope,trades,portfolioId:'p',includeInvestments:true},1)[0].netMinor,on.netMinor);
});
test('wallet scope, local midnight, aliases and missing FX are explicit', () => {
  const records=[row('food','EXPENSE',126),row('thai','EXPENSE',20,'a',{category:'อาหาร'}),row('other','EXPENSE',99,'b'),row('midnight','INCOME',10,'a',{date:'2026-09-30T17:00:00Z'}),row('before','INCOME',99,'a',{date:'2026-09-30T16:59:59Z'})];
  const summary=getCashflowSummary(records,{...scope,walletId:'a'});
  assert.equal(summary.expenseMinor,14600); assert.equal(summary.incomeMinor,1000);
  assert.equal(getCategoryBreakdown(summary).length,1);
  assert.equal(displayCashflowCategory('Food','th'),'อาหาร');
  assert.equal(displayCashflowCategory('อาหาร','en'),'Food');
  const missing=getCashflowSummary([{type:'INCOME',date:'2026-10-25',originalAmount:1,currency:'USD'}],{...scope,exchangeRates:{}});
  assert.equal(missing.missing.length,1); assert.equal(missing.hasActivity,false);
});
test('each wallet node conserves money even with unlinked balances; inputs are immutable', () => {
  const records=Object.freeze([Object.freeze(row('salary','INCOME',1000,'a')),Object.freeze(row('food','EXPENSE',400,'b')),Object.freeze(row('food2','EXPENSE',100,'a'))]);
  const before=JSON.stringify(records), summary=getCashflowSummary(records,scope), graph=getFlowGraph(summary,[{id:'a',name:'A'},{id:'b',name:'B'}]);
  for(const wallet of graph.nodes.filter(n=>n.layer===1)) assert.equal(graph.links.filter(l=>l.target===wallet.id).reduce((s,l)=>s+l.minor,0),graph.links.filter(l=>l.source===wallet.id).reduce((s,l)=>s+l.minor,0));
  assert.equal(graph.nodes.find(n=>n.id==='saved').minor,50000);
  assert.equal(graph.reconciliationMinor,40000);
  assert.equal(JSON.stringify(records),before);
});
