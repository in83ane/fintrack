import { createRequire } from 'node:module';
import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import ts from 'typescript';
const repo=process.cwd(),out=path.join(repo,'output/ledger-round4-regression');mkdirSync(out,{recursive:true});
const require=createRequire(path.join(os.tmpdir(),'fintrack-cashflow-qa/package.json'));
const {build}=require('esbuild'),{chromium}=require('playwright');
const {default:postcss}=await import('postcss'),{default:tailwind}=await import('@tailwindcss/postcss');
const css=(await postcss([tailwind()]).process(readFileSync('src/index.css','utf8'),{from:path.join(repo,'src/index.css')})).css;
const source=ts.createSourceFile('app.tsx',readFileSync('src/context/AppContext.tsx','utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let dictionary;function visit(node){if(ts.isVariableDeclaration(node)&&node.name.getText(source)==='translations')dictionary=node.initializer.getText(source);ts.forEachChild(node,visit);}visit(source);
const fixture=path.join(repo,'scripts/ledger-qa-fixture.tsx');
const modules={
 'next/navigation':`import React from 'react';import {Navigation} from ${JSON.stringify(fixture)};export const usePathname=()=>React.useContext(Navigation).pathname;export const useRouter=()=>React.useContext(Navigation);export const useSelectedLayoutSegments=()=>React.useContext(Navigation).pathname.split('/').filter(Boolean);`,
 'next/link':`import React from 'react';import {Navigation} from ${JSON.stringify(fixture)};export default function Link({href,onClick,...props}){const nav=React.useContext(Navigation);return <a {...props} href={href} onClick={e=>{onClick?.(e);if(!e.defaultPrevented){e.preventDefault();nav.push(href)}}}/>;}`,
 '@/src/context/AppContext':`export {useApp} from ${JSON.stringify(fixture)};`,
 '@/src/hooks/useFxRate':`export const useFxRate=()=>({rate:33.709,mode:'manual',stale:false,quote:null});`,
 '@/src/lib/supabase':'export const supabase={};',
 '@/src/app/actions':'export const logoutAction=()=>{};',
 '@/src/components/SettingsModal':'export const SettingsModal=()=>null;',
 'qa-translations':`export const translations=${dictionary};`
};
const bundle=await build({entryPoints:[fixture],bundle:true,write:false,format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"development"'},plugins:[{name:'isolated-fixture',setup(b){
 b.onResolve({filter:/.*/},args=>modules[args.path]?{path:args.path,namespace:'qa'}:undefined);
 b.onLoad({filter:/.*/,namespace:'qa'},args=>({contents:modules[args.path],loader:'tsx',resolveDir:repo}));
 b.onResolve({filter:/^@\//},args=>{const base=path.join(repo,args.path.slice(2));return{path:['.tsx','.ts'].map(ext=>base+ext).find(existsSync)};});
}}]});
const server=http.createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/qa.js'?'application/javascript':req.url==='/qa.css'?'text/css':'text/html');res.end(req.url==='/qa.js'?bundle.outputFiles[0].contents:req.url==='/qa.css'?css+'\nbody{font-family:Arial,sans-serif}':'<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/qa.css"></head><body><div id="root"></div><script src="/qa.js"></script></body></html>');});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({executablePath:'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',headless:true});
const errors=[],checks=[],screenshots=[];
async function open(width=1440,height=1000,query='') {const p=await browser.newPage({viewport:{width,height},timezoneId:'Asia/Bangkok'});p.on('pageerror',e=>errors.push(e.message));await p.clock.install({time:new Date('2026-10-25T05:00:00Z')});await p.goto(base+'/ledger'+query);await p.waitForSelector('.ledger-row');return p;}
async function shot(p,name){await p.waitForTimeout(180);await p.screenshot({path:path.join(out,name+'.png'),fullPage:true});screenshots.push(name+'.png');}
try{
 for(const width of [1440,768])for(const theme of ['dark','light']){
  const p=await open(width,width===768?844:1000);if(theme==='light')await p.evaluate(()=>document.documentElement.classList.add('light-mode'));await p.waitForTimeout(400);
  assert.equal(Math.round((await p.locator('header').first().boundingBox()).height),74,'Top bar uses the shared 74px height');
  assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No horizontal overflow');
  assert.equal(await p.locator('header').first().getByText('Home',{exact:true}).count(),0,'Top bar has no breadcrumb');
  assert.equal(await p.locator('header').first().getByText('Ledger',{exact:true}).count(),1,'Top bar title matches the Ledger nav label');
  assert.ok((await p.locator('.ledger-page').innerText()).includes('−฿126.00'));
  assert.ok((await p.locator('.ledger-list').boundingBox()).width<=720,'Ledger list capped at 720px');
  await p.locator('.ledger-row').first().hover();assert.equal(await p.locator('.ledger-checkbox').first().isVisible(),false);
  await shot(p,`ledger-${width}-${theme}`);
  assert.equal(Math.round((await p.locator('.sidebar-rail').boundingBox()).width),254,'Sidebar remains full width');
  if(width===768){await p.close();continue;}
  await p.getByRole('button',{name:'Export',exact:true}).click();await p.waitForTimeout(400);assert.ok(await p.getByRole('button',{name:'Export (0)',exact:true}).isDisabled());await shot(p,`selection-${width}-${theme}`);
  await p.keyboard.press('Escape');await p.locator('[data-ledger-row="cash:food"] button').last().click();await p.waitForTimeout(400);assert.ok(await p.getByRole('dialog').isVisible());await shot(p,`drawer-${width}-${theme}`);
  await p.keyboard.press('Escape');assert.equal(await p.locator('[data-ledger-row="cash:food"] button').last().evaluate(el=>el===document.activeElement),true,'Focus returns to row');
  await p.getByRole('button',{name:'Income',exact:true}).click();await p.waitForTimeout(400);assert.ok(await p.locator('[data-record-amount]').evaluate(el=>el===document.activeElement),'Amount autofocus');await shot(p,`add-${width}-${theme}`);
  for(const height of [720,500,320]){await p.setViewportSize({width:width===1440?1280:width,height});const b=await p.getByRole('button',{name:'Save record',exact:true}).boundingBox();assert.ok(b.y>=0&&b.y+b.height<=height,`Save visible at ${width}x${height}`);}
  await p.close();
 }
 checks.push('1440/768 dark/light; no overflow; native amount; 720px transaction list; normal checkbox hidden; modal footer at 720/500/320px; focus returns');
 const geometry=await open(1800,1000);assert.equal(await geometry.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--topbar-h').trim()),'74px');assert.equal(await geometry.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--sidebar-w').trim()),'254px');assert.equal(Math.round((await geometry.locator('.ledger-page').boundingBox()).width),1216,'Shared page container restores 1216px cap');await geometry.close();checks.push('Shared shell tokens: 74px top bar, 254px sidebar, 1216px page container');
const p=await open();const exportButton=p.getByRole('button',{name:'Export',exact:true});
 await exportButton.click();await p.locator('.ledger-row').first().focus();await p.keyboard.press('Space');await p.locator('.ledger-row').nth(2).click({modifiers:['Shift']});assert.ok(await p.getByRole('button',{name:'Export (3)',exact:true}).isEnabled());
 const download=p.waitForEvent('download');await p.getByRole('button',{name:'Export (3)',exact:true}).click();const csv=readFileSync(await(await download).path(),'utf8');assert.equal(csv.trim().split('\n').length,4);assert.ok(csv.includes('126.00'));assert.ok(!csv.includes('5530.00'));checks.push('Space, Shift range, CSV exactly selected, native CSV decimals');
 await exportButton.click();await p.locator('.ledger-row').first().click();await p.getByRole('button',{name:'Delete (1)',exact:true}).click();assert.ok(await p.getByRole('dialog').isVisible());assert.equal(await p.evaluate(()=>window.__qaCalls.length),0);await p.getByRole('dialog').getByRole('button',{name:'Delete',exact:true}).click();assert.equal(await p.locator('.ledger-row').count(),3);await p.getByRole('button',{name:'Undo',exact:true}).click();assert.equal(await p.locator('.ledger-row').count(),4);await p.waitForTimeout(5100);assert.equal(await p.evaluate(()=>window.__qaCalls.length),0);checks.push('Delete confirms; Undo restores rows without a data write');
 await exportButton.click();await p.getByRole('button',{name:'Select all in this period',exact:true}).click();await p.getByRole('button',{name:'Delete (4)',exact:true}).click();await p.getByRole('dialog').getByRole('button',{name:'Delete',exact:true}).click();await p.waitForTimeout(5300);assert.equal(await p.evaluate(()=>window.__qaCalls.length),4);checks.push('Delayed commit deletes each selected record once after five seconds');
 await p.reload();await p.waitForSelector('.ledger-row');const main=await p.locator('main').boundingBox(),icon=await p.getByRole('link',{name:'Dashboard'}).locator('svg').boundingBox();assert.equal(Math.round((await p.locator('.sidebar-rail').boundingBox()).width),254);await p.locator('.sidebar-rail').hover();await p.waitForTimeout(400);assert.equal((await p.locator('main').boundingBox()).x,main.x);assert.equal((await p.getByRole('link',{name:'Dashboard'}).locator('svg').boundingBox()).x,icon.x);assert.equal(await p.locator('.sidebar-label').first().isVisible(),true);checks.push('Sidebar is fixed at 254px with labels visible; content and icons stay fixed');
 await p.getByRole('link',{name:'Dashboard'}).click();await p.waitForTimeout(700);assert.equal(await p.locator('h1').innerText(),'/dashboard');assert.equal(await p.locator('h1').evaluate(el=>el===document.activeElement),true);
 await p.evaluate(()=>{window.__routeRootPeak=0;new MutationObserver(()=>{window.__routeRootPeak=Math.max(window.__routeRootPeak,document.querySelectorAll('[data-route-page]').length)}).observe(document.body,{childList:true,subtree:true});});await p.evaluate(()=>{Array.from(document.querySelectorAll('a[href="/cashflow"]')).find(el=>el.textContent?.includes('Cash'))?.click();setTimeout(()=>{Array.from(document.querySelectorAll('a[href="/ledger"]')).find(el=>el.textContent?.includes('Ledger'))?.click();},20);});await p.waitForTimeout(900);assert.equal(await p.locator('.ledger-page').count(),1);assert.equal(await p.evaluate(()=>window.__routeRootPeak),1);await p.goBack();await p.waitForTimeout(800);assert.equal(await p.evaluate(()=>document.querySelectorAll('[data-route-page]').length),1);checks.push('Exit-before-swap route transition; rapid navigation leaves exactly one page root; Back has one page root');
 await p.close();
 const slow=await open(1440,1000,'?motion=slow');assert.equal(await slow.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--m')),'5');await slow.close();
 const th=await open(768,844,'?lang=th');for(const key of ['allWallets','unassigned','incomeExpense','transfers','investments','noteOptional','SAVERECORD'])assert.ok(!(await th.locator('body').innerText()).includes(key));await shot(th,'ledger-768-th');await th.close();checks.push('Development slow-motion multiplier5; Thai dictionary keys resolved');
 assert.deepEqual(errors,[]);writeFileSync(path.join(out,'results.json'),JSON.stringify({checks,screenshots,errors},null,2));console.log('PASS',checks.length,'browser check groups;',screenshots.length,'screenshots');
}finally{await browser.close();server.close();}
