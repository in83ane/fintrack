import { createRequire } from 'node:module';
import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import ts from 'typescript';
const repo=process.cwd(),out=path.join(repo,'output/portfolio-broker-totals');mkdirSync(out,{recursive:true});
const require=createRequire(path.join(os.tmpdir(),'fintrack-spending-qa/package.json'));
const {build}=require('esbuild'),{chromium}=require('playwright-core');
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
const bundle=await build({entryPoints:[fixture],bundle:true,write:false,outdir:out,format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"development"'},plugins:[{name:'isolated-fixture',setup(b){
 b.onResolve({filter:/.*/},args=>modules[args.path]?{path:args.path,namespace:'qa'}:undefined);
 b.onLoad({filter:/.*/,namespace:'qa'},args=>({contents:modules[args.path],loader:'tsx',resolveDir:repo}));
 b.onResolve({filter:/^@\//},args=>{const base=path.join(repo,args.path.slice(2));return{path:['.tsx','.ts','.js','/index.tsx','/index.ts'].map(ext=>base+ext).find(existsSync)};});
}}]});
const server=http.createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/qa.js'?'application/javascript':req.url==='/qa.css'?'text/css':'text/html');res.end(req.url==='/qa.js'?bundle.outputFiles[0].contents:req.url==='/qa.css'?css+'\nbody{font-family:Arial,sans-serif}':'<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/qa.css"></head><body><div id="root"></div><script src="/qa.js"></script></body></html>');});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({executablePath:'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',headless:true});

const errors=[];
try {
 const p=await browser.newPage({viewport:{width:1440,height:1000}});p.on('pageerror',e=>errors.push(e.message));
 await p.goto(base+'/portfolio');await p.evaluate(()=>window.__qaLoad());
 await p.waitForFunction(()=>document.querySelector('[data-portfolio-view]')?.getAttribute('aria-busy')==='false');
 await p.waitForTimeout(350);
 const chips=()=>p.getByRole('tablist',{name:'โบรกเกอร์',exact:true}).getByRole('tab');
 const initial=await chips().allTextContents();assert.equal(initial.length,3);assert(initial[1].includes('8,094'));assert(initial[2].includes('22,257'));
 for(const selected of ['p1','p2',null,'p2','p1',null]){
  await p.evaluate(id=>window.__qaSelect(id),selected);await p.waitForTimeout(100);
  assert.deepEqual(await chips().allTextContents(),initial,'All broker chip totals must be independent of the selected broker');
 }
 await p.screenshot({path:path.join(out,'all.png')});
 await p.evaluate(()=>window.__qaSelect('p2'));await p.waitForTimeout(100);await p.screenshot({path:path.join(out,'webull.png')});
 await p.goto(base+'/portfolio?emptyWebull=1');await p.evaluate(()=>window.__qaLoad());await p.waitForFunction(()=>document.querySelector('[data-portfolio-view]')?.getAttribute('aria-busy')==='false');await p.waitForTimeout(350);const emptyBaseline=await chips().allTextContents();assert(emptyBaseline[1].includes('8,094'));assert(emptyBaseline[2].includes('฿0'));await chips().nth(2).click();await p.waitForTimeout(100);assert.deepEqual(await chips().allTextContents(),emptyBaseline,'Empty Webull must not clear Dime or All');await chips().first().click();await p.waitForTimeout(100);assert.deepEqual(await chips().allTextContents(),emptyBaseline);assert.deepEqual(errors,[]);console.log('PASS All/Dime/Webull totals remain stable through repeated selection; actual Portfolio component, no service writes');
}finally{await browser.close();await new Promise(r=>server.close(r));}
