import { createRequire } from 'node:module';
import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import ts from 'typescript';
const repo=process.cwd(),out=path.join(repo,'output/overlay-round9');mkdirSync(out,{recursive:true});
const require=createRequire(path.join(os.tmpdir(),'fintrack-cashflow-qa/package.json'));
const {build}=require('esbuild'),{chromium}=require('playwright');
const {default:postcss}=await import('postcss'),{default:tailwind}=await import('@tailwindcss/postcss');
const css=(await postcss([tailwind()]).process(readFileSync('src/index.css','utf8'),{from:path.join(repo,'src/index.css')})).css;
const source=ts.createSourceFile('app.tsx',readFileSync('src/context/AppContext.tsx','utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let dictionary;function visit(node){if(ts.isVariableDeclaration(node)&&node.name.getText(source)==='translations')dictionary=node.initializer.getText(source);ts.forEachChild(node,visit);}visit(source);
const fixture=path.join(repo,'scripts/overlay-round9-fixture.tsx');
const modules={
 '@/src/components/skeleton/RouteSkeleton':'export const RouteSkeleton=()=>null;',
 'next/navigation':`import React from 'react';import {Navigation} from ${JSON.stringify(fixture)};export const useParams=()=>({});export const useSearchParams=()=>new URLSearchParams(location.search);export const usePathname=()=>React.useContext(Navigation).pathname;export const useRouter=()=>React.useContext(Navigation);export const useSelectedLayoutSegments=()=>React.useContext(Navigation).pathname.split('/').filter(Boolean);`,
 'next/link':`import React from 'react';import {Navigation} from ${JSON.stringify(fixture)};export default function Link({href,onClick,...props}){const nav=React.useContext(Navigation);return <a {...props} href={href} onClick={e=>{onClick?.(e);if(!e.defaultPrevented){e.preventDefault();nav.push(href)}}}/>;}`,
 '@/src/context/AppContext':`export {useApp} from ${JSON.stringify(fixture)};`,
 '@/src/hooks/useFxRate':`export const useFxRate=()=>({rate:33.709,mode:'manual',stale:false,quote:null});`,
 '@/src/lib/supabase':'export const db={};export const supabase={auth:{getSession:async()=>({data:{session:null}})}};',
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


const errors=[],results=[];
async function capture(p){return p.evaluate(()=>{
 const selectors=['[data-test-fixed-plus]','button.fixed','.sidebar-nav a','.sidebar-nav [data-gliding-indicator]','header.sticky','header.sticky button','header.sticky h2','header.sticky [aria-label="USD THB exchange rate"]','header.sticky [data-gliding-indicator]','.ledger-date-range button','.ledger-date-range [data-gliding-indicator]','.ledger-wallets > *','.ledger-summary','.ledger-summary > div','.ledger-kind-tabs button','.ledger-kind-tabs [data-gliding-indicator]','.ledger-list > section > header','[data-ledger-row]'];
 const rects={};for(const sel of selectors)[...document.querySelectorAll(sel)].slice(0,sel==='[data-ledger-row]'?3:100).forEach((e,i)=>{const r=e.getBoundingClientRect();rects[sel+':'+i]={x:r.x,y:r.y,width:r.width,height:r.height};});
 return{rects,scroll:scrollY,overflow:document.documentElement.style.overflow,bodyOverflow:document.body.style.overflow,bodyWidth:document.body.clientWidth};
});}
function compare(before,after,label){let maximum=0;for(const key in before.rects)for(const prop of ['x','y','width','height']){assert.ok(after.rects[key],key);const delta=Math.abs(after.rects[key][prop]-before.rects[key][prop]);maximum=Math.max(maximum,delta);assert.ok(delta<=.5,`${label} ${key}.${prop}: ${before.rects[key][prop]} → ${after.rects[key][prop]}`);}assert.equal(after.scroll,before.scroll,label+' scroll');return maximum;}
const click=locator=>locator.evaluate(el=>el.click());
async function cycle(p,name,open,close,metadata){
 await p.waitForTimeout(380);const before=await capture(p);await p.evaluate(()=>{window.__glideRuns=[];window.__overlaySampling=true;});
 await open();await p.waitForTimeout(390);const during=await capture(p);let max=compare(before,during,name+' open');
 await close();await p.waitForTimeout(220);const after=await capture(p);max=Math.max(max,compare(before,after,name+' close'));
 const animations=await p.evaluate(()=>{window.__overlaySampling=false;return window.__glideRuns;});assert.deepEqual(animations,[],name+' must not animate any highlight');
 assert.equal(after.overflow,before.overflow,name+' restores scroll lock');results.push({...metadata,name,maxDelta:max,animations:animations.length,measurements:Object.keys(before.rects).length});
}
try{
 for(const width of (process.env.QA_EXTRA?[1905]:[1905,1440,1280]))for(const theme of (process.env.QA_EXTRA?['dark']:['dark','light']))for(const reduced of [false,true]){
  const p=await browser.newPage({viewport:{width,height:950},reducedMotion:reduced?'reduce':'no-preference'});p.on('pageerror',e=>errors.push(e.message));
  await p.addInitScript(()=>{const original=Element.prototype.animate;window.__glideRuns=[];Element.prototype.animate=function(...args){if(this.matches('[data-gliding-indicator]'))window.__glideRuns.push({key:this.dataset.activeKey,options:args[1]});return original.apply(this,args);};});
  await p.goto(base+'/ledger?wallets=4');await p.waitForSelector('.ledger-row');await p.waitForTimeout(550);if(theme==='light')await p.evaluate(()=>document.documentElement.classList.add('light-mode'));
  assert.deepEqual(await p.evaluate(()=>window.__glideRuns),[],'Mount places indicators immediately');
  const meta={width,theme,reduced};
  for(const type of ['Income','Expense'])await cycle(p,type,()=>click(p.getByRole('button',{name:type,exact:true})),()=>p.keyboard.press('Escape'),meta);
  await cycle(p,'drawer',()=>click(p.locator('[data-ledger-row="cash:food"] > button')),()=>p.keyboard.press('Escape'),meta);
  await click(p.locator('[data-ledger-row="cash:food"] > button'));await p.waitForTimeout(350);
  await cycle(p,'confirm-delete',()=>click(p.getByRole('dialog').getByRole('button',{name:'Delete',exact:true})),()=>p.keyboard.press('Escape'),meta);await p.keyboard.press('Escape');await p.waitForTimeout(220);
  await click(p.getByRole('button',{name:'Income',exact:true}));await p.waitForTimeout(350);
  await cycle(p,'currency-dropdown',()=>click(p.getByRole('combobox',{name:'Currency',exact:true})),()=>p.keyboard.press('Escape'),meta);await p.keyboard.press('Escape');await p.waitForTimeout(220);
  await cycle(p,'month-dropdown',()=>click(p.getByRole('combobox',{name:'Month',exact:true})),()=>p.keyboard.press('Escape'),meta);
  await cycle(p,'brokers-dropdown',()=>click(p.getByRole('combobox',{name:'Brokers',exact:true})),()=>p.keyboard.press('Escape'),meta);
  if(width===1905&&!reduced){await p.screenshot({path:path.join(out,theme+'-normal.png')});await click(p.getByRole('button',{name:'Income',exact:true}));await p.waitForTimeout(350);await p.screenshot({path:path.join(out,theme+'-income.png')});await p.keyboard.press('Escape');await p.waitForTimeout(220);}
  if(process.env.QA_EXTRA){
    await p.evaluate(()=>window.__glideRuns=[]);await click(p.locator('header.sticky').getByRole('button',{name:'USD',exact:true}));await p.waitForTimeout(60);assert.equal((await p.evaluate(()=>window.__glideRuns)).length>0,!reduced,'Currency selection motion');await p.waitForTimeout(350);
    await p.evaluate(()=>window.__glideRuns=[]);await click(p.getByRole('button',{name:'1D',exact:true}));await p.waitForTimeout(350);await p.evaluate(()=>window.__glideRuns=[]);await click(p.getByRole('button',{name:'1W',exact:true}));await p.waitForTimeout(60);assert.equal((await p.evaluate(()=>window.__glideRuns)).length>0,!reduced,'Date preset selection motion');await p.waitForTimeout(350);
    await click(p.getByRole('button',{name:'Oct 26',exact:true}));await p.waitForTimeout(350);
  }
  // Selection still animates; changing geometry with the same selection never does.
  await p.evaluate(()=>window.__glideRuns=[]);await click(p.getByRole('button',{name:'Sep 26',exact:true}));await p.waitForTimeout(60);
  const selection=await p.evaluate(()=>window.__glideRuns);assert.equal(selection.length>0,!reduced,'Month selection motion respects preference');if(!reduced){assert.equal(selection[0].options.duration,320);assert.equal(selection[0].options.easing,'cubic-bezier(.3,1.15,.5,1)');}
  await click(p.getByRole('button',{name:'Oct 26',exact:true}));await p.waitForTimeout(350);await p.evaluate(()=>window.__glideRuns=[]);await click(p.locator('.ledger-kind-tabs').getByRole('button',{name:'All',exact:true}));await p.waitForTimeout(60);assert.equal((await p.evaluate(()=>window.__glideRuns)).length>0,!reduced,'Tab selection motion');await p.waitForTimeout(350);
  await p.evaluate(()=>window.__glideRuns=[]);await p.setViewportSize({width:width-80,height:950});await p.waitForTimeout(120);assert.deepEqual(await p.evaluate(()=>window.__glideRuns),[],'Resize snaps');assert.ok(await p.locator('[data-gliding-indicator]').evaluateAll(nodes=>nodes.every(n=>{const a=n.getBoundingClientRect(),b=n.parentElement.getBoundingClientRect();return Math.abs(a.x-b.x)<.5&&Math.abs(a.y-b.y)<.5;})),'Resize follows active item');
  await p.evaluate(()=>window.__glideRuns=[]);await click(p.locator('.sidebar-nav a[href="/cashflow"]'));await p.waitForTimeout(60);assert.equal((await p.evaluate(()=>window.__glideRuns)).length>0,!reduced,'Sidebar selection motion');
  await p.waitForTimeout(550);
  if(width===1905 && theme==='dark' && !reduced){
    await click(p.locator('.sidebar-nav a[href="/ledger"]'));await p.waitForTimeout(550);
    await p.setViewportSize({width,height:600});await p.evaluate(()=>window.scrollTo(0,120));await p.waitForTimeout(200);
    await cycle(p,'scrolled-income',()=>click(p.getByRole('button',{name:'Income',exact:true})),()=>p.keyboard.press('Escape'),{...meta,height:600});
    await click(p.getByRole('button',{name:'Income',exact:true}));await p.waitForTimeout(350);
    await p.evaluate(()=>window.dispatchEvent(new CustomEvent('fintrack:navigate',{detail:'/cashflow'})));await p.waitForTimeout(600);
    assert.equal(await p.evaluate(()=>document.documentElement.style.overflow),'','Route unmount releases scroll lock');
    assert.equal(await p.evaluate(()=>document.body.style.overflow),'');
    await click(p.locator('.sidebar-nav a[href="/ledger"]'));await p.waitForTimeout(550);
    await p.evaluate(()=>{window.__glideRuns=[];document.querySelector('.ledger-kind-tabs').style.gap='9px';document.fonts.dispatchEvent(new Event('loadingdone'));});await p.waitForTimeout(80);
    assert.deepEqual(await p.evaluate(()=>window.__glideRuns),[],'Same selection/font geometry changes snap');
  }
  await p.close();writeFileSync(path.join(out,process.env.QA_EXTRA?'extra-results.json':'results.json'),JSON.stringify({results,errors},null,2));
 }
 assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:results.length,maxDelta:Math.max(...results.map(r=>r.maxDelta)),errors}));
}finally{await browser.close();server.close();}
