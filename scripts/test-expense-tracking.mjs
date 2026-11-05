import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
function moduleUrl(path, imports={}) {
  let source=readFileSync(path,'utf8');
  for(const [name,url] of Object.entries(imports)) source=source.replace("'" + name + "'",JSON.stringify(url));
  const {outputText}=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}});
  return 'data:text/javascript;base64,'+Buffer.from(outputText).toString('base64');
}
const fx=moduleUrl('src/lib/fx.ts',{'./cost-basis-ledger':moduleUrl('src/lib/cost-basis-ledger.ts')});
const cash=moduleUrl('src/lib/cashflow-selectors.ts',{'./fx':fx});
const {summarizeTracker,spendingByCategory,parseKeywords}=await import(moduleUrl('src/lib/expense-tracking.ts',{'./cashflow-selectors':cash}));
const game={id:'game',name:'PUBG',category:'entertainment',keywords:parseKeywords('PUBG, pubg'),opening_amount:500,currency:'THB',opening_fx:34};
const whole={...game,id:'whole',name:'Entertainment',keywords:[],opening_amount:100};
const topups=['เติม pubg | Paid from: Games','พับจี','Cinema','Paid from: PUBG wallet','PUBG','PUBG','PUBG'];
const rows=topups.map((note,i)=>({id:String(i),date:'2026-01-01',note,type:i===4?'INCOME':'EXPENSE',category:i===5?'food':'Entertainment',originalAmount:50,currency:'THB',isTransfer:i===6}));
rows.push({...rows[0],id:'usd',note:'ＰＵＢＧ',originalAmount:2,currency:'USD',rateAtTime:35});
const calc=(tracker,records=rows)=>summarizeTracker(tracker,records,[game,whole],{THB:40});
const original=calc(game);
assert.equal(original.totalMinor,62000);
assert.deepEqual(original.suggestions.map(row=>row.id),['1','2','3']);
assert.deepEqual(original.rows.map(row=>row.label),['เติม pubg','ＰＵＢＧ']);
const skip={...game,choices:[{activity_id:'1',decision:'skip'}]};
assert.deepEqual(calc(skip).skipped.map(row=>row.id),['1']);
const restored={...game,choices:[{activity_id:'1',decision:'include'}]};
assert.equal(calc(restored).totalMinor,67000);
assert.equal(calc(whole).totalMinor,87000);
assert.equal(calc(whole).rows.length,5);
assert.equal(calc(restored,rows.filter(r=>r.id!=='1')).totalMinor,62000);
assert.equal(calc(restored,rows.map(r=>r.id==='1'?{...r,category:'food'}:r)).totalMinor,62000);
assert.equal(calc(game,[]).totalMinor,50000);

const categories = rules => Object.fromEntries(spendingByCategory(rows,rules,'THB',{THB:40}).map(g => [g.key,g]));
assert.equal(categories([]).entertainment.totalMinor,27000,'show the whole Ledger category with no saved tracker');
assert.equal(categories([]).food.totalMinor,5000,'show categories that have never been tracked');
const secondGame = {...game,id:'another',opening_amount:25};
const all = categories([skip,secondGame,whole]);
assert.equal(all.entertainment.rows.length,5,'overlapping topics and skipped suggestions never remove or duplicate a Ledger expense');
assert.equal(all.entertainment.openingMinor,62500);
assert.equal(all.entertainment.totalMinor,89500);
assert.equal(categories([{...game,category:'Hobby'}]).hobby.totalMinor,50000,'historical spending is visible ahead of the first Ledger entry');
console.log('PASS opening amounts, category rollup, comment normalization, skip/restore, exclusions, edits, deletions and FX.');

const incomeTopic = {...game,id:'income-topic',kind:'INCOME',name:'Design work',category:'freelance',keywords:['design'],opening_amount:1000};
const incomeWhole = {...incomeTopic,id:'income-whole',keywords:[],opening_amount:200};
const expenseSameCategory = {...game,id:'expense-same',category:'freelance',opening_amount:9000};
const incoming = [
 {id:'in',date:'2026-11-01',type:'INCOME',category:'freelance',note:'DESIGN logo',originalAmount:400,currency:'THB'},
 {id:'deposit',date:'2026-11-02',type:'DEPOSIT',category:'freelance',note:'design website',originalAmount:2,currency:'USD',rateAtTime:35},
 {id:'suggestion',date:'2026-11-03',type:'INCOME',category:'freelance',note:'งานออกแบบ',originalAmount:50,currency:'THB'},
 {id:'transfer',date:'2026-11-04',type:'INCOME',category:'freelance',note:'design',originalAmount:999,currency:'THB',isTransfer:true},
 {id:'expense',date:'2026-11-04',type:'EXPENSE',category:'freelance',note:'design',originalAmount:600,currency:'THB'},
];
const rules = [incomeTopic,incomeWhole,expenseSameCategory];
const received = summarizeTracker(incomeTopic,incoming,rules,{THB:40});
assert.equal(received.ledgerMinor,47000,'income + deposits use transaction FX');
assert.equal(received.totalMinor,147000,'received + historical income');
assert.deepEqual(received.suggestions.map(r=>r.id),['suggestion']);
assert.equal(summarizeTracker(incomeWhole,incoming,rules,{THB:40}).totalMinor,172000,'category includes income topic openings only');
assert.equal(spendingByCategory(incoming,rules,'THB',{THB:40},'INCOME')[0].totalMinor,172000,'overview never includes expense opening balances');
assert.equal(spendingByCategory(incoming,rules,'THB',{THB:40})[0].totalMinor,960000,'expense mode remains separate');
const skippedIncome={...incomeTopic,choices:[{activity_id:'in',decision:'skip'}]};
assert.equal(summarizeTracker(skippedIncome,incoming,rules,{THB:40}).totalMinor,107000);
assert.equal(summarizeTracker({...incomeTopic,choices:[{activity_id:'suggestion',decision:'include'}]},incoming,rules,{THB:40}).totalMinor,152000);
assert.equal(summarizeTracker(incomeTopic,incoming.filter(r=>r.id!=='in'),rules,{THB:40}).totalMinor,107000);
assert.equal(summarizeTracker(incomeTopic,incoming.map(r=>r.id==='in'?{...r,type:'EXPENSE'}:r),rules,{THB:40}).totalMinor,107000,'Ledger direction edits remove income automatically');
assert.equal(spendingByCategory(incoming,[],'THB',{THB:40},'INCOME')[0].totalMinor,52000,'all income available without creating topics');
console.log('PASS income directions, transfers, category isolation, openings, multi-currency, skip/include and Ledger edits.');
