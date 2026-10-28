import { createRequire } from 'node:module';
import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import ts from 'typescript';
const repo=process.cwd(),out=path.join(repo,'output/bucket-round8');mkdirSync(out,{recursive:true});
const require=createRequire(path.join(os.tmpdir(),'fintrack-cashflow-qa/package.json'));
const {build}=require('esbuild'),{chromium}=require('playwright');
const {default:postcss}=await import('postcss'),{default:tailwind}=await import('@tailwindcss/postcss');
const css=(await postcss([tailwind()]).process(readFileSync('src/index.css','utf8'),{from:path.join(repo,'src/index.css')})).css;
const source=ts.createSourceFile('app.tsx',readFileSync('src/context/AppContext.tsx','utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let dictionary;function visit(node){if(ts.isVariableDeclaration(node)&&node.name.getText(source)==='translations')dictionary=node.initializer.getText(source);ts.forEachChild(node,visit);}visit(source);
const fixture=path.join(repo,'scripts/bucket-round8-fixture.tsx');
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

const results=[];
try{
 for(const theme of ['dark','light']){
  const context=await browser.newContext({viewport:{width:1905,height:1100},recordVideo:{dir:out,size:{width:1905,height:1100}}});
  const p=await context.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.goto(base+'/budget');if(theme==='light')await p.evaluate(()=>document.documentElement.classList.add('light-mode'));
  await p.waitForSelector('[data-allocation-bar]');assert.equal(await p.locator('[data-allocation-bar] > div').count(),0,'Loading track is empty');
  await p.evaluate(()=>{window.__motionFrames=[];window.__qaLoad();const start=performance.now();function sample(){const bar=document.querySelector('[data-allocation-bar]'),donut=document.querySelector('[data-allocation-donut]');window.__motionFrames.push({at:performance.now()-start,clip:bar&&getComputedStyle(bar).clipPath,donut:donut&&getComputedStyle(donut).clipPath,segments:bar?[...bar.children].map(n=>({width:n.getBoundingClientRect().width,x:n.getBoundingClientRect().x,transform:getComputedStyle(n).transform})):[],animations:document.getAnimations().map(a=>({duration:a.effect?.getTiming().duration,delay:a.effect?.getTiming().delay,target:a.effect?.target?.getAttribute('data-allocation-bar')!==null?'bar':a.effect?.target?.getAttribute('data-allocation-donut')!==null?'donut':'other'}))});if(performance.now()-start<1100)requestAnimationFrame(sample)}requestAnimationFrame(sample)});
  await p.waitForTimeout(180);await p.screenshot({path:path.join(out,theme+'-filling.png')});await p.waitForTimeout(1100);await p.screenshot({path:path.join(out,theme+'-ready.png')});
  const frames=await p.evaluate(()=>window.__motionFrames);const populated=frames.filter(f=>f.segments.length===3);assert.ok(populated.length>10);
  const geometry=populated[0].segments;for(const frame of populated){assert.deepEqual(frame.segments,geometry,'Final widths and positions from the first real-data frame');assert.ok(frame.segments.every(s=>s.transform==='none'),'No per-segment scale');}
  assert.ok(populated.some(f=>f.clip!=='none'&&f.clip.includes('inset')),'One bar reveal animates');
  assert.ok(populated.some(f=>f.donut?.includes('polygon')),'Donut reveals clockwise');
  const timed=populated.find(f=>f.animations.some(a=>a.target==='bar'));
  assert.equal(timed.animations.find(a=>a.target==='bar').duration,800);assert.equal(timed.animations.find(a=>a.target==='donut').duration,800);
  await p.evaluate(()=>window.__qaTick());await p.waitForTimeout(50);assert.equal(await p.locator('[data-allocation-bar]').evaluate(n=>n.getAnimations().length),0,'Rerender must not replay');
  await p.evaluate(()=>window.__qaRemount());await p.waitForTimeout(50);await p.evaluate(()=>window.__qaRemount());await p.waitForTimeout(50);assert.equal(await p.locator('[data-allocation-bar]').evaluate(n=>n.getAnimations().length),0,'Returning to cached page must not replay');
  assert.deepEqual(errors,[]);results.push({theme,frames:frames.length,segmentWidths:geometry.map(s=>s.width),errors});writeFileSync(path.join(out,theme+'-frames.json'),JSON.stringify(frames,null,2));await context.close();
 }
 const p=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});await p.goto(base+'/budget');await p.evaluate(()=>window.__qaLoad());await p.waitForTimeout(100);assert.equal(await p.locator('[data-allocation-bar]').evaluate(n=>n.getAnimations().length),0);assert.equal(await p.locator('[data-allocation-bar]').evaluate(n=>getComputedStyle(n).clipPath),'none');await p.screenshot({path:path.join(out,'reduced-motion.png')});await p.close();
 writeFileSync(path.join(out,'results.json'),JSON.stringify({results,reducedMotion:true},null,2));console.log(JSON.stringify({results,reducedMotion:true}));
}finally{await browser.close();await new Promise(r=>server.close(r));}
