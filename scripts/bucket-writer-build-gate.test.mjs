import assert from 'node:assert/strict';
import test from 'node:test';
import configureNext from '../next.config.js';
import {PHASE_PRODUCTION_BUILD,PHASE_DEVELOPMENT_SERVER} from 'next/constants.js';
import {assertBucketWriterApiReady} from './bucket-writer-build-gate.mjs';
const config={url:'https://example.supabase.co',key:'public-test-key'};
test('all three exact signatures must be found and denied to anon',async()=>{
 const names=[];
 const result=await assertBucketWriterApiReady({...config,fetcher:async(url,options)=>{
  const name=url.pathname.split('/').at(-1);names.push(name);
  assert.equal(options.headers.Authorization,undefined);
  assert.equal(options.redirect,'error');
  assert(Object.values(JSON.parse(options.body)).every(v=>v===null||typeof v==='object'));
  return {status:401,json:async()=>({code:'42501',message:`permission denied for function ${name}`})};
 }});
 assert.equal(result.passed,3);assert.equal(names.length,3);
});
for(const [label,status,body] of [
 ['missing RPC',404,{code:'PGRST202'}],['stale signature',404,{code:'PGRST203'}],
 ['wrong key',401,{message:'Invalid API key'}],['anonymous execution allowed',200,{}],
 ['schema access denied',401,{code:'42501',message:'permission denied for schema public'}],
 ['gateway error',502,{}],
])test(label+' blocks promotion without exposing response data',async()=>{
 await assert.rejects(()=>assertBucketWriterApiReady({...config,fetcher:async()=>({status,json:async()=>({...body,details:'PRIVATE'})})}),
  error=>error.message.startsWith('BUCKET_RELEASE_NOT_READY')&&!error.message.includes('PRIVATE'));
});
test('network failure is sanitized and blocks',async()=>{
 await assert.rejects(()=>assertBucketWriterApiReady({...config,fetcher:async()=>{throw Error('PRIVATE');}}),
  /BUCKET_RELEASE_UNREACHABLE: write_bucket_cash/);
});
test('invalid target never makes an HTTP call',async()=>{
 for(const url of ['http://example.com','https://user:secret@example.com','https://example.com/?secret=x']){
  await assert.rejects(()=>assertBucketWriterApiReady({...config,url,fetcher:()=>assert.fail('network used')}),/INVALID_TARGET/);
 }
});
test('production config rejects missing RPC; development remains usable for repair',async()=>{
 const oldFetch=globalThis.fetch;
 const oldUrl=process.env.NEXT_PUBLIC_SUPABASE_URL,oldKey=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
 let requests=0;
 try{
  process.env.NEXT_PUBLIC_SUPABASE_URL=config.url;process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY=config.key;
  globalThis.fetch=async()=>{requests++;return {status:404,json:async()=>({code:'PGRST202'})};};
  await configureNext(PHASE_DEVELOPMENT_SERVER);assert.equal(requests,0);
  await assert.rejects(()=>configureNext(PHASE_PRODUCTION_BUILD),/BUCKET_RELEASE_NOT_READY/);
  assert.equal(requests,1);
 }finally{
  globalThis.fetch=oldFetch;
  if(oldUrl===undefined)delete process.env.NEXT_PUBLIC_SUPABASE_URL;else process.env.NEXT_PUBLIC_SUPABASE_URL=oldUrl;
  if(oldKey===undefined)delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY=oldKey;
 }
});
