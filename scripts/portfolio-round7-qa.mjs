import { createRequire } from 'node:module';
import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import ts from 'typescript';
const repo=process.cwd(),out=path.join(repo,'output/portfolio-round7');mkdirSync(out,{recursive:true});
const require=createRequire(path.join(os.tmpdir(),'fintrack-cashflow-qa/package.json'));
const {build}=require('esbuild'),{chromium}=require('playwright');
const {default:postcss}=await import('postcss'),{default:tailwind}=await import('@tailwindcss/postcss');
const css=(await postcss([tailwind()]).process(readFileSync('src/index.css','utf8'),{from:path.join(repo,'src/index.css')})).css;
const source=ts.createSourceFile('app.tsx',readFileSync('src/context/AppContext.tsx','utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let dictionary;function visit(node){if(ts.isVariableDeclaration(node)&&node.name.getText(source)==='translations')dictionary=node.initializer.getText(source);ts.forEachChild(node,visit);}visit(source);
const fixture=path.join(repo,'scripts/portfolio-round7-fixture.tsx');
const modules={
 'next/navigation':`import React from 'react';import {Navigation} from ${JSON.stringify(fixture)};export const useParams=()=>({});export const useSearchParams=()=>new URLSearchParams(location.search);export const usePathname=()=>React.useContext(Navigation).pathname;export const useRouter=()=>React.useContext(Navigation);export const useSelectedLayoutSegments=()=>React.useContext(Navigation).pathname.split('/').filter(Boolean);`,
 'next/link':`import React from 'react';import {Navigation} from ${JSON.stringify(fixture)};export default function Link({href,onClick,...props}){const nav=React.useContext(Navigation);return <a {...props} href={href} onClick={e=>{onClick?.(e);if(!e.defaultPrevented){e.preventDefault();nav.push(href)}}}/>;}`,
 '@/src/context/AppContext':`export {useApp} from ${JSON.stringify(fixture)};`,
 '@/src/hooks/useFxRate':`export {useFxRate} from ${JSON.stringify(fixture)};`,
 '@/src/lib/supabase':'export const supabase={auth:{getSession:async()=>({data:{session:null}})}};export const db={};',
 '@/src/app/actions':'export const logoutAction=()=>{};',
 '@/src/components/SettingsModal':'export const SettingsModal=()=>null;',
 'qa-translations':`export const translations=${dictionary};`
};
const bundle=await build({entryPoints:[fixture],bundle:true,write:false,format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"development"'},plugins:[{name:'isolated-fixture',setup(b){
 b.onResolve({filter:/.*/},args=>modules[args.path]?{path:args.path,namespace:'qa'}:undefined);
 b.onLoad({filter:/.*/,namespace:'qa'},args=>({contents:modules[args.path],loader:'tsx',resolveDir:repo}));
 b.onResolve({filter:/^@\//},args=>{const base=path.join(repo,args.path.slice(2));return{path:['.tsx','.ts','.js','/index.tsx','/index.ts'].map(ext=>base+ext).find(existsSync)};});
}}]});
const server=http.createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/qa.js'?'application/javascript':req.url==='/qa.css'?'text/css':'text/html');res.end(req.url==='/qa.js'?bundle.outputFiles[0].contents:req.url==='/qa.css'?css+'\nbody{font-family:Arial,sans-serif}':'<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/qa.css"></head><body><div id="root"></div><script src="/qa.js"></script></body></html>');});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({executablePath:'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',headless:true});
const errors=[],measurements=[];
const smoke=[];
async function geometry(p){return p.evaluate(()=>{const root=document.querySelector('[data-portfolio-view]');const title=root.querySelector('h1');const summary=[...root.querySelectorAll('section')].find(e=>e.textContent.includes('มูลค่าสินทรัพย์ทั้งหมด'));const heading=[...root.querySelectorAll('h2')].find(e=>e.textContent==='หัวข้อสินทรัพย์');const tabs=root.querySelector('[aria-label="ประเภทสินทรัพย์"]');const toolbar=root.querySelector('input[type=search]');return Object.fromEntries(Object.entries({title,summary,heading,tabs,toolbar}).map(([k,e])=>{const r=e.getBoundingClientRect();return[k,{x:r.x,y:r.y,w:r.width,h:r.height}]}));});}
try {
for(const route of ['dashboard','portfolio','portfolio/AAPL','ledger','cashflow','terminal','trade','trade/plan','budget','history','calendar','transactions','settings','trader-hub']){
 const p=await browser.newPage({viewport:{width:1905,height:1100}});p.on('pageerror',e=>errors.push(route+': '+e.message));await p.goto(base+'/portfolio?route='+route);await p.waitForTimeout(400);
 const state=await p.evaluate(()=>({height:document.querySelector('[data-route-entered]')?.getBoundingClientRect().height,text:document.querySelector('[data-route-entered]')?.textContent?.length,shimmers:document.querySelectorAll('.sk-shimmer').length}));smoke.push({route,...state});await p.screenshot({path:path.join(out,route.replaceAll('/','-')+'-skeleton.png'),fullPage:true});await p.close();
}
console.log(JSON.stringify({smoke,errors},null,2));writeFileSync(path.join(out,'route-smoke.json'),JSON.stringify({smoke,errors},null,2));assert.deepEqual(errors,[]);
for(const width of [1905,1440,1280])for(const theme of ['dark','light']){
 const p=await browser.newPage({viewport:{width,height:1100},timezoneId:'Asia/Bangkok'});p.on('pageerror',e=>errors.push(e.message));await p.goto(base+'/portfolio');await p.waitForSelector('[data-portfolio-view]');await p.waitForTimeout(250);if(theme==='light')await p.evaluate(()=>document.documentElement.classList.add('light-mode'));
 assert.equal(await p.getByText('Rate unavailable',{exact:true}).count(),0);
 const fx=p.locator('[aria-label="USD THB exchange rate"]');assert.equal(await fx.locator('.sk-shimmer').count(),2);
 const labels=await p.locator('[aria-label="ประเภทสินทรัพย์"]').innerText();
 const before=await geometry(p);await p.screenshot({path:path.join(out,`${width}-${theme}-loading.png`),fullPage:true});
 const phase1=await p.locator('.sk-shimmer').first().evaluate(e=>getComputedStyle(e).backgroundPosition);await p.waitForTimeout(100);const phase2=await p.locator('.sk-shimmer').first().evaluate(e=>getComputedStyle(e).backgroundPosition);assert.notEqual(phase1,phase2,'Shimmer moves');
 await p.evaluate(()=>window.__qaLoad());await p.waitForFunction(()=>document.querySelector('[data-portfolio-view]').getAttribute('aria-busy')==='false');await p.waitForTimeout(350);
 if(width===1905&&theme==='dark'){
   await p.locator('[aria-label="ประเภทสินทรัพย์"] button').nth(1).click();
   const tab=await p.locator('[aria-label="ประเภทสินทรัพย์"]').innerHTML();
   await p.evaluate(()=>window.scrollTo(0,150));const scroll=await p.evaluate(()=>scrollY);
   for(const selected of [null,'p1','p2',null,'p1','p2',null,'p1','p2',null]){
     await p.evaluate(id=>window.__qaSelect(id),selected);await p.waitForTimeout(30);
     assert.equal(await p.locator('[data-portfolio-view]').getAttribute('aria-busy'),'false');
     assert.equal(await p.locator('[aria-label="ประเภทสินทรัพย์"]').innerHTML(),tab,'Selected tab persists across portfolio switches');
     assert.equal(await p.evaluate(()=>scrollY),scroll,'Portfolio selection preserves scroll');
   }
   await p.locator('[aria-label="ประเภทสินทรัพย์"] button').first().click();await p.evaluate(()=>window.scrollTo(0,0));
   console.log('PASS actual Portfolio view: 10 switches, no skeleton, stable selected tab and scroll');
 }
 const after=await geometry(p);assert.equal(await p.locator('[aria-label="ประเภทสินทรัพย์"]').innerText(),labels);
 await p.locator('h1').evaluate(e=>{e.tabIndex=-1;e.focus()});assert.equal(await p.locator('h1').evaluate(e=>getComputedStyle(e).outlineStyle),'none');
 await p.screenshot({path:path.join(out,`${width}-${theme}-ready.png`),fullPage:true});
 const delta=Object.fromEntries(Object.keys(before).map(k=>[k,Math.round((after[k].y-before[k].y)*100)/100]));measurements.push({width,theme,before,after,delta});
 await p.close();
}
const reduced=await browser.newPage({reducedMotion:'reduce'});reduced.on('pageerror',e=>errors.push(e.message));await reduced.goto(base+'/portfolio?empty=1');await reduced.waitForSelector('.sk-shimmer');assert.equal(await reduced.locator('.sk-shimmer').first().evaluate(e=>getComputedStyle(e).animationName),'none');await reduced.evaluate(()=>window.__qaFxError());await reduced.getByText('Rate unavailable',{exact:true}).waitFor();await reduced.close();
writeFileSync(path.join(out,'measurements.json'),JSON.stringify({measurements,errors},null,2));console.log(JSON.stringify({measurements:measurements.map(x=>({width:x.width,theme:x.theme,delta:x.delta})),errors},null,2));assert.deepEqual(errors,[]);
for(const m of measurements)for(const [k,d] of Object.entries(m.delta))assert.ok(Math.abs(d)<=4,`${m.width} ${k} drift ${d}`);
}finally{await browser.close();await new Promise(r=>server.close(r));}
