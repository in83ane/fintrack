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
const {matchesRecord}=await import(moduleUrl('./record-search.ts',{'./cashflow-selectors':moduleUrl('./cashflow-selectors.ts',{'./fx':fx})}));

test('record search matches notes, categories, names and date formats in both languages',()=>{
 const r={note:'PLAN · Japan trip',category:'Food',type:'EXPENSE',date:'2026-10-26T18:00:00Z'};
 for(const q of ['japan','plan trip','FOOD','27/10/2026','2026-10','27/10/2569','ตุลาคม','October','อาหาร','True Money'])assert.equal(matchesRecord(q,r,['True Money']),true,q);
 for(const q of ['rent','japan 2025','2026-10-26'])assert.equal(matchesRecord(q,r),false,q);
 assert.equal(matchesRecord('',r),true);
 assert.equal(matchesRecord('AAPL',{asset:'AAPL',date:'bad'}),true);
});
test('worker delivery has no email network path or configuration dependency',()=>{
 const source=readFileSync(new URL('../../supabase/functions/price-email-alerts/index.js',import.meta.url),'utf8');
 assert.equal(source.includes('sendEmail'),false);assert.equal(source.includes('RESEND_API_KEY'),false);
 assert.ok(source.includes("status:'triggered'"));
});
