// Isolated Next App Router integration. Real shell/transition code; no credentials
// or financial writes. Server pages deliberately wait to reproduce cold routing.
import { mkdirSync, readFileSync, writeFileSync, existsSync, symlinkSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import ts from 'typescript';
const STALE_TTL=300000;
const repo=process.cwd(),dir=path.join(os.tmpdir(),`fintrack-mobile-fixture`),out=path.join(repo,'output/mobile-qa');
const require=createRequire(path.join(os.tmpdir(),'fintrack-spending-qa/package.json'));
const {chromium}=require('playwright-core');
mkdirSync(dir,{recursive:true});mkdirSync(out,{recursive:true});
if(!existsSync(path.join(dir,'node_modules')))symlinkSync(path.join(repo,'node_modules'),path.join(dir,'node_modules'),'junction');
const write=(name,contents)=>{const file=path.join(dir,name);mkdirSync(path.dirname(file),{recursive:true});writeFileSync(file,contents);};
const source=ts.createSourceFile('app.tsx',readFileSync('src/context/AppContext.tsx','utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let dictionary;function visit(n){if(ts.isVariableDeclaration(n)&&n.name.getText(source)==='translations')dictionary=n.initializer.getText(source);ts.forEachChild(n,visit);}visit(source);
write('package.json',JSON.stringify({private:true,scripts:{dev:'next dev'}}));
write('tsconfig.json',JSON.stringify({compilerOptions:{target:'ES2020',lib:['dom','esnext'],jsx:'preserve',module:'esnext',moduleResolution:'bundler',esModuleInterop:true,skipLibCheck:true,baseUrl:'.',paths:{'@/src/context/AppContext':['./context.tsx'],'@/src/hooks/useFxRate':['./fx.ts'],'@/src/components/SettingsModal':['./settings.tsx'],'@/src/lib/supabase':['./supabase.ts'],'@/src/app/actions':['./actions.ts'],'@/src/*':[path.join(repo,'src/*')]}},include:['**/*.ts','**/*.tsx']}));
write('next.config.mjs',`export default {experimental:{staleTimes:{dynamic:${STALE_TTL/1000},static:${STALE_TTL/1000}}},reactStrictMode:true,devIndicators:false,webpack(config){Object.assign(config.resolve.alias,${JSON.stringify({'@/src/context/AppContext$':path.join(dir,'context.tsx'),'@/src/hooks/useFxRate$':path.join(dir,'fx.ts'),'@/src/components/SettingsModal$':path.join(dir,'settings.tsx'),'@/src/lib/supabase$':path.join(dir,'supabase.ts'),'@/src/app/actions$':path.join(dir,'actions.ts'),'@/src':path.join(repo,'src')})});return config;}};`);
write('context.tsx',`'use client';import React from 'react';const empty=[];const defaults={assets:[{id:'qa',name:'Rocket Lab',symbol:'RKLB',valueUSD:266.93,currentPrice:54.43,shares:4.904016,avgCost:60.1627,change:4.53,allocation:'Growth'}],trades:empty,cashActivities:[{id:'salary',type:'INCOME',originalAmount:6022.07,currency:'THB',amountUSD:178.6,date:'2026-11-01',category:'Salary'},{id:'entertainment',type:'EXPENSE',originalAmount:9229.77,currency:'THB',amountUSD:273.7,date:'2026-11-01',category:'entertainment'}],bucketActivities:empty,moneyBuckets:empty,allMoneyBuckets:empty,brokerageAccounts:empty,allBrokerageAccounts:empty,brokerageCashBalances:empty,brokerageCashEntries:empty,netWorthHistory:empty,netWorthScope:{portfolioId:null,settings:{},exchangeRates:{USD:1,THB:33.723},assets:[{id:'qa',name:'Rocket Lab',symbol:'RKLB',valueUSD:266.93,currentPrice:54.43,shares:4.904016,avgCost:60.1627,change:4.53,allocation:'Growth'}],trades:empty,cashActivities:[{id:'salary',type:'INCOME',originalAmount:6022.07,currency:'THB',amountUSD:178.6,date:'2026-11-01',category:'Salary'},{id:'entertainment',type:'EXPENSE',originalAmount:9229.77,currency:'THB',amountUSD:273.7,date:'2026-11-01',category:'entertainment'}],buckets:empty,accounts:empty,balances:empty,brokerEntries:empty},allocations:empty,customCategories:empty,marketQuotes:{},netWorthSettings:{},notifPreferences:{priceAlerts:true,rebalanceAlerts:true,weeklyReport:false},exchangeRates:{USD:1,THB:33.723},activePortfolioId:null,totalInvested:0,totalUnrealizedPL:0,totalRealizedPL:0,totalDividends:0,formatMoney:v=>String(v),selectPortfolio:()=>{},addToast:()=>{},setNetWorthSettings:()=>{}};const translations=${dictionary};let readyState=true;const listeners=new Set();const subscribe=fn=>{listeners.add(fn);return()=>listeners.delete(fn);};export function useApp(){const ready=React.useSyncExternalStore(subscribe,()=>readyState,()=>true);React.useEffect(()=>{window.__qaSetReady=value=>{readyState=value;listeners.forEach(fn=>fn());};},[]);return {...defaults,language:'en',t:k=>translations.en[k]||k,isDataLoaded:ready,dataLoadError:null,portfolios:empty,activePortfolio:null,isAllPortfolios:true,notifications:[],userProfile:null,currency:'THB',setCurrency:()=>{},setLanguage:()=>{}};}`);
write('fx.ts',`export const useFxRate=()=>({rate:33.723,mode:'auto',stale:false,quote:{fetchedAt:'2026-10-26T02:00:00Z'}});`);
write('settings.tsx',`export const SettingsModal=()=>null;`);
write('supabase.ts',`export const db={};export const supabase={auth:{signOut:async()=>{},getSession:async()=>({data:{session:null}})}};`);
write('actions.ts',`export const logoutAction=async()=>{};`);
write('app/navigate.tsx',`'use client';import {useEffect} from 'react';import {usePageRouter} from '@/src/components/PageTransition';export function QaNavigation(){const router=usePageRouter();useEffect(()=>{window.__qaPush=router.push;},[router.push]);return null;}`);
write('app/layout.tsx',`import React from 'react';import {PageTransition} from '@/src/components/PageTransition';import {MotionSettings} from '@/src/components/MotionSettings';import {QaNavigation} from './navigate';import './style.css';export default function Root({children}){return <html><body><MotionSettings><PageTransition><QaNavigation/>{children}</PageTransition></MotionSettings></body></html>}`);
write('app/style.css',`@import "${repo.replaceAll('\\','/')}/src/index.css"; @source "${repo.replaceAll('\\','/')}/src";`);
write('postcss.config.mjs',`export default {plugins:{'@tailwindcss/postcss':{}}};`);
write('app/(app)/layout.tsx',`import React from 'react';import {Sidebar} from '@/src/components/Sidebar';import {TopBar} from '@/src/components/TopBar';import {RouteViewport} from '@/src/components/RouteContent';export default function Layout({children}){return <><Sidebar/><div style={{marginLeft:'var(--sidebar-w)'}}><TopBar/><main data-page-content><RouteViewport>{children}</RouteViewport></main></div></>}`);
write('app/(app)/template.tsx',readFileSync('src/app/(app)/template.tsx','utf8'));
write('app/(app)/error.tsx',readFileSync('src/app/(app)/error.tsx','utf8'));
const routes=['dashboard','portfolio','ledger','cashflow','terminal','trade/plan','budget','history','settings','plan'];
for(const route of routes)write(`app/(app)/${route}/page.tsx`,`export const dynamic='force-dynamic';export default async function Page(){await new Promise(r=>setTimeout(r,1200));return <div className="app-page-container py-8"><h1>${route}</h1><section className="border border-border rounded-2xl bg-surface p-5 h-[420px]">${route} content ready</section></div>}`);
write('app/(app)/fault/page.tsx',`export const dynamic='force-dynamic';export default async function Page(){throw new Error('Intentional QA route failure')}`);
// The fixture uses the production shell, template and transitions, with isolated
// authentication/data. Never writes to a user's account.

write('app/(app)/layout.tsx', "export {default} from '@/src/app/(app)/layout';");
write('app/(app)/dashboard/page.tsx', "export {default} from '@/src/app/(app)/dashboard/page';");
write('app/(app)/cashflow/page.tsx', "export {default} from '@/src/app/(app)/cashflow/page';");
write('noop.tsx','export const AddCashflowModal=()=>null;export const PriceAlertManager=()=>null;');
let cfg=readFileSync(path.join(dir,'next.config.mjs'),'utf8');
cfg=cfg.replace('Object.assign(config.resolve.alias,','Object.assign(config.resolve.alias,'+JSON.stringify({'@/src/components/AddCashflowModal$':path.join(dir,'noop.tsx'),'@/src/components/PriceAlertManager$':path.join(dir,'noop.tsx')})+',');
write('next.config.mjs',cfg);
let context=readFileSync(path.join(dir,'context.tsx'),'utf8').replace('totalInvested:0,','totalInvested:0,totalProfit:0,totalAssetsValue:0,brokerageCashTotal:0,marketData:{},');
write('context.tsx',context);
const base='http://localhost:3112';let serverLog='';
const server=spawn(process.execPath,[path.join(repo,'node_modules/next/dist/bin/next'),'dev','-p','3112'],{cwd:dir,stdio:['ignore','pipe','pipe'],windowsHide:true});
for(const stream of [server.stdout,server.stderr])stream.on('data',d=>{serverLog+=d;writeFileSync(path.join(out,'server.log'),serverLog);});
const browser=await chromium.launch({executablePath:'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',headless:true});
const errors=[];
try {
 for(let i=0;i<120;i++){try{await fetch(base+'/dashboard');break;}catch{await new Promise(r=>setTimeout(r,500));}}
 for(const width of [320,393,768,1024,1440]) {
  const page=await browser.newPage({viewport:{width,height:852},isMobile:width<1024,hasTouch:width<1024,reducedMotion:'reduce'});
  page.on('pageerror',e=>errors.push(e.message));
  for(const route of ['dashboard','cashflow']) {
   await page.clock.install({time:new Date('2026-11-05T05:00:00Z')}); await page.goto(base+'/'+route);
   await page.waitForSelector('[data-route-entered]',{timeout:90000});
   await page.waitForTimeout(500);
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),width+' '+route+' overflow');
   assert(await page.locator('main').evaluate(e=>e.getBoundingClientRect().width)>width-(width<1024?10:300),'content width');
   await page.screenshot({path:path.join(out,'populated-'+route+'-'+width+'.png')});
  }
  if(width<1024) {
   await page.getByRole('button',{name:'Open menu',exact:true}).click();
   const dialog=page.getByRole('dialog',{name:'Main menu'});
   await dialog.waitFor();
   assert(await dialog.evaluate(e=>e.contains(document.activeElement)),'focus inside drawer');
   await page.keyboard.press('Escape');
   await dialog.waitFor({state:'hidden'});
   assert(await page.getByRole('button',{name:'Open menu',exact:true}).evaluate(e=>e===document.activeElement),'focus restored');
   await page.getByRole('button',{name:'Menu',exact:true}).click();
   await dialog.getByRole('link',{name:'PLAN',exact:true}).click();
   await page.waitForURL('**/plan');
   await dialog.waitFor({state:'hidden'});
   await page.getByRole('button',{name:'Open menu',exact:true}).click();
   await page.mouse.click(width-8,200);
   await dialog.waitFor({state:'hidden'});
   await page.getByRole('button',{name:'Open menu',exact:true}).click();
   await page.setViewportSize({width:1200,height:852});
   await dialog.waitFor({state:'hidden'});
   assert(await page.evaluate(()=>document.documentElement.style.overflow!=='hidden'),'resize unlocks scroll');
  } else { assert.equal(await page.getByRole('navigation',{name:'Mobile navigation'}).isVisible(),false); }
  await page.close();
 }
 assert.deepEqual(errors,[]);
 console.log('PASS actual shell + dashboard/cashflow at 320,393,768,1024,1440; menu navigation, backdrop, Escape, focus restoration, resize scroll release.');
} finally {await browser.close();server.kill();}




