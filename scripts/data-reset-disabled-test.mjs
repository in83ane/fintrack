// Offline only: bundle the real db helper with a fail-fast SDK mock. No env files.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const require = createRequire(path.join(os.tmpdir(), 'fintrack-cashflow-qa/package.json'));
const {build} = require('esbuild');
const calls = {rpc:0, auth:0, other:0, network:0};
globalThis.__resetTestCalls = calls;
const oldFetch = globalThis.fetch;
globalThis.fetch = () => { calls.network++; throw Error('Network forbidden'); };
try {
  const bundle = await build({
    stdin:{contents:"export {db} from './src/lib/supabase'; export * from './src/lib/data-reset-policy';",resolveDir:process.cwd(),loader:'ts'},
    bundle:true,write:false,format:'esm',platform:'node',plugins:[{name:'offline-sdk',setup(b){
      b.onResolve({filter:/^@supabase\/supabase-js$/},()=>({path:'sdk',namespace:'mock'}));
      b.onResolve({filter:/^\.\/env$/},()=>({path:'env',namespace:'mock'}));
      b.onLoad({filter:/.*/,namespace:'mock'},a=>({contents:a.path==='env'
        ? "export const getSupabaseUrl=()=> 'https://offline.invalid'; export const getSupabaseAnonKey=()=> 'synthetic-offline-only-key';"
        : `export const createClient=()=>new Proxy({}, {get(_,key){const c=globalThis.__resetTestCalls;c[key==='rpc'?'rpc':key==='auth'?'auth':'other']++;throw Error('SDK access forbidden');}});`,loader:'js'}));
    }}],
  });
  const {db, dataResetCopy, DATA_RESET_DISABLED_CODE} = await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
  let passed = 0;
  for (const language of ['th','en']) {
    for (const userId of ['synthetic-user', '', undefined]) {
      for (let retry=0;retry<2;retry++) {
        const result = await db.deleteAllUserData(userId);
        assert.equal(result.data,null);
        assert.equal(result.error.code,'DATA_RESET_TEMPORARILY_DISABLED');
        assert.equal(result.error.code,DATA_RESET_DISABLED_CODE);
        assert.equal(result.error.message,dataResetCopy.en.description);
        assert.ok(dataResetCopy[language].description.length>0);
      }
      passed++;
    }
  }
  assert.equal(dataResetCopy.th.unavailable,'ปิดชั่วคราว');
  assert.equal(dataResetCopy.en.unavailable,'Temporarily unavailable');
  assert.deepEqual(calls,{rpc:0,auth:0,other:0,network:0});
  const view=readFileSync('src/app/(app)/settings/SettingsView.tsx','utf8');
  assert.doesNotMatch(view,/handleDeleteData|deleteConfirm|showDeleteModal|deleteAllUserData|localStorage\.removeItem|Type DELETE|พิมพ์ DELETE/);
  assert.doesNotMatch(readFileSync('src/lib/supabase.ts','utf8'),/rpc\(['"]purge_my_financial_data/);
  console.log(JSON.stringify({passed,helperInvocations:12,calls,sourceGuard:true}));
} finally {
  globalThis.fetch=oldFetch;
  delete globalThis.__resetTestCalls;
}
