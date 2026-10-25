import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import assert from 'node:assert/strict';
const repo=process.cwd(), out=path.join(repo,'output','cashflow-qa');
mkdirSync(out,{recursive:true});
const require=createRequire(path.join(os.tmpdir(),'fintrack-cashflow-qa','package.json'));
const {build}=require('esbuild'),{chromium}=require('playwright');
const {default:postcss}=await import('postcss');
const {default:tailwind}=await import('@tailwindcss/postcss');
const css=await postcss([tailwind()]).process(readFileSync(path.join(repo,'src/index.css'),'utf8'),{from:path.join(repo,'src/index.css')});
writeFileSync(path.join(out,'qa.css'),css.css+'\n:root{--font-ui:Arial;}');
const contextCode=`export { useApp } from ${JSON.stringify(path.join(repo,'scripts/cashflow-qa-fixture.tsx'))};`;
const bundle=await build({entryPoints:[path.join(repo,'scripts/cashflow-qa-fixture.tsx')],bundle:true,write:false,format:'iife',jsx:'automatic',platform:'browser',define:{'process.env.NODE_ENV':'"development"'},plugins:[{name:'qa-memory-context',setup(b){
  b.onResolve({filter:/^@\/src\/context\/AppContext$/},()=>({path:'context',namespace:'qa'}));
  b.onResolve({filter:/^next\/dynamic$/},()=>({path:'dynamic',namespace:'qa'}));
  b.onResolve({filter:/^next\/link$/},()=>({path:'link',namespace:'qa'}));
  b.onResolve({filter:/^@\/src\/components\/(AddCashflowModal|AIFinancialAdvisor)$/},args=>({path:args.path.split('/').at(-1),namespace:'qa'}));
  b.onResolve({filter:/^@\//},args=>({path:path.join(repo,args.path.slice(2))+(path.extname(args.path)?'':readFileExists(args.path.slice(2)+'.tsx')?'.tsx':'.ts')}));
  b.onLoad({filter:/.*/,namespace:'qa'},args=>({contents:args.path==='context'?contextCode:args.path==='dynamic'?`import React from 'react';export default function dynamic(loader,options){const C=React.lazy(loader.then?()=>loader:()=>loader().then(m=>({default:m})));return props=>React.createElement(React.Suspense,{fallback:options?.loading?React.createElement(options.loading):null},React.createElement(C,props));}`:args.path==='link'?`import React from 'react';export default function Link(props){return React.createElement('a',props);}`:`import React from 'react';export function ${args.path}(){return null;}`,loader:'js',resolveDir:repo}));
}}]});
function readFileExists(relative){try{readFileSync(path.join(repo,relative));return true;}catch{return false;}}
writeFileSync(path.join(out,'qa.js'),bundle.outputFiles[0].contents);
const server=http.createServer((req,res)=>{const target=req.url.split('?')[0];res.setHeader('Content-Type',target.endsWith('.js')?'application/javascript':target.endsWith('.css')?'text/css':'text/html');res.end(target==='/qa.js'?bundle.outputFiles[0].contents:target==='/qa.css'?readFileSync(path.join(out,'qa.css')):'<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Cash Flow · isolated QA fixtures</title><link rel="stylesheet" href="/qa.css"></head><body><div id="root"></div><script src="/qa.js"></script></body></html>');});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const port=server.address().port;
const browser=await chromium.launch({executablePath:'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',headless:true,args:['--disable-gpu']});
const errors=[],results=[];
try{
 for(const width of [1440,390])for(const theme of ['dark','light'])for(const state of ['populated','loading','empty','partial','error']){
  const page=await browser.newPage({viewport:{width,height:width===390?844:1000},timezoneId:'Asia/Bangkok',reducedMotion:'reduce'});
  await page.clock.install({time:new Date('2026-10-25T05:00:00Z')});
  page.on('pageerror',error=>errors.push(`${width}/${theme}/${state}: ${error.message}`));
  await page.goto(`http://127.0.0.1:${port}/?state=${state}`);
  await page.waitForSelector('.cashflow-page');
  if(theme==='light')await page.evaluate(()=>document.documentElement.classList.add('light-mode'));
  await page.waitForTimeout(900);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`${width}/${theme}/${state}: no page overflow`);
  if(state==='populated'){
   const content=await page.locator('.cashflow-page').innerText();
   assert.ok(content.includes('฿8,270.28'));assert.ok(content.includes('฿5,773.21'));assert.ok(content.includes('+฿2,497.07'));
   assert.ok(content.includes('฿126.00'));assert.ok(!content.includes('฿126.12'));
  }
  const file=`cashflow-${width}-${theme}-${state}.png`;await page.screenshot({path:path.join(out,file),fullPage:true});results.push({width,theme,state,file});await page.close();
 }
 const page=await browser.newPage({viewport:{width:1440,height:1000},timezoneId:'Asia/Bangkok'});
 await page.clock.install({time:new Date('2026-10-25T05:00:00Z')});
 page.on('pageerror',error=>errors.push(`interaction: ${error.message}`));
 await page.goto(`http://127.0.0.1:${port}/?state=populated`);await page.waitForSelector('[data-chart-run]');await page.waitForTimeout(2300);
 const first=await page.locator('.chart-reveal').first().getAttribute('data-chart-run');await page.evaluate(()=>window.__qaRerender());await page.waitForTimeout(600);assert.equal(await page.locator('.chart-reveal').first().getAttribute('data-chart-run'),first,'No replay on ordinary rerender');
 await page.getByRole('button',{name:'Exclude investments',exact:true}).click();await page.waitForTimeout(1200);assert.ok((await page.locator('.cashflow-page').innerText()).includes('−฿6,938.93'),'Investment cash impact');
 await page.getByRole('button',{name:'THB ⇄',exact:true}).click();await page.waitForTimeout(1200);assert.ok(Number(await page.locator('.chart-reveal').first().getAttribute('data-chart-run'))>Number(first),'Range/currency change replays');
 await page.getByRole('button',{name:'View as table',exact:true}).first().click();assert.ok(await page.getByRole('columnheader',{name:'Section / item'}).isVisible());
 await page.getByRole('button',{name:'Hide amounts',exact:true}).click();assert.ok(!(await page.locator('table').first().innerText()).includes('$'),'Privacy table masking');
 await page.emulateMedia({reducedMotion:'reduce'});await page.waitForTimeout(250);assert.equal(await page.locator('[data-chart-animating="true"]').count(),0,'Reduced motion finishes after short fade');
 await page.emulateMedia({reducedMotion:'no-preference'});
 await page.evaluate(()=>{
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.id='qa-motion';svg.dataset.chart='';svg.setAttribute('viewBox','0 0 100 100');svg.style.cssText='position:absolute;top:2100px;left:0;width:200px;height:200px';svg.innerHTML='<path d="M0 90 L100 10" fill="none" stroke="red"/>';document.body.append(svg);window.scrollTo(0,0);
 });
 await page.waitForTimeout(250);assert.equal(await page.locator('#qa-motion').getAttribute('data-chart-run'),null,'Below viewport does not animate');
 await page.evaluate(()=>window.scrollTo(0,1140));await page.waitForTimeout(250);assert.equal(await page.locator('#qa-motion').getAttribute('data-chart-run'),null,'Less than 35 percent visibility does not animate');
 await page.evaluate(()=>window.scrollTo(0,1250));await page.waitForTimeout(250);assert.equal(await page.locator('#qa-motion').getAttribute('data-chart-run'),'1','35 percent viewport threshold triggers once');
 await page.locator('#qa-motion path').evaluate(node=>node.setAttribute('d','M0 80 L100 20'));await page.waitForTimeout(2200);assert.equal(await page.locator('#qa-motion').getAttribute('data-chart-run'),'2','Data arriving during sweep receives a short replay');
 await page.waitForTimeout(600);assert.equal(await page.locator('#qa-motion').getAttribute('data-chart-run'),'2','Animation decorations do not cause replay loops');
 await page.locator('#qa-motion').evaluate(node=>node.remove());
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.getByRole('button',{name:'Expand to full view',exact:true}).first().click();assert.ok(await page.getByRole('dialog').isVisible());await page.keyboard.press('Escape');assert.equal(await page.getByRole('dialog').count(),0,'Expanded view closes with Escape');
 await page.getByRole('button',{name:'Show amounts',exact:true}).click();
 await page.setViewportSize({width:390,height:844});
 await page.locator('#cashflow-trends').scrollIntoViewIfNeeded();await page.waitForTimeout(700);await page.locator('.recharts-bar-rectangle').last().click();await page.waitForTimeout(200);assert.ok(await page.locator('.recharts-tooltip-wrapper').filter({hasText:'Expenses'}).first().isVisible(),'Mobile chart tooltip pins on tap');
 await page.getByRole('button',{name:/^2026-10-11: /}).click();await page.waitForTimeout(250);assert.ok((await page.getByRole('status').filter({hasText:'2026-10-11'}).innerText()).includes('2026-10-11'),'Calendar tap retains selected-day details');
 await page.close();
 assert.deepEqual(errors,[],'No browser exceptions');
 writeFileSync(path.join(out,'results.json'),JSON.stringify({screenshots:results,checks:['native THB','one-satang reconciliation','investment toggle','no horizontal overflow','table toggle','privacy','no rerender replay','currency replay','reduced motion','35 percent viewport threshold','data changes during animation','no animation replay loops','expanded view Escape','mobile tap tooltip','calendar selected detail'],errors},null,2));
 console.log(`PASS: ${results.length} screenshots and browser interactions. ${out}`);
}finally{await browser.close();server.close();}
