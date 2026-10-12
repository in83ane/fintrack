import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

// Exercise the actual component state declaration and controlled-input expression.
const source=readFileSync(new URL('../src/components/CostBasisPanel.tsx',import.meta.url),'utf8');
const state=source.match(/const \[price,setPrice\] = useState[^;]+;/)?.[0];
const expression=source.match(/const effectivePrice=[^;]+;/)?.[0];
assert.ok(state && expression);
let value, initialized=false;
const useState=initial=>{if(!initialized){value=initial;initialized=true;}return [value,next=>{value=next;}];};
const code=ts.transpileModule(`function field(market:number){${state}${expression}return {value:effectivePrice,edit:setPrice};}`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const field=new Function('useState',`${code};return field;`)(useState);
assert.equal(field(382.7).value,'382.7');
assert.equal(field(383).value,'383','unedited field follows quote');
for(const text of ['382.','382','38','3','']){field(383).edit(text);assert.equal(field(383).value,text);}
assert.equal(field(390).value,'','quote update must not refill deliberately cleared input');
for(const text of ['4','40','400.','400.25']){field(390).edit(text);assert.equal(field(390).value,text);}
assert.equal(field(395).value,'400.25','manual price survives subsequent quote updates');
const blurBody=source.match(/onBlur=\{\(\)=>\{(if\(price!==null[^}]+)\}\}/)?.[1];
assert.ok(blurBody,'empty field returns to market only on blur');
const blur=()=>new Function('price','setPrice',blurBody)(value,next=>{value=next;});
field(395).edit('');assert.equal(field(395).value,'');blur();assert.equal(field(395).value,'395');
field(395).edit('400.25');blur();assert.equal(field(410).value,'400.25');
assert.ok(source.includes("placeholder={market>0?String(market):'รอราคาตลาด'}"));
assert.match(source,/value=\{effectivePrice\} onChange=\{e=>setPrice\(e.target.value\)\}/);
assert.ok(source.includes("throw Error('กรุณาระบุราคาขายมากกว่า 0')"));
console.log('PASS: manual sell price clears, permits intermediate typing, survives quote refresh, and validates before preview.');
