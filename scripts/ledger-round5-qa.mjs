import { createRequire } from 'node:module';
import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import ts from 'typescript';
const repo=process.cwd(),out=path.join(repo,'output/ledger-round5');mkdirSync(out,{recursive:true});
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
try {
 const measurements=[];
 for(const width of [1905,1440,1280,1024,768])for(const theme of ['dark','light']){
  const p=await open(width,950,'?wallets=4');if(theme==='light')await p.evaluate(()=>document.documentElement.classList.add('light-mode'));await p.waitForTimeout(300);
  assert.equal(await p.locator('.ledger-page h1').count(),0);assert.equal(await p.locator('.ledger-toolbar > *').count(),4);
  assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No document overflow '+width);
  assert.equal(await p.locator('.ledger-wallets').evaluate(el=>el.scrollWidth>el.clientWidth),false,'Desktop wallet row does not scroll');
  assert.equal(await p.locator('.ledger-wallets > button').count(),6,'All, unassigned and four money buckets');
  assert.equal(await p.locator('.ledger-wallets [data-wallet-id]').count(),4);
  const balances=await p.locator('[data-wallet-balance]').allTextContents();assert.deepEqual(balances,['฿4,600.00','฿1,000.00','฿1,100.00','฿1,200.00','฿1,300.00']);
  for(const box of await p.locator('.ledger-wallet').all())assert.equal(Math.round((await box.boundingBox()).height),46);
  const firstDay=(await p.locator('.ledger-list').boundingBox()).y;measurements.push({width,theme,firstDay});
  if(width===1905)assert.ok(firstDay<=410,'First day begins by 410px: '+firstDay);
  const actions=await p.locator('.ledger-record-actions').boundingBox(),range=await p.locator('.ledger-date-range').boundingBox();
  if(width===1905)assert.ok(Math.abs(actions.y-range.y)<5,'Date and record actions share row');
  const custom=p.getByRole('button',{name:'Custom',exact:true});assert.ok((await custom.boundingBox()).x+(await custom.boundingBox()).width<width);
  assert.equal(await p.locator('.ledger-date-range > div > button').filter({has:p.locator('svg.lucide-x')}).count(),0,'No duplicated current-month clear chip');
  const exp=p.getByRole('button',{name:'Export',exact:true});assert.equal(await exp.innerText(),'');assert.equal(await exp.getAttribute('title'),'Export');
  await shot(p,'ledger-'+width+'-'+theme);
  await p.getByRole('combobox',{name:'Brokers',exact:true}).click();
  assert.ok((await p.getByRole('option').first().innerText()).includes('$25.50 USD'));
  assert.ok(!(await p.getByRole('option').nth(1).innerText()).includes('0.00'),'No invented broker balance');
  await shot(p,'brokers-'+width+'-'+theme);await p.keyboard.press('End');await p.keyboard.press('Enter');
  assert.ok((await p.getByRole('combobox',{name:'Brokers',exact:true}).innerText()).includes('Broker B'));
  assert.equal(await p.locator('.ledger-wallet-select.selected').count(),1);
  await p.locator('.ledger-wallet').first().click();
  await p.locator('.ledger-kind-tabs').getByRole('button',{name:'Transfers',exact:true}).click();
  const info=p.getByRole('button',{name:'Transfers are shown but excluded from cashflow totals.',exact:true});await info.focus();assert.ok(await p.getByRole('tooltip').isVisible());await p.keyboard.press('Escape');await p.locator('.ledger-kind-tabs').getByRole('button',{name:'Income / Expense',exact:true}).click();
  await exp.click();assert.equal(await p.locator('.ledger-type-actions').getByRole('button',{name:'Cancel',exact:true}).innerText(),'Cancel');await p.keyboard.press('Escape');
  await p.close();
 }
 const many=await open(1905,950,'?wallets=8');
 assert.equal(await many.locator('[data-wallet-id]').count(),6);const more=many.getByRole('combobox',{name:'More',exact:true});await more.click();
 assert.ok((await many.getByRole('option',{name:'Holiday USD $100.00 USD'}).innerText()).includes('$100.00 USD'));
 await many.getByRole('option',{name:'Holiday USD $100.00 USD'}).click();assert.equal(await many.locator('[data-wallet-id="wallet-6"][aria-pressed=true]').count(),1);
 assert.equal(await many.locator('[data-wallet-id]').count(),6);assert.ok((await many.locator('.ledger-wallet').first().innerText()).includes('฿14,241.80'),'7500 THB + 200 USD × 33.709');
 await shot(many,'more-selected');await more.click();assert.equal(await many.getByRole('option').count(),2);await many.keyboard.press('Escape');await many.close();
 const load=await browser.newPage({viewport:{width:1905,height:950}});load.on('pageerror',e=>errors.push(e.message));await load.goto(base+'/ledger?wallets=4&state=loading');await load.waitForSelector('[data-ledger-loading]');await load.waitForTimeout(300);
 const beforeY=await load.locator('.ledger-list').evaluate(el=>el.getBoundingClientRect().y);
 assert.equal(await load.locator('.ledger-summary .ledger-sk').count(),3);assert.equal(await load.locator('[data-ledger-loading] .ledger-row').count(),4);assert.equal(await load.locator('.ledger-wallets .ledger-sk').count(),5);
 assert.ok(!(await load.locator('.ledger-summary').innerText()).includes('…'));await shot(load,'loading');
 await load.evaluate(()=>window.__qaLoad());await load.waitForSelector('[data-ledger-row]');await load.waitForTimeout(300);assert.equal(await load.locator('[data-ledger-loading]').count(),0);assert.equal(await load.locator('.ledger-list').evaluate(el=>el.getBoundingClientRect().y),beforeY,'No list shift on data readiness');await load.close();
 const th=await open(1280,900,'?lang=th&wallets=4');await th.locator('[data-ledger-row="cash:food"] button').last().click();await th.getByRole('dialog').getByRole('button',{name:'แก้ไข',exact:true}).click();
 const text=await th.getByRole('dialog').innerText();for(const key of ['allWallets','incomeExpense','noteOptional','SAVERECORD','ledgerMoreWallets','ledgerBrokers'])assert.ok(!text.includes(key));await shot(th,'thai-edit');await th.close();
 assert.deepEqual(errors,[]);writeFileSync(path.join(out,'results.json'),JSON.stringify({measurements,screenshots,errors,checks:['Four toolbar rows; first day <=410px at 1905; 5 widths × 2 themes','Native wallet amounts, total reconciliation, broker source/no invented zero, More keeps selected wallet visible','Immediate 4-row skeleton, stable list position when data arrives','Export/Cancel and tooltip keyboard; Thai drawer labels']},null,2));console.log(JSON.stringify({pass:true,measurements,screenshots:screenshots.length}));
}finally{await browser.close();server.close();}
