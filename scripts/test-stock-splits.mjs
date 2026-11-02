import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const js=ts.transpileModule(readFileSync(new URL('../src/lib/stock-splits.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {parseStockSplits,validateStockSplit,fetchStockSplits}=await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
const fixture={chart:{result:[{meta:{symbol:'TEST',exchangeTimezoneName:'America/New_York'},events:{splits:{'monthly-bucket-is-not-effective-date':{date:Date.parse('2025-11-17T14:30:00Z')/1000,numerator:10,denominator:1}}}}]}};
assert.equal(parseStockSplits('TEST',fixture,'2025-01-01','2026-11-02')[0].date,'2025-11-17');
assert.deepEqual(parseStockSplits('TEST',fixture,'2025-11-17','2026-11-02'),[]);
assert.deepEqual(parseStockSplits('TEST',fixture,'2025-01-01','2025-11-01'),[]);
assert.throws(()=>parseStockSplits('WRONG',fixture,'2025-01-01','2026-11-02'),/unavailable/);
assert.throws(()=>parseStockSplits('TEST',{chart:{error:{code:'Not Found'}}},'2025-01-01','2026-11-02'),/unavailable/);
const split={symbol:'ANY-STOCK',date:'2025-01-01',numerator:1,denominator:10,source:'Broker notice'};
assert.ok(validateStockSplit(split,'2026-11-02'));
for(const bad of [{numerator:0},{denominator:0},{numerator:1.5},{date:'2025-02-31'},{date:'2099-01-01'},{source:''},{symbol:'../bad'}])assert.equal(validateStockSplit({...split,...bad},'2026-11-02'),false);
if(process.argv.includes('--live')) {
 const events=await fetchStockSplits('NFLX','2025-01-01','2026-11-02');
 assert.ok(events.some(e=>e.date==='2025-11-17'&&e.numerator===10&&e.denominator===1));
 console.log('Live stock split discovery passed.');
}
console.log('PASS: generic symbols, forward/reverse ratios, actual event dates, future filtering and explicit unavailable history.');
