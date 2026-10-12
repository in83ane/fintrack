import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const code=ts.transpileModule(readFileSync(new URL('../src/app/api/exchange-rate/valuation/route.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
async function run(mode,configured=true) {
  const calls=[];const exports={};
  const require=name=>name==='next/server'?{NextResponse:{json:(body,options={})=>({body,status:options.status||200})}}:name==='next/cache'?{unstable_cache:fn=>fn}:{validRate:v=>Number.isFinite(Number(v))&&Number(v)>0};
  const fetch=async(url,options)=>{
    calls.push({url,options});
    if(url.includes('api.wise.com')) {
      if(mode==='timeout') throw Error('mock timeout');
      return {ok:mode!=='denied'&&mode!=='quota',json:async()=>mode==='malformed'?{}:[{source:mode==='wrong-pair'?'THB':'USD',target:'THB',rate:mode==='invalid'?0:33.53,time:new Date(Date.now()-(mode==='stale'?7200000:1000)).toISOString()}]};
    }
    return {ok:true,json:async()=>({base:'USD',quote:'THB',rate:33.42,date:'2026-10-13'})};
  };
  new Function('require','exports','fetch','process',code)(require,exports,fetch,{env:configured?{WISE_API_TOKEN:'fixture-only-not-a-secret'}:{}});
  const response=await exports.GET();
  assert.ok(!JSON.stringify(response).includes('fixture-only-not-a-secret'));
  assert.ok(calls.every(c=>!c.options.method||c.options.method==='GET'));
  return {response,calls};
}
const success=await run('valid');
assert.equal(success.response.body.source,'wise');
assert.equal(success.response.body.rate,'33.53');
assert.equal(success.calls.length,1);
assert.equal(success.calls[0].options.redirect,'error');
assert.equal(success.calls[0].options.headers.Authorization,'Bearer fixture-only-not-a-secret');
for(const mode of ['denied','quota','timeout','stale','malformed','wrong-pair','invalid']) assert.equal((await run(mode)).response.body.source,'frankfurter',mode);
const missing=await run('valid',false);
assert.ok(!missing.calls.some(c=>c.url.includes('wise')));
assert.equal(missing.response.body.source,'frankfurter');
console.log('PASS Wise mocked integration: GET only, server credential, no leaks, pair/rate/freshness validation, missing token, denial/quota/timeout fallback with actual source.');
