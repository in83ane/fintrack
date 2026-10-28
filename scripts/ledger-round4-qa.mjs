import { createRequire } from 'node:module';
import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import ts from 'typescript';
const repo=process.cwd(),out=path.join(repo,'output/ledger-round4');mkdirSync(out,{recursive:true});
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
 for(const width of [1905,1440,1280,1024,768]) for(const theme of ['dark','light']) {
  const p=await open(width,1000);if(theme==='light')await p.evaluate(()=>document.documentElement.classList.add('light-mode'));
  await p.waitForTimeout(300);
  assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No horizontal overflow '+width);
  assert.equal(await p.getByRole('button',{name:'Filters',exact:true}).count(),0);
  assert.equal(await p.getByRole('button',{name:'Add Record',exact:true}).count(),0);
  const custom=p.getByRole('button',{name:'Custom',exact:true});const rect=await custom.boundingBox();
  assert.ok(rect.x+rect.width<width&&rect.width>65,'Custom completely visible '+width);
  assert.ok((await p.locator('.ledger-list').boundingBox()).width<=721);
  const order=await p.evaluate(()=>['.ledger-filters','.ledger-wallets','.ledger-page section.grid','.ledger-kind-tabs','.ledger-list'].map(s=>document.querySelector(s).getBoundingClientRect().y));
  assert.deepEqual(order,[...order].sort((a,b)=>a-b));
  await shot(p,'ledger-'+width+'-'+theme);
  await custom.click();assert.equal(await p.locator('[data-field-popover].open').evaluate(el=>el.parentElement===document.body),true);
  await shot(p,'date-'+width+'-'+theme);await p.keyboard.press('Escape');
  await p.getByRole('button',{name:'Income',exact:true}).click();await p.waitForTimeout(220);
  const dialog=p.getByRole('dialog',{name:'Add Record'});
  assert.equal(await p.locator('[data-record-amount]').evaluate(el=>el===document.activeElement),true);
  assert.equal(await p.locator('.record-modal').evaluate(el=>getComputedStyle(el).transform),'none');
  assert.equal(await p.locator('.record-overlay .transition-scrim').evaluate(el=>getComputedStyle(el).backdropFilter),'none');
  assert.ok(await dialog.getByRole('button',{name:'เงินรายอาทิตย์',exact:true}).isVisible());
  assert.ok(await dialog.getByRole('button',{name:'Save record',exact:true}).isDisabled());
  for(const field of await dialog.locator('input').all()){const before=await field.evaluate(el=>getComputedStyle(el).borderColor);await field.focus();assert.deepEqual(await field.evaluate(el=>({outline:getComputedStyle(el).outlineStyle,shadow:getComputedStyle(el).boxShadow,border:getComputedStyle(el).borderColor})),{outline:'none',shadow:'none',border:before});}
  await shot(p,'add-'+width+'-'+theme);
  const currency=dialog.getByRole('combobox',{name:'Currency',exact:true});await currency.click();
  assert.equal(await p.getByRole('option').count(),2);assert.equal(await p.getByRole('option',{name:'USD · $',exact:true}).count(),1);
  await shot(p,'currency-'+width+'-'+theme);
  await p.keyboard.press('End');await p.keyboard.press('Enter');assert.equal(await currency.innerText(),'$');
  await currency.click();await p.keyboard.press('Home');await p.keyboard.press('Enter');assert.equal(await currency.innerText(),'฿');
  await currency.click();await p.keyboard.press('u');await p.keyboard.press('Enter');assert.equal(await currency.innerText(),'$');
  await currency.click();await p.keyboard.press('Escape');assert.equal(await dialog.isVisible(),true);assert.equal(await currency.getAttribute('aria-expanded'),'false');
  assert.equal(await currency.evaluate(el=>el===document.activeElement),true);
  await dialog.getByRole('button',{name:'Custom',exact:true}).click();await dialog.getByPlaceholder('Custom category').fill('Bonus');await p.keyboard.press('Enter');
  assert.ok(await dialog.getByRole('button',{name:'Bonus',exact:true}).isVisible());assert.equal(await dialog.getByPlaceholder('Custom category').count(),0);
  await dialog.getByRole('button',{name:'Delete Bonus',exact:true}).click();assert.equal(await dialog.getByRole('button',{name:'Bonus',exact:true}).count(),0);
  await dialog.getByRole('button',{name:'Close / ปิด',exact:true}).focus();await p.keyboard.press('Shift+Tab');assert.equal(await dialog.getByRole('button',{name:'Save record',exact:true}).evaluate(el=>el===document.activeElement),false); // disabled Save is skipped
  await p.keyboard.press('Escape');await p.waitForTimeout(150);
  await p.getByRole('button',{name:'Expense',exact:true}).click();assert.equal(await dialog.locator('.record-type-badge').count(),1);assert.ok(await p.locator('.record-type-badge.expense').isVisible());
  await p.keyboard.press('Escape');await p.close();
 }
 checks.push('5 viewport widths × dark/light: filters, wallet pills, 720px list, modal layout, focus, currency keyboard, Escape priority and saved custom categories');
 const p=await open(1280,800);
 await p.getByRole('combobox',{name:'Month',exact:true}).evaluate(el=>{for(let parent=el.parentElement;parent&&parent!==document.documentElement;parent=parent.parentElement){parent.style.animation='none';parent.style.transform='none';}el.style.position='fixed';el.style.bottom='12px';el.style.left='320px';el.style.width='160px';el.style.zIndex='100';});
 const month=p.getByRole('combobox',{name:'Month',exact:true});await month.click();const panel=await p.locator('[data-field-popover].open').boundingBox(),trigger=await month.boundingBox();
 assert.ok(panel.y+panel.height<=trigger.y,'Menu flips above trigger');assert.ok(panel.height<=280);await shot(p,'select-flipped');await p.keyboard.press('Escape');
 await p.getByRole('button',{name:'Export',exact:true}).click();await p.locator('.ledger-row').first().click();await p.getByRole('button',{name:'Export (1)',exact:true}).isEnabled();await p.keyboard.press('Escape');
 await p.close();
 const th=await open(1280,900,'?lang=th');await th.getByRole('button',{name:'รายรับ',exact:true}).click();
 for(const key of ['allWallets','incomeExpense','noteOptional','SAVERECORD'])assert.ok(!(await th.locator('body').innerText()).includes(key));
 await shot(th,'thai-modal');await th.close();
 checks.push('Select flips above viewport edge; Export selection intact; Thai labels resolved');
 assert.deepEqual(errors,[]);writeFileSync(path.join(out,'results.json'),JSON.stringify({checks,screenshots,errors},null,2));console.log('PASS round4',checks.length,'groups',screenshots.length,'screenshots');
} finally { await browser.close();server.close(); }
