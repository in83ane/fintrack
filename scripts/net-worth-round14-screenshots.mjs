import {createRequire} from 'node:module';import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import http from 'node:http';import assert from 'node:assert/strict';import ts from 'typescript';
const repo=process.cwd(),phase=process.env.QA_PHASE||'after',out=path.join(repo,'output/net-worth-round14',phase);fs.mkdirSync(out,{recursive:true});
const require=createRequire(path.join(os.tmpdir(),'fintrack-cashflow-qa/package.json')),{build}=require('esbuild'),{chromium}=require('playwright');
const {default:postcss}=await import('postcss'),{default:tailwind}=await import('@tailwindcss/postcss');
const css=(await postcss([tailwind()]).process(fs.readFileSync('src/index.css','utf8'),{from:path.join(repo,'src/index.css')})).css;
const source=ts.createSourceFile('context.tsx',fs.readFileSync('src/context/AppContext.tsx','utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let dict;const visit=n=>{if(ts.isVariableDeclaration(n)&&n.name.getText(source)==='translations')dict=n.initializer.getText(source);ts.forEachChild(n,visit)};visit(source);
const fixture=path.join(repo,'scripts/net-worth-round14-fixture.tsx');
const mocks={
 '@/src/context/AppContext':`export {useApp} from ${JSON.stringify(fixture)};`,
 '@/src/components/PageTransition':'export const usePageRouter=()=>({push:()=>{}});',
 '@/src/components/AddAssetModal':'export const AddAssetModal=()=>null;',
 '@/src/components/AddCashflowModal':'export const AddCashflowModal=()=>null;',
 '@/src/components/Modal':'export const Modal=()=>null;',
 'qa-translations':`export const translations=${dict};`
};
const workerBundle=await build({entryPoints:[path.join(repo,'src/lib/net-worth-worker.ts')],bundle:true,write:false,format:'iife'});
const bundle=await build({outdir:path.join(out,'bundle'),entryPoints:[fixture],bundle:true,write:false,jsx:'automatic',format:'esm',define:{'process.env.NODE_ENV':'"development"'},plugins:[{name:'fixture',setup(b){b.onResolve({filter:/.*/},a=>mocks[a.path]?{path:a.path,namespace:'qa'}:undefined);b.onLoad({filter:/.*/,namespace:'qa'},a=>({contents:mocks[a.path],loader:'tsx',resolveDir:repo}));}}]});
const server=http.createServer((req,res)=>{
 const worker=req.url.endsWith('net-worth-worker.ts');
 res.setHeader('Content-Type',worker||req.url==='/qa.js'?'text/javascript':req.url==='/qa.css'?'text/css':'text/html');
 res.end(worker?workerBundle.outputFiles[0].contents:req.url==='/qa.js'?bundle.outputFiles.find(f=>f.path.endsWith('.js')).contents:req.url==='/qa.css'?css+'\n'+fs.readFileSync('src/components/net-worth-chart.css','utf8'):'<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/qa.css"></head><body><div id="root"></div><script type="module" src="/qa.js"></script></body></html>');
});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});const errors=[],results=[];
try{
 for(const theme of ['dark','light'])for(const lang of ['en','th']){
  const p=await browser.newPage({viewport:{width:1905,height:908},reducedMotion:'reduce'});p.on('pageerror',e=>errors.push(e.message));await p.goto(`http://127.0.0.1:${server.address().port}/?scenario=bucket&lang=${lang}`);await p.locator('[data-net-worth-line]').waitFor({state:'attached'});await p.evaluate(theme=>document.documentElement.classList.toggle('light-mode',theme==='light'),theme);
  for(const period of ['7D','30D','90D','1Y','ALL']){
   await p.getByRole('button',{name:period,exact:true}).click();await p.waitForFunction(period=>document.querySelector('.nw-periods button[aria-pressed="true"]')?.textContent===period,period);await p.waitForTimeout(80);await p.locator('[data-net-worth-card]').scrollIntoViewIfNeeded();await p.mouse.move(0,0);
   const expected=await p.evaluate(period=>window.__expected(period),period),data=expected.data;
   const geometry=await p.locator('[data-net-worth-chart] svg').evaluate(svg=>{const path=svg.querySelector('[data-net-worth-line]'),r=path.getBBox();return {coverage:r.height/(svg.viewBox.baseVal.height-32)*100,ticks:[...svg.querySelectorAll('[data-y-tick]')].map(e=>e.textContent),x:[...svg.querySelectorAll('[data-x-tick]')].map(e=>e.textContent)}});
   const text=await p.locator('[data-net-worth-change]').innerText();results.push({theme,lang,period,first:data[0],last:data.at(-1),change:text,...geometry});await p.locator('[data-net-worth-card]').screenshot({path:path.join(out,`${theme}-${lang}-${period}.png`)});
  }await p.close();
 }
 assert.deepEqual(errors,[]);console.log(`PASS ${phase}: ${results.length} range/theme/language screenshots`);
}finally{fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({results,errors},null,2));await browser.close();await new Promise(r=>server.close(r));}
