import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
function moduleUrl(file, imports={}) {
 let source=readFileSync(file,'utf8');
 for(const [name,url] of Object.entries(imports))source=source.replace("'"+name+"'",JSON.stringify(url));
 return 'data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64');
}
const {portfolioAsset,portfolioTrade,replacePortfolioScope}=await import(moduleUrl('src/lib/portfolio-projection.ts',{'./instrument-metadata':moduleUrl('src/lib/instrument-metadata.ts')}));
const all=[
 portfolioAsset({id:'a',portfolio_id:'dime',symbol:'AAPL',name:'Apple',quantity:2,current_price:120,avg_purchase_price:100,is_active:true}),
 portfolioAsset({id:'b',portfolio_id:'webull',symbol:'AAPL',name:'Apple',quantity:3,current_price:120,avg_purchase_price:90,is_active:true}),
];
const totals=rows=>Object.fromEntries(['dime','webull'].map(id=>[id,rows.filter(r=>r.portfolioId===id).reduce((sum,r)=>sum+r.valueUSD,0)]));
for(const scope of ['dime','webull','empty',null])assert.deepEqual(totals(replacePortfolioScope(all,scope?all.filter(r=>r.portfolioId===scope):all,scope)),{dime:240,webull:360});
assert.deepEqual(totals(replacePortfolioScope(all,[],'webull')),{dime:240,webull:0},'deleting all holdings from one broker does not erase the other');
assert.deepEqual(totals(replacePortfolioScope(all,[{...all[1],shares:4,valueUSD:480}],'webull')),{dime:240,webull:480},'edits replace a scope without double-counting');
assert.equal(all[0].shares,2);assert.equal(all[1].shares,3);
const sale=portfolioTrade({id:'abcdef00-1234',symbol:'AAPL',portfolio_id:'dime',type:'SELL',quantity:1,execution_date:'2026-11-05',amount_usd:120,price_at_execution:120,fees:1,portfolios:{cost_include_fees:false},cost_basis_sales:{method:'SPECIFIC_LOT',request:{closeMode:'FIFO'},selections:[{lotId:'old',qty:'1'}]},tags:['FX USD/THB 33.604']});
assert.equal(sale.portfolioId,'dime');assert.equal(sale.fxRateTHB,33.604);assert.equal(sale.closeMode,'FIFO');assert.equal(sale.includeFees,false);assert.equal(sale.fees,1);assert.deepEqual(sale.lotSelections,[{lotId:'old',qty:'1'}]);
console.log('PASS per-broker assets, identical symbols, empty portfolios, deletions, edits and cost-basis metadata');
