import {createRequire} from 'node:module';import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import http from 'node:http';import assert from 'node:assert/strict';import ts from 'typescript';
const repo=process.cwd(),out=path.join(repo,'output/net-worth-round12');fs.mkdirSync(out,{recursive:true});
const require=createRequire(path.join(os.tmpdir(),'fintrack-cashflow-qa/package.json')),{build}=require('esbuild'),{chromium}=require('playwright');
const {default:postcss}=await import('postcss'),{default:tailwind}=await import('@tailwindcss/postcss');
const css=(await postcss([tailwind()]).process(fs.readFileSync('src/index.css','utf8'),{from:path.join(repo,'src/index.css')})).css;
const source=ts.createSourceFile('context.tsx',fs.readFileSync('src/context/AppContext.tsx','utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let dict;const visit=n=>{if(ts.isVariableDeclaration(n)&&n.name.getText(source)==='translations')dict=n.initializer.getText(source);ts.forEachChild(n,visit)};visit(source);
const fixture=path.join(repo,'scripts/net-worth-round12-fixture.tsx');
const mocks={
 '@/src/context/AppContext':`export {useApp} from ${JSON.stringify(fixture)};`,
 '@/src/components/PageTransition':'export const usePageRouter=()=>({push:()=>{}});',
 '@/src/components/AddAssetModal':'export const AddAssetModal=()=>null;',
 '@/src/components/AddCashflowModal':'export const AddCashflowModal=()=>null;',
 '@/src/components/Modal':'export const Modal=()=>null;',
 'qa-translations':`export const translations=${dict};`
};
const bundle=await build({entryPoints:[fixture],bundle:true,write:false,jsx:'automatic',format:'iife',define:{'process.env.NODE_ENV':'"development"'},plugins:[{name:'fixture',setup(b){b.onResolve({filter:/.*/},a=>mocks[a.path]?{path:a.path,namespace:'qa'}:undefined);b.onLoad({filter:/.*/,namespace:'qa'},a=>({contents:mocks[a.path],loader:'tsx',resolveDir:repo}));}}]});
const server=http.createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/qa.js'?'text/javascript':req.url==='/qa.css'?'text/css':'text/html');res.end(req.url==='/qa.js'?bundle.outputFiles[0].contents:req.url==='/qa.css'?css:'<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/qa.css"></head><body><div id="root"></div><script src="/qa.js"></script></body></html>');});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});const errors=[],results=[];
try{
 for(const width of [1905,1440,1280])for(const theme of ['dark','light'])for(const scenario of ['stock','bucket','mixed','empty','one-day']){
  const p=await browser.newPage({viewport:{width,height:1000},reducedMotion:'reduce'});p.on('pageerror',e=>errors.push(e.message));await p.goto(`http://127.0.0.1:${server.address().port}/?scenario=${scenario}&lang=${theme==='dark'?'en':'th'}`);await p.locator('[data-net-worth-line]').waitFor({state:'attached'});await p.evaluate(theme=>document.documentElement.classList.toggle('light-mode',theme==='light'),theme);
  const series=await p.evaluate(()=>window.__series);const svg=p.locator('[data-net-worth-chart] svg');await svg.scrollIntoViewIfNeeded();const bounds=await svg.boundingBox();const dims=await svg.evaluate(e=>({w:e.viewBox.baseVal.width,h:e.viewBox.baseVal.height}));
  const low=Math.min(...series.map(p=>p.value)),high=Math.max(...series.map(p=>p.value)),pad=high===low?Math.abs(high)*.01||1:(high-low)*.1;
  for(let i=0;i<series.length;i++){
   const x=50+i/(series.length-1)*(dims.w-66),y=8+(1-(series[i].value-(low-pad))/(high-low+2*pad))*(dims.h-32);
   await p.mouse.move(bounds.x+x/dims.w*bounds.width,bounds.y+70);await p.locator('[data-net-worth-marker]').waitFor();
   const marker=await p.locator('[data-net-worth-marker]').evaluate(e=>({date:e.dataset.date,value:+e.dataset.value,x:+e.getAttribute('cx'),y:+e.getAttribute('cy')}));
   assert.equal(marker.date,series[i].date);assert.equal(marker.value,series[i].value);assert.ok(Math.abs(marker.x-x)<.01&&Math.abs(marker.y-y)<.01);
   const tip=p.locator('[data-net-worth-tooltip]');assert.equal(await tip.getAttribute('data-date'),series[i].date);assert.equal(+(await tip.getAttribute('data-value')),series[i].value);
   const text=await tip.innerText();assert.ok(text.includes(await p.evaluate(value=>window.__format(value),series[i].value)));
   // The marker must be on the actual SVG path, not just a second formula.
   const onPath=await p.locator('[data-net-worth-line]').evaluate((line,point)=>{let a=0,b=line.getTotalLength();for(let j=0;j<30;j++){const mid=(a+b)/2;if(line.getPointAtLength(mid).x<point.x)a=mid;else b=mid;}const pos=line.getPointAtLength((a+b)/2);return Math.hypot(pos.x-point.x,pos.y-point.y);},marker);assert.ok(onPath<.2,`Marker off curve ${onPath}`);
  }
  const headline=+(await p.locator('[data-net-worth-total]').getAttribute('data-value'));assert.equal(headline,series.at(-1).value);const text=await p.locator('body').innerText();assert.ok(!text.includes('Start\n')&&!text.includes('-0.0%')&&!text.includes('NaN')&&!text.includes('Infinity'));
  assert.equal(await svg.locator('text').count(),8,'3 Y ticks and 5 dates');
  if(scenario==='bucket')assert.ok(text.includes('+฿2,439.84 (+10.1%) · 30D'));
  if(scenario==='empty')assert.ok(text.includes(theme==='dark'?'No changes in this period':'ไม่มีการเปลี่ยนแปลงในช่วงนี้'));
  results.push({width,theme,scenario,points:series.length,first:series[0],last:series.at(-1),maxMarkerError:.2});
  if(width===1905||scenario==='bucket')await p.screenshot({path:path.join(out,`${width}-${theme}-${scenario}.png`),fullPage:true});
  await p.evaluate(()=>window.__loading(true));assert.equal(await p.locator('[data-net-worth-line]').count(),0,'Loading never draws fake series');assert.ok(await p.locator('.sk-shimmer').count()>0);await p.close();
 }
 assert.deepEqual(errors,[]);console.log(`PASS ${results.length} real Dashboard scenarios, ${results.reduce((n,r)=>n+r.points,0)} tooltip/curve points, dark/light, loading skeleton`);
}finally{fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({results,errors},null,2));await browser.close();await new Promise(r=>server.close(r));}

