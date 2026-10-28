import {createRequire} from 'node:module';import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import http from 'node:http';import assert from 'node:assert/strict';import ts from 'typescript';
const repo=process.cwd(),out=path.join(repo,'output/net-worth-round14/motion');fs.mkdirSync(out,{recursive:true});
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
 const p=await browser.newPage({viewport:{width:1440,height:900}});p.on('pageerror',e=>errors.push(e.message));await p.goto(`http://127.0.0.1:${server.address().port}/?scenario=bucket`);await p.locator('[data-net-worth-line]').waitFor({state:'attached'});await p.locator('[data-net-worth-chart]').scrollIntoViewIfNeeded();await p.waitForTimeout(1400);
 await p.getByRole('button',{name:'ALL',exact:true}).click();await p.waitForFunction(()=>document.querySelector('[data-chart="net-worth"]').dataset.chartAnimating==='true');
 const frames=await p.evaluate(()=>new Promise(resolve=>{const frames=[];function frame(){const root=document.querySelector('[data-chart="net-worth"]'),head=root.querySelector('[data-net-worth-head]'),line=root.querySelector('[data-net-worth-line]'),plot=root.querySelector('[data-net-worth-reveal]');const rect=root.getBoundingClientRect(),headRect=head.getBoundingClientRect(),computed=getComputedStyle(head),distance=parseFloat(computed.offsetDistance)/100,q=line.getPointAtLength(line.getTotalLength()*distance),scale=rect.width/root.viewBox.baseVal.width;frames.push({opacity:getComputedStyle(plot).opacity,clip:getComputedStyle(plot).clipPath,distance,error:Math.hypot((headRect.x+headRect.width/2-rect.x)/scale-q.x,(headRect.y+headRect.height/2-rect.y)/scale-q.y),pathMatches:(()=>{const probe=document.createElement('div');probe.style.offsetPath=`path("${line.getAttribute('d')}")`;return computed.offsetPath===probe.style.offsetPath;})(),duration:+root.dataset.chartDuration});if(root.dataset.chartAnimating==='true')requestAnimationFrame(frame);else resolve(frames);}requestAnimationFrame(frame);}));
 fs.writeFileSync(path.join(out,'frames.json'),JSON.stringify(frames,null,2));assert.ok(frames.length>5);assert.ok(frames.every(f=>f.error<.3&&f.pathMatches));assert.equal(frames[0].duration,500);assert.ok(frames.some(f=>f.clip.startsWith('inset')));assert.ok(frames.at(-1).distance>.9999);assert.equal(await p.locator('[data-chart-decoration]').count(),1,'owned chart has no duplicate global head');results.push({test:'500ms reveal + shared path head',frames:frames.length,maxHeadError:Math.max(...frames.map(f=>f.error)),duration:500});
 fs.writeFileSync(path.join(out,'frames.json'),JSON.stringify(frames,null,2));
 await p.emulateMedia({reducedMotion:'reduce'});await p.getByRole('button',{name:'7D',exact:true}).click();await p.waitForFunction(()=>document.querySelector('.nw-periods button[aria-pressed="true"]')?.textContent==='7D');assert.equal(await p.locator('[data-net-worth-reveal]').evaluate(e=>e.getAnimations().length),0);assert.equal(await p.locator('[data-net-worth-head]').evaluate(e=>getComputedStyle(e).offsetDistance),'100%');results.push({test:'reduced motion immediately at final frame'});
 await p.close();
 for(const currency of ['THB','USD']){
  const page=await browser.newPage({viewport:{width:1905,height:908},reducedMotion:'reduce'});await page.goto(`http://127.0.0.1:${server.address().port}/?scenario=bucket&currency=${currency}`);await page.locator('[data-net-worth-line]').waitFor({state:'attached'});
  for(const period of ['7D','30D','90D','1Y','ALL']){await page.getByRole('button',{name:period,exact:true}).click();await page.waitForFunction(period=>document.querySelector('.nw-periods button[aria-pressed="true"]')?.textContent===period,period);const data=await page.locator('[data-net-worth-chart] svg').evaluate(svg=>({coverage:svg.querySelector('[data-net-worth-line]').getBBox().height/(svg.viewBox.baseVal.height-32)*100,ticks:[...svg.querySelectorAll('[data-y-tick]')].map(e=>e.textContent)}));results.push({currency,period,...data});}await page.close();
 }
 assert.deepEqual(errors,[]);console.log('PASS',JSON.stringify(results));
}finally{fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({results,errors},null,2));await browser.close();await new Promise(r=>server.close(r));}
