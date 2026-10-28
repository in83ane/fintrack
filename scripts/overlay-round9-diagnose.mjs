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
const fixture=path.join(repo,'scripts/ledger-qa-fixture.tsx');
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

const errors=[];
const p=await browser.newPage({viewport:{width:1905,height:950}});p.on('pageerror',e=>errors.push(e.message));
const snapshot=()=>p.evaluate(()=>{
 const selectors={html:'html',body:'body',main:'main[data-page-content]',wrapper:'body #root > .ml-\\[var\\(--sidebar-w\\)\\]',header:'header.sticky',summary:'.ledger-summary',list:'.ledger-list',sidebar:'aside'};
 const styles=Object.fromEntries(Object.entries(selectors).map(([key,selector])=>{const el=document.querySelector(selector);if(!el)return[key,null];const c=getComputedStyle(el),r=el.getBoundingClientRect();return[key,{x:r.x,y:r.y,width:r.width,height:r.height,clientWidth:el.clientWidth,offsetWidth:el.offsetWidth,paddingRight:c.paddingRight,marginRight:c.marginRight,overflow:c.overflow,overflowX:c.overflowX,overflowY:c.overflowY,gutter:c.scrollbarGutter,transform:c.transform,filter:c.filter,zoom:c.zoom,inline:el.getAttribute('style'),classes:el.className}]}));
 return{styles,scroll:{x:scrollX,y:scrollY,root:document.scrollingElement.tagName},indicators:[...document.querySelectorAll('span[aria-hidden=true].absolute')].map(e=>({parent:e.parentElement.textContent,transform:e.style.transform,rect:e.getBoundingClientRect().toJSON()}))};
});
try{
 await p.goto(base+'/ledger?wallets=4');await p.waitForSelector('.ledger-row');await p.waitForTimeout(700);
 const before=await snapshot();await p.getByRole('button',{name:'Income',exact:true}).click();await p.waitForTimeout(600);const income=await snapshot();await p.screenshot({path:path.join(out,process.env.QA_BEFORE?'before-fix-income.png':'after-fix-income.png')});await p.keyboard.press('Escape');await p.waitForTimeout(350);const after=await snapshot();
 const result={before,income,after,errors};writeFileSync(path.join(out,process.env.QA_BEFORE?'before-computed.json':'after-computed.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await browser.close();server.close();}

