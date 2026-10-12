// Render actual component source with in-memory fixtures; never load AppContext,
// browser storage, environment credentials or a Supabase client.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
function moduleUrl(path,replacements={}) {
  let code=ts.transpileModule(readFileSync(new URL(path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
  for(const [name,url] of Object.entries(replacements)) code=code.replaceAll(`from '${name}'`,`from '${url}'`);
  return `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
}
const ledger=moduleUrl('../src/lib/cost-basis-ledger.ts');
const fx=await import(moduleUrl('../src/lib/fx.ts',{'./cost-basis-ledger':ledger}));
const source=readFileSync(new URL('../src/app/(app)/portfolio/page.tsx',import.meta.url),'utf8');
const ast=ts.createSourceFile('page.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const node=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='BucketsCard');
assert.ok(node);
const code=ts.transpileModule(node.getText(ast),{compilerOptions:{jsx:ts.JsxEmit.React,target:ts.ScriptTarget.ES2022}}).outputText;
let state;
const icon=()=>React.createElement('svg',{'aria-hidden':true});
const Card=new Function('React','useApp','isFxCurrency','sumNativeMoney','decimal','formatFxMoney','PiggyBank','Plus','ACCENT','symbolOf',`${code};return BucketsCard;`)(React,()=>state,fx.isFxCurrency,fx.sumNativeMoney,fx.decimal,fx.formatMoney,icon,icon,'#4EDEA3',c=>c==='THB'?'฿':c==='USD'?'$':'');
const buckets=Object.freeze([{id:'thb',name:'THB fixture',currency:'THB',balance:10000},{id:'usd',name:'USD fixture',currency:'USD',balance:300}].map(Object.freeze));
const bytes=JSON.stringify(buckets);
for(const [rate,converted] of [[33.53,'10,059.00 THB'],[40,'12,000.00 THB'],[28,'8,400.00 THB']]) {
  state={currency:'THB',exchangeRates:{THB:rate}};
  const html=renderToStaticMarkup(React.createElement(Card,{buckets,onAdd:()=>{}}));
  assert.ok(html.includes('10,000.00 THB'));
  assert.ok(html.includes(converted));
  assert.ok(html.includes('300.00 USD'),'native caption');
  assert.equal((html.match(/<li /g)||[]).length,2,'same row count');
  assert.ok(!html.includes('NaN'));
}
state={currency:'USD',exchangeRates:{THB:40}};
const usdHtml=renderToStaticMarkup(React.createElement(Card,{buckets,onAdd:()=>{}}));
assert.ok(usdHtml.includes('250.00 USD'));
assert.ok(usdHtml.includes('10,000.00 THB'));
const unresolved=renderToStaticMarkup(React.createElement(Card,{buckets:[{id:'unknown',name:'Unknown',balance:10}],onAdd:()=>{}}));
assert.ok(unresolved.includes('unresolved'));
assert.ok(!unresolved.includes('NaN')&&!unresolved.includes('10.00 USD'));
assert.equal(JSON.stringify(buckets),bytes);
assert.ok(source.includes('Object.is(bucket.balance, next?.balance)'));
assert.ok(source.includes('Object.is(holding.price, next?.price)'));
console.log('PASS native UI SSR: actual Bucket component, 3 rates, same-currency identity, original caption, unresolved, stable row count, immutable fixtures, unresolved sync guards. No browser/DB/storage touched.');
