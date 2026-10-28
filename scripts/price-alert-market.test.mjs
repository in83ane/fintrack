import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const asUrl = code => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
const json = asUrl(`export const NextResponse={json:(data,init)=>Response.json(data,init)};`);
const cache = asUrl(`const values=new Map();export const marketCache={get:k=>values.get(k),set:(k,v)=>values.set(k,v)};export const generateCacheKey=(type,params)=>JSON.stringify([type,params]);export const queryDeduplicator={dedupe:(_,fn)=>fn()};`);
const move = asUrl(`export const dailyMove=()=>({dayChange:0,dayChangePercent:0});`);
let source = ts.transpileModule(readFileSync(new URL('../src/app/api/market/route.ts', import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
source=source.replace("from 'next/server'",`from '${json}'`).replace("from '@/src/lib/cache'",`from '${cache}'`).replace("from '@/src/lib/holding-order'",`from '${move}'`);
const {GET}=await import(asUrl(source));
test('quote-only route uses one upstream request, preserves currency/time and caches separately from chart requests',async()=>{
 const original=globalThis.fetch,urls=[];
 globalThis.fetch=async url=>{urls.push(url);return Response.json({chart:{result:[{meta:{symbol:'AAPL',currency:'USD',regularMarketPrice:101,regularMarketTime:1000,previousClose:99},timestamp:[],indicators:{quote:[{close:[]}]}}]}})};
 try {
  const result=await (await GET(new Request('http://localhost/api/market?symbols=AAPL&quotesOnly=1'))).json();
  assert.equal(urls.length,1);assert.ok(urls[0].includes('range=1d&interval=1m'));
  assert.deepEqual(result.results,[{symbol:'AAPL',price:101,quoteCurrency:'USD',quoteTimestamp:1000000}]);
  await GET(new Request('http://localhost/api/market?symbols=AAPL&quotesOnly=1'));assert.equal(urls.length,1);
  const normal=await(await GET(new Request('http://localhost/api/market?symbols=AAPL'))).json();
  assert.equal(urls.length,3);assert.ok(Array.isArray(normal.results[0].chartData));
 } finally {globalThis.fetch=original;}
});
test('missing latest price does not fall back to previous close for alerts',async()=>{
 const original=globalThis.fetch;
 globalThis.fetch=async()=>Response.json({chart:{result:[{meta:{symbol:'TEST',currency:'USD',previousClose:100}}]}});
 try {const result=await(await GET(new Request('http://localhost/api/market?symbols=TEST&quotesOnly=1'))).json();assert.deepEqual(result.results,[]);}finally{globalThis.fetch=original;}
});
