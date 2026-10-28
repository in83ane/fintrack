// Offline only: no SDK, HTTP, SQL execution or PGlite.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
const source=readFileSync('src/lib/bucket-command.ts','utf8');
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {createBucketCommander,createBucketWriterTransport,bucketWriteMessage}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));

for(const errorCode of ['PGRST202','PGRST203','PGRST204','PGRST205','42883','42P01','42703']){
 test(`${errorCode}: localized release message; subsequent writes blocked until reload`,async()=>{
  let calls=0;
  const rpc=createBucketWriterTransport(async()=>{calls++;return {data:null,error:{code:errorCode,message:'sensitive row details',details:'private',hint:'secret'}};});
  const reply=await rpc('write_bucket_cash',{request_id:'original',command:{}});
  for(const th of [false,true]){
   const message=bucketWriteMessage(reply.error,th);
   assert.ok(message.includes(errorCode));
   assert.match(message,th?/ผู้ดูแล/:/administrator/);
   assert.doesNotMatch(message,/sensitive|private|secret|Retry with the same details/);
  }
  assert.deepEqual(await rpc('save_cash_bucket',{}),{data:null,error:{code:errorCode}});
  assert.equal(calls,1);
  const reloaded=createBucketWriterTransport(async()=>({data:'saved',error:null}));
  assert.equal((await reloaded('write_bucket_cash',{})).data,'saved');
 });
}
test('normal requests pass through unchanged; no fallback or extra call',async()=>{
 const seen=[];const args={request_id:'original',command:{op:'create'}};
 const rpc=createBucketWriterTransport(async(...a)=>{seen.push(a);return {data:'ok',error:null};});
 assert.equal((await rpc('write_bucket_cash',args)).data,'ok');
 assert.deepEqual(seen,[['write_bucket_cash',args]]);
});
test('permission and auth errors do not poison the next valid session',async()=>{
 for(const code of ['42501','PGRST301','PGRST302','PGRST303']){
  let calls=0;const rpc=createBucketWriterTransport(async()=>++calls===1?{data:null,error:{code}}:{data:'ok',error:null});
  const reply=await rpc('write_bucket_cash',{});
  assert.ok(bucketWriteMessage(reply.error,false).includes(code));
  assert.doesNotMatch(bucketWriteMessage(reply.error,false),/Retry with the same details/);
  assert.equal((await rpc('write_bucket_cash',{})).data,'ok');
 }
});
test('uncertain network failure preserves request and payload through retry',async()=>{
 const seen=[];const rpc=createBucketWriterTransport(async(_name,args)=>{seen.push(args);if(seen.length===1)throw Error('network');return {data:[],error:null};});
 const storage={getItem:()=>null,setItem:()=>{}};
 const send=createBucketCommander(args=>rpc('write_bucket_cash',args),storage);
 const command={op:'create',rows:[{date:'2026-10-28T00:00:00Z',original_amount:153,currency:'THB'}]};
 await send('synthetic-owner',command);await send('synthetic-owner',command);
 assert.equal(seen.length,2);assert.deepEqual(seen[1],seen[0]);
});
test('business rejection remains actionable and does not disable the writer',async()=>{
 let calls=0;const rpc=createBucketWriterTransport(async()=>++calls===1?{data:null,error:{code:'P0001',message:'Insufficient balance'}}:{data:'ok',error:null});
 const reply=await rpc('write_bucket_cash',{});
 assert.match(bucketWriteMessage(reply.error,false),/Insufficient funds/);
 assert.equal((await rpc('write_bucket_cash',{})).data,'ok');
 assert.match(bucketWriteMessage('Unresolved bucket history: audit required',true),/ตรวจสอบ/);
});
test('raw diagnostic fields and arbitrary error codes never enter UI text',()=>{
 for(const error of [null,undefined,{}, {code:'secret-token',message:'private customer',details:'secret'}, {code:'P0001',message:'private customer'}]){
  for(const th of [true,false])assert.doesNotMatch(bucketWriteMessage(error,th),/secret|private|customer/);
 }
 assert.match(bucketWriteMessage({code:'P0001',message:'unexpected'},false),/P0001/);
});
test('all four AppContext handlers retain error codes for the formatter',()=>{
 const app=readFileSync('src/context/AppContext.tsx','utf8');
 assert.equal((app.match(/bucketWriteMessage\((?:error|e),/g)||[]).length,4);
 assert.doesNotMatch(app,/bucketWriteMessage\([^\n]*\.message/);
});
