import {createRequire} from 'node:module';import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import http from 'node:http';import assert from 'node:assert/strict';import ts from 'typescript';
const repo=process.cwd(),out=path.join(repo,'output/net-worth-round14/geometry');fs.mkdirSync(out,{recursive:true});
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
 for(const width of [1905,1440,1280,768])for(const theme of ['dark','light'])for(const scenario of ['stock','bucket','mixed','empty','one-day']){
  const p=await browser.newPage({viewport:{width,height:1000},reducedMotion:theme==='light'?'reduce':'no-preference'});p.on('pageerror',e=>errors.push(e.message));
  await p.goto(`http://127.0.0.1:${server.address().port}/?scenario=${scenario}&lang=${theme==='dark'?'en':'th'}`);await p.locator('[data-net-worth-line]').waitFor({state:'attached'});await p.evaluate(theme=>document.documentElement.classList.toggle('light-mode',theme==='light'),theme);
  const initialRect=await p.locator('[data-net-worth-chart]').evaluate(e=>({y:e.getBoundingClientRect().y+scrollY}));let checks=0;
  for(const period of ['30D','7D','90D','1Y','ALL']){
   await p.getByRole('button',{name:period,exact:true}).click();await p.waitForFunction(period=>document.querySelector(`.nw-periods button[aria-pressed="true"]`)?.textContent===period,period);await p.waitForTimeout(180);
   const expected=await p.evaluate(period=>window.__expected(period),period),series=expected.sample;
   const svg=p.locator('[data-net-worth-chart] svg');await svg.scrollIntoViewIfNeeded();await p.waitForFunction(()=>document.querySelector('[data-chart="net-worth"]')?.dataset.chartAnimating!=='true');const bounds=await svg.boundingBox();const dims=await svg.evaluate(e=>{e.addEventListener('mousemove',event=>window.__mouseX=event.clientX);return {w:e.viewBox.baseVal.width,h:e.viewBox.baseVal.height}});
   const indices=width===1905&&theme==='dark'&&scenario==='bucket'&&period==='30D'?series.map((_,i)=>i):[...new Set([0,series.length-1,Math.floor(series.length/2),series.findIndex(p=>p.value===Math.max(...series.map(v=>v.value))),series.findIndex(p=>p.value===Math.min(...series.map(v=>v.value)))])];
   for(const wanted of indices){
    let i=wanted;
    const fraction=series.length===1?.5:(Date.parse(series[i].date)-Date.parse(series[0].date))/(Date.parse(series.at(-1).date)-Date.parse(series[0].date));
    await p.mouse.move(bounds.x+(50+fraction*(dims.w-66))/dims.w*bounds.width,bounds.y+70);await p.locator('[data-net-worth-marker]').waitFor({timeout:4000}).catch(async e=>{await p.screenshot({path:path.join(out,'failure.png'),fullPage:true});console.log({width,theme,scenario,period,wanted,bounds,dims,actual:await svg.boundingBox(),at:await p.evaluate(()=>({head:document.querySelector('[data-net-worth-head]')?.outerHTML,hit:document.elementFromPoint(window.__mouseX||0,500)?.outerHTML.slice(0,200)}))});throw e;});await p.waitForTimeout(15);
    const mouseX=await p.evaluate(()=>window.__mouseX);
    i=series.reduce((best,point,j)=>{const px=50+(series.length===1?.5:(Date.parse(point.date)-Date.parse(series[0].date))/(Date.parse(series.at(-1).date)-Date.parse(series[0].date)))*(dims.w-66);const bx=50+(series.length===1?.5:(Date.parse(series[best].date)-Date.parse(series[0].date))/(Date.parse(series.at(-1).date)-Date.parse(series[0].date)))*(dims.w-66);return Math.abs(bounds.x+px/dims.w*bounds.width-mouseX)<Math.abs(bounds.x+bx/dims.w*bounds.width-mouseX)?j:best;},0);
    const marker=p.locator('[data-net-worth-marker]'),tip=p.locator('[data-net-worth-tooltip]');assert.equal(await marker.getAttribute('data-date'),series[i].date);assert.equal(+(await tip.getAttribute('data-value')),series[i].value);
    const [m,t,c]=await Promise.all([marker.boundingBox(),tip.boundingBox(),p.locator('[data-net-worth-card]').boundingBox()]);
    assert.ok(t.x+t.width<=m.x||t.x>=m.x+m.width||t.y+t.height<=m.y||t.y>=m.y+m.height,`Tooltip intersects marker ${width} ${theme} ${scenario} ${period} ${series[i].date}: ${JSON.stringify({m,t,c})}`);
    assert.ok(t.x>=c.x&&t.y>=c.y&&t.x+t.width<=c.x+c.width+.5&&t.y+t.height<=c.y+c.height+.5,`Tooltip outside card ${JSON.stringify({t,c})}`);
    const distance=await p.locator('[data-net-worth-line]').evaluate(line=>{const marker=document.querySelector('[data-net-worth-marker]'),x=+marker.getAttribute('cx'),y=+marker.getAttribute('cy');let a=0,b=line.getTotalLength();for(let n=0;n<35;n++){const m=(a+b)/2;if(line.getPointAtLength(m).x<x)a=m;else b=m;}const q=line.getPointAtLength((a+b)/2);return Math.hypot(q.x-x,q.y-y);});assert.ok(distance<.2,`marker off monotone ${distance}`);
    const parts=await tip.locator('[data-part]').evaluateAll(nodes=>nodes.reduce((n,e)=>n+Number(e.dataset.value),0));assert.ok(Math.abs(parts-series[i].value)<.01);
    checks++;
   }
   const tickCount=await svg.locator('[data-y-tick]').count();assert.ok(tickCount>=4&&tickCount<=6);assert.ok(await svg.locator('[data-x-tick]').count()<=5);
    const spacing=await svg.locator('[data-x-tick]').evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect()).map((r,i,all)=>i?r.left-all[i-1].right:999));assert.ok(spacing.every(gap=>gap>=47));
   assert.equal(+(await p.locator('[data-net-worth-total]').getAttribute('data-value')),series.at(-1).value);
   assert.ok((await p.getByText('Max DD',{exact:true}).locator('..').innerText()).includes('—'));
   const percent=p.locator('[data-worth-percent]');const colors=await percent.evaluate(e=>({own:getComputedStyle(e).color,parent:getComputedStyle(e.parentElement).color}));if(scenario==='bucket'&&period==='30D')assert.notEqual(colors.own,colors.parent);
   const text=await p.locator('body').innerText();assert.ok(!/-0\.0%|NaN|Infinity/.test(text));
   if(scenario==='bucket'&&period==='30D')assert.ok((await p.locator('[data-net-worth-change]').innerText()).includes('+฿3,148.50 (+13.5%) · 30D'));
   if(period==='ALL'&&scenario==='bucket')assert.ok((await p.locator('[data-net-worth-chart]').getAttribute('data-period')).includes(theme==='dark'?'since':'ตั้งแต่'));
   assert.equal(await p.locator('[data-net-worth-card] .sk-shimmer').count(),0);
   const r=await p.locator('[data-net-worth-chart]').evaluate(e=>({y:e.getBoundingClientRect().y+scrollY}));assert.ok(Math.abs(r.y-initialRect.y)<1,`Chart shifted ${r.y-initialRect.y}`);
  }
  const graph=p.getByRole('img',{name:/Net worth|มูลค่าสุทธิ/});await graph.focus();await p.keyboard.press('Home');const first=await p.locator('[data-net-worth-marker]').getAttribute('data-date');await p.keyboard.press('End');const last=await p.locator('[data-net-worth-marker]').getAttribute('data-date');await p.keyboard.press('ArrowLeft');await p.keyboard.press('ArrowRight');assert.equal(await p.locator('[data-net-worth-marker]').getAttribute('data-date'),last);await p.keyboard.press('Escape');assert.equal(await p.locator('[data-net-worth-tooltip]').getAttribute('data-visible'),'false');
  if(scenario==='bucket'){
   await p.getByRole('button',{name:'30D',exact:true}).click();await p.waitForFunction(()=>document.querySelector('.nw-periods button[aria-pressed="true"]')?.textContent==='30D');await graph.focus();await p.keyboard.press('Home');for(let i=0;i<19;i++)await p.keyboard.press('ArrowRight');await p.waitForTimeout(160);
   assert.equal(await p.locator('[data-net-worth-tooltip]').getAttribute('data-date'),'2026-10-15');const tt=await p.locator('[data-net-worth-tooltip]').innerText();assert.ok(tt.includes('฿27,794.52')&&tt.includes('+฿4,462.69 (+19.1%)'));await p.screenshot({path:path.join(out,`${width}-${theme}-bucket.png`),fullPage:true});
  }
  results.push({width,theme,scenario,checks,first,last});
  if(width===1905&&theme==='dark'&&scenario==='mixed'){
   await p.getByRole('button',{name:'7D',exact:true}).click();await p.reload();await p.waitForFunction(()=>document.querySelector('.nw-periods button[aria-pressed="true"]')?.textContent==='7D');
  }
  await p.evaluate(()=>window.__loading(true));await p.waitForFunction(()=>!document.querySelector('[data-net-worth-line]'));assert.equal(await p.locator('[data-net-worth-line]').count(),0);await p.close();
 }
 assert.deepEqual(errors,[]);console.log(`PASS ${results.length} Dashboard cases; ${results.reduce((n,r)=>n+r.checks,0)} tooltip bounds checks; five periods, keyboard, storage, dark/light, reduced motion`);
}finally{fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({results,errors},null,2));await browser.close();await new Promise(r=>server.close(r));}
