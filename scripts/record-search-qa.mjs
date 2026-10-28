import { createRequire } from 'node:module';
import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import ts from 'typescript';
const repo=process.cwd(),out=path.join(repo,'output/record-search');mkdirSync(out,{recursive:true});
const require=createRequire(path.join(os.tmpdir(),'fintrack-cashflow-qa/package.json'));
const {build}=require('esbuild'),{chromium}=require('playwright');
const {default:postcss}=await import('postcss'),{default:tailwind}=await import('@tailwindcss/postcss');
const css=(await postcss([tailwind()]).process(readFileSync('src/index.css','utf8'),{from:path.join(repo,'src/index.css')})).css;
const source=ts.createSourceFile('app.tsx',readFileSync('src/context/AppContext.tsx','utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let dictionary;function visit(node){if(ts.isVariableDeclaration(node)&&node.name.getText(source)==='translations')dictionary=node.initializer.getText(source);ts.forEachChild(node,visit);}visit(source);
const fixture=path.join(repo,'scripts/record-search-fixture.tsx');
const modules={
 'next/dynamic':`import React from 'react';export default function dynamic(loader,options){return ()=>options?.loading?React.createElement(options.loading):null;}`,
 'next/navigation':`import React from 'react';import {Navigation} from ${JSON.stringify(fixture)};export const usePathname=()=>React.useContext(Navigation).pathname;export const useRouter=()=>React.useContext(Navigation);export const useSelectedLayoutSegments=()=>React.useContext(Navigation).pathname.split('/').filter(Boolean);`,
 'next/link':`import React from 'react';import {Navigation} from ${JSON.stringify(fixture)};export default function Link({href,onClick,...props}){const nav=React.useContext(Navigation);return <a {...props} href={href} onClick={e=>{onClick?.(e);if(!e.defaultPrevented){e.preventDefault();nav.push(href)}}}/>;}`,
 '@/src/context/AppContext':`export {useApp} from ${JSON.stringify(fixture)};`,
 '@/src/hooks/useFxRate':`export const useFxRate=()=>({rate:33.709,mode:'manual',stale:false,quote:null});`,
 '@/src/lib/supabase':'export const supabase={};',
 '@/src/app/actions':'export const logoutAction=()=>{};',
 '@/src/components/SettingsModal':'export const SettingsModal=()=>null;',
 'qa-translations':`export const translations=${dictionary};`
};
const bundle=await build({entryPoints:[fixture],bundle:true,outfile:path.join(out,'qa.js'),write:false,format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"development"'},plugins:[{name:'isolated-fixture',setup(b){
 b.onResolve({filter:/.*/},args=>modules[args.path]?{path:args.path,namespace:'qa'}:undefined);
 b.onLoad({filter:/.*/,namespace:'qa'},args=>({contents:modules[args.path],loader:'tsx',resolveDir:repo}));
 b.onResolve({filter:/^@\//},args=>{const base=path.join(repo,args.path.slice(2));return{path:['.tsx','.ts'].map(ext=>base+ext).find(existsSync)};});
}}]});
const server=http.createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/qa.js'?'application/javascript':req.url==='/qa.css'?'text/css':'text/html');res.end(req.url==='/qa.js'?bundle.outputFiles[0].contents:req.url==='/qa.css'?css+'\nbody{font-family:Arial,sans-serif}':'<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/qa.css"></head><body><div id="root"></div><script src="/qa.js"></script></body></html>');});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({executablePath:'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',headless:true});
const errors=[],results=[];
try{
 for(const reduced of [false,true]){
  const p=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:reduced?'reduce':'no-preference'});
  p.on('pageerror',e=>errors.push(e.message));await p.goto(`${base}/settings`);
  await p.locator('.settings-page').waitFor();
  const motion=await p.locator('.settings-page').evaluate(root=>{
   const animation=root.getAnimations().find(a=>a.animationName==='page-enter');
   if(animation){animation.pause();animation.currentTime=90;}
   const nodes=[root.querySelector('h1'),...root.querySelectorAll('section')];
   return {animation:!!animation,opacity:Number(getComputedStyle(root).opacity),sections:nodes.length,
    independentEntrances:nodes.some(n=>n.style.opacity||n.style.transform||n.getAnimations().length)};
  });
  assert.equal(motion.animation,!reduced);assert(motion.sections>=6);assert.equal(motion.independentEntrances,false);
  if(!reduced)assert(motion.opacity>0&&motion.opacity<1,'whole settings page shares intermediate opacity');
  await p.screenshot({path:path.join(out,`settings-${reduced?'reduced':'entering'}.png`),fullPage:true});
  await p.close();
 }
 for(const theme of ['dark','light'])for(const width of [390,768,1440])for(const route of ['ledger','cashflow'])for(const lang of ['en','th']){
  const p=await browser.newPage({viewport:{width,height:1000},hasTouch:width===390,isMobile:width===390,timezoneId:'Asia/Bangkok'});p.on('pageerror',e=>errors.push(e.message));
  await p.clock.install({time:new Date('2026-10-25T05:00:00Z')});await p.goto(`${base}/${route}?lang=${lang}`);
  if(theme==='light')await p.evaluate(()=>document.documentElement.classList.add('light-mode'));
  const search=p.getByRole('searchbox');await search.waitFor();
  const assertUnifiedSurface=async()=>{
   const style=await search.evaluate(el=>{const s=getComputedStyle(el);return {background:s.backgroundColor,image:s.backgroundImage,border:s.borderTopWidth};});
   assert.deepEqual(style,{background:'rgba(0, 0, 0, 0)',image:'none',border:'0px'},'input must not paint an inner rectangle');
  };
  await assertUnifiedSurface();
  const geometry=()=>search.evaluate(el=>{
   const field=el.parentElement,root=field.parentElement,status=root.querySelector('[role="status"]');
   const box=node=>{const r=node.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};};
   return {root:box(root),field:box(field),input:box(el),status:box(status),nextTop:root.nextElementSibling?.getBoundingClientRect().top,shell:box(document.querySelector('main'))?.x};
  });
  const emptyGeometry=await geometry();
  assert.equal(emptyGeometry.field.height,50,'search height is fixed in the real shell');
  const assertStable=async state=>assert.deepEqual(await geometry(),emptyGeometry,`${route}/${lang}/${width}: ${state} must not move search or the following content`);
  await search.fill('no-such-transaction');await p.waitForTimeout(100);
  await assertStable('no matches');
  await assertUnifiedSurface();
  assert.ok((await p.getByRole('status').allTextContents()).some(t=>t.includes('0 ')));
  await search.fill('Food');await p.waitForTimeout(100);
  await assertStable('matching query');
  assert.ok((await p.getByRole('status').allTextContents()).some(t=>/matches|รายการที่พบ/.test(t)&&!t.startsWith('0 ')));
  if(route==='ledger'){assert.ok(await p.locator('[data-ledger-row]').count()>0);assert.equal(await p.locator('[data-ledger-row]').filter({hasText:'Gift'}).count(),0);}
  await search.fill('2026-10');await p.waitForTimeout(100);
  assert.ok((await p.getByRole('status').allTextContents()).some(t=>/matches|รายการที่พบ/.test(t)&&!t.startsWith('0 ')));
  await search.fill('1111');
  const clear=p.getByRole('button',{name:lang==='th'?'ล้างคำค้น':'Clear search',exact:true});
  assert.equal(await clear.count(),1);
  await search.focus();
  await search.locator('..').screenshot({path:path.join(out,`${route}-${lang}-${width}-${theme}-filled.png`)});
  await clear.click();assert.equal(await search.inputValue(),'');
  await assertStable('cleared query');
  await assertUnifiedSurface();
  await search.blur();await assertStable('blurred query');await assertUnifiedSurface();await search.focus();
  assert.equal(await clear.count(),0);assert(await search.evaluate(el=>el===document.activeElement));
  await p.screenshot({path:path.join(out,`${route}-${lang}-${width}-${theme}.png`),fullPage:true});results.push({route,lang,width,theme,unifiedSurface:true,oneClearButton:true,focusRestored:true,stableGeometry:true,passed:true});await p.close();
 }
 assert.deepEqual(errors,[]);writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results));
}finally{await browser.close();server.close();}
