import {createRequire} from 'node:module';import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import http from 'node:http';import assert from 'node:assert/strict';import ts from 'typescript';
const repo=process.cwd(),out=path.join(repo,'output/net-worth-round13-interactions');fs.mkdirSync(out,{recursive:true});
const require=createRequire(path.join(os.tmpdir(),'fintrack-cashflow-qa/package.json')),{build}=require('esbuild'),{chromium}=require('playwright');
const {default:postcss}=await import('postcss'),{default:tailwind}=await import('@tailwindcss/postcss');
const css=(await postcss([tailwind()]).process(fs.readFileSync('src/index.css','utf8'),{from:path.join(repo,'src/index.css')})).css;
const source=ts.createSourceFile('context.tsx',fs.readFileSync('src/context/AppContext.tsx','utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let dict;const visit=n=>{if(ts.isVariableDeclaration(n)&&n.name.getText(source)==='translations')dict=n.initializer.getText(source);ts.forEachChild(n,visit)};visit(source);
const fixture=path.join(repo,'scripts/net-worth-round13-fixture.tsx');
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
 const p=await browser.newPage({viewport:{width:1280,height:900}});p.on('pageerror',e=>errors.push(e.message));
 await p.goto(`http://127.0.0.1:${server.address().port}/?scenario=bucket`);await p.locator('[data-net-worth-line]').waitFor({state:'attached'});
 await p.route('**/net-worth-worker.ts',async route=>{await new Promise(r=>setTimeout(r,1000));await route.continue().catch(()=>{});});
 await p.getByRole('button',{name:'1Y',exact:true}).click();await p.waitForTimeout(600);
 const dim=await p.locator('[data-net-worth-line]').evaluate(e=>Number(getComputedStyle(e.parentElement).opacity));assert.ok(dim>.5&&dim<.7,`slow calculation dim ${dim}`);assert.equal(await p.locator('[data-net-worth-card] .sk-shimmer').count(),0);assert.equal(await p.locator('[data-net-worth-chart]').getAttribute('data-period'),'30D');
 for(const period of ['7D','90D','1Y','ALL']){await p.getByRole('button',{name:period,exact:true}).click();await p.waitForTimeout(50);}
 await p.waitForFunction(()=>document.querySelector('.nw-periods button[aria-pressed="true"]')?.textContent==='ALL');await p.waitForTimeout(180);assert.equal(await p.locator('[data-net-worth-line]').count(),1);results.push({test:'delayed worker + latest click wins',dim});
 await p.unroute('**/net-worth-worker.ts');await p.reload();await p.waitForFunction(()=>document.querySelector('.nw-periods button[aria-pressed="true"]')?.textContent==='ALL');
 assert.equal(await p.locator('[data-range-indicator]').evaluate(e=>getComputedStyle(e).transitionDuration),'0s');results.push({test:'saved period restores without indicator animation'});
 await p.emulateMedia({reducedMotion:'reduce'});await p.getByRole('button',{name:'7D',exact:true}).click();await p.waitForFunction(()=>document.querySelector('.nw-periods button[aria-pressed="true"]')?.textContent==='7D');assert.equal(await p.locator('[data-range-indicator]').evaluate(e=>getComputedStyle(e).transitionDuration),'0s');assert.equal(await p.locator('[data-net-worth-tooltip]').evaluate(e=>getComputedStyle(e).transitionDuration),'0s');
 await p.setViewportSize({width:590,height:900});assert.equal(await p.locator('.nw-tip-parts').evaluate(e=>getComputedStyle(e).display),'none');results.push({test:'reduced motion and compact tooltip'});await p.close();
 const long=await browser.newPage({viewport:{width:1440,height:900}});long.on('pageerror',e=>errors.push(e.message));await long.goto(`http://127.0.0.1:${server.address().port}/?scenario=long`);await long.locator('[data-net-worth-line]').waitFor({state:'attached'});await long.getByRole('button',{name:'ALL',exact:true}).click();await long.waitForFunction(()=>document.querySelector('.nw-periods button[aria-pressed="true"]')?.textContent==='ALL');
 const expected=await long.evaluate(()=>window.__expected('ALL'));assert.equal(expected.data.length,1200);assert.equal(expected.sample.length,400);
 const graph=long.getByRole('img',{name:/Net worth/});await graph.focus();await long.keyboard.press('Home');assert.equal(await long.locator('[data-net-worth-marker]').getAttribute('data-date'),expected.data[0].date);await long.keyboard.press('ArrowRight');assert.equal(await long.locator('[data-net-worth-marker]').getAttribute('data-date'),expected.sample[1].date);await long.keyboard.press('End');assert.equal(+(await long.locator('[data-net-worth-marker]').getAttribute('data-value')),expected.data.at(-1).value);results.push({test:'1200 daily points downsampled to 400 closing observations',first:expected.data[0].date,last:expected.data.at(-1).date});await long.close();
 for(const theme of ['dark','light']) {
  const shot=await browser.newPage({viewport:{width:1905,height:908},reducedMotion:'reduce'});
  await shot.goto(`http://127.0.0.1:${server.address().port}/?scenario=bucket&lang=${theme==='dark'?'en':'th'}`);await shot.locator('[data-net-worth-line]').waitFor({state:'attached'});await shot.evaluate(theme=>document.documentElement.classList.toggle('light-mode',theme==='light'),theme);
  const svg=shot.locator('[data-net-worth-chart] svg');await svg.scrollIntoViewIfNeeded();const b=await svg.boundingBox();await shot.mouse.move(b.x+50+19/30*(b.width-66),b.y+70);await shot.waitForFunction(()=>document.querySelector('[data-net-worth-tooltip]')?.getAttribute('data-date')==='2026-10-15');await shot.locator('[data-net-worth-card]').screenshot({path:path.join(out,`chart-${theme}.png`)});await shot.close();
 }
 assert.deepEqual(errors,[]);console.log('PASS' ,JSON.stringify(results));
}finally{fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({results,errors},null,2));await browser.close();await new Promise(r=>server.close(r));}
