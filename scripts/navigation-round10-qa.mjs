// Isolated Next App Router integration. Real shell/transition code; no credentials
// or financial writes. Server pages deliberately wait to reproduce cold routing.
import { mkdirSync, readFileSync, writeFileSync, existsSync, symlinkSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {STALE_TTL} from '../src/lib/loading-policy.js';
const repo=process.cwd(),dir=path.join(os.tmpdir(),`fintrack-navigation-round10-${process.env.QA_MODE||'dev'}-fixture`),out=path.join(repo,'output/navigation-round10');
const require=createRequire(path.join(os.tmpdir(),'fintrack-cashflow-qa/package.json'));
const {chromium}=require('playwright');
mkdirSync(dir,{recursive:true});mkdirSync(out,{recursive:true});
if(!existsSync(path.join(dir,'node_modules')))symlinkSync(path.join(repo,'node_modules'),path.join(dir,'node_modules'),'junction');
const write=(name,contents)=>{const file=path.join(dir,name);mkdirSync(path.dirname(file),{recursive:true});writeFileSync(file,contents);};
const source=ts.createSourceFile('app.tsx',readFileSync('src/context/AppContext.tsx','utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let dictionary;function visit(n){if(ts.isVariableDeclaration(n)&&n.name.getText(source)==='translations')dictionary=n.initializer.getText(source);ts.forEachChild(n,visit);}visit(source);
write('package.json',JSON.stringify({private:true,scripts:{dev:'next dev'}}));
write('tsconfig.json',JSON.stringify({compilerOptions:{target:'ES2020',lib:['dom','esnext'],jsx:'preserve',module:'esnext',moduleResolution:'bundler',esModuleInterop:true,skipLibCheck:true,baseUrl:'.',paths:{'@/src/context/AppContext':['./context.tsx'],'@/src/hooks/useFxRate':['./fx.ts'],'@/src/components/SettingsModal':['./settings.tsx'],'@/src/lib/supabase':['./supabase.ts'],'@/src/app/actions':['./actions.ts'],'@/src/*':[path.join(repo,'src/*')]}},include:['**/*.ts','**/*.tsx']}));
write('next.config.mjs',`export default {experimental:{staleTimes:{dynamic:${STALE_TTL/1000},static:${STALE_TTL/1000}}},reactStrictMode:true,devIndicators:false,webpack(config){Object.assign(config.resolve.alias,${JSON.stringify({'@/src/context/AppContext$':path.join(dir,'context.tsx'),'@/src/hooks/useFxRate$':path.join(dir,'fx.ts'),'@/src/components/SettingsModal$':path.join(dir,'settings.tsx'),'@/src/lib/supabase$':path.join(dir,'supabase.ts'),'@/src/app/actions$':path.join(dir,'actions.ts'),'@/src':path.join(repo,'src')})});return config;}};`);
write('context.tsx',`'use client';import React from 'react';const empty=[];const defaults={assets:empty,trades:empty,cashActivities:empty,bucketActivities:empty,moneyBuckets:empty,allMoneyBuckets:empty,brokerageAccounts:empty,allBrokerageAccounts:empty,brokerageCashBalances:empty,brokerageCashEntries:empty,netWorthHistory:empty,netWorthScope:{portfolioId:null,settings:{},exchangeRates:{USD:1,THB:33.723},assets:empty,trades:empty,cashActivities:empty,buckets:empty,accounts:empty,balances:empty,brokerEntries:empty},allocations:empty,customCategories:empty,marketQuotes:{},netWorthSettings:{},notifPreferences:{priceAlerts:true,rebalanceAlerts:true,weeklyReport:false},exchangeRates:{USD:1,THB:33.723},activePortfolioId:null,totalInvested:0,totalUnrealizedPL:0,totalRealizedPL:0,totalDividends:0,formatMoney:v=>String(v),selectPortfolio:()=>{},addToast:()=>{},setNetWorthSettings:()=>{}};const translations=${dictionary};let readyState=true;const listeners=new Set();const subscribe=fn=>{listeners.add(fn);return()=>listeners.delete(fn);};export function useApp(){const ready=React.useSyncExternalStore(subscribe,()=>readyState,()=>true);React.useEffect(()=>{window.__qaSetReady=value=>{readyState=value;listeners.forEach(fn=>fn());};},[]);return {...defaults,language:'en',t:k=>translations.en[k]||k,isDataLoaded:ready,dataLoadError:null,portfolios:empty,activePortfolio:null,isAllPortfolios:true,notifications:[],userProfile:null,currency:'THB',setCurrency:()=>{},setLanguage:()=>{}};}`);
write('fx.ts',`export const useFxRate=()=>({rate:33.723,mode:'auto',stale:false,quote:{fetchedAt:'2026-10-26T02:00:00Z'}});`);
write('settings.tsx',`export const SettingsModal=()=>null;`);
write('supabase.ts',`export const db={};export const supabase={auth:{signOut:async()=>{},getSession:async()=>({data:{session:null}})}};`);
write('actions.ts',`export const logoutAction=async()=>{};`);
write('app/navigate.tsx',`'use client';import {useEffect} from 'react';import {usePageRouter} from '@/src/components/PageTransition';export function QaNavigation(){const router=usePageRouter();useEffect(()=>{window.__qaPush=router.push;},[router.push]);return null;}`);
write('app/layout.tsx',`import React from 'react';import {PageTransition} from '@/src/components/PageTransition';import {MotionSettings} from '@/src/components/MotionSettings';import {QaNavigation} from './navigate';import './style.css';export default function Root({children}){return <html><body><MotionSettings><PageTransition><QaNavigation/>{children}</PageTransition></MotionSettings></body></html>}`);
write('app/style.css',`@import "${repo.replaceAll('\\','/')}/src/index.css";`);
write('postcss.config.mjs',`export default {plugins:{'@tailwindcss/postcss':{}}};`);
write('app/(app)/layout.tsx',`import React from 'react';import {Sidebar} from '@/src/components/Sidebar';import {TopBar} from '@/src/components/TopBar';import {RouteViewport} from '@/src/components/RouteContent';export default function Layout({children}){return <><Sidebar/><div style={{marginLeft:'var(--sidebar-w)'}}><TopBar/><main data-page-content><RouteViewport>{children}</RouteViewport></main></div></>}`);
write('app/(app)/template.tsx',readFileSync('src/app/(app)/template.tsx','utf8'));
write('app/(app)/error.tsx',readFileSync('src/app/(app)/error.tsx','utf8'));
const routes=['dashboard','portfolio','ledger','cashflow','terminal','trade/plan','budget','history','settings','plan'];
for(const route of routes)write(`app/(app)/${route}/page.tsx`,`export const dynamic='force-dynamic';export default async function Page(){await new Promise(r=>setTimeout(r,1200));return <div className="app-page-container py-8"><h1>${route}</h1><section className="border border-border rounded-2xl bg-surface p-5 h-[420px]">${route} content ready</section></div>}`);
write('app/(app)/fault/page.tsx',`export const dynamic='force-dynamic';export default async function Page(){throw new Error('Intentional QA route failure')}`);
// The fixture uses the production shell, template and transitions, with isolated
// authentication/data. Never writes to a user's account.
const mode=process.env.QA_MODE||'dev', baseline=process.env.QA_BASELINE==='1';
write('next.config.mjs',readFileSync(path.join(dir,'next.config.mjs'),'utf8').replace('export default {','export default {typescript:{ignoreBuildErrors:true},eslint:{ignoreDuringBuilds:true},'));
const port=mode==='production'?3111:3110,base=`http://localhost:${port}`;
const runLabel=`${baseline?'before':process.env.QA_VIDEO?'video':process.env.QA_EXTRA?'extras':'after'}-${mode}`;
let serverLog='';
const capture=d=>{serverLog+=d;writeFileSync(path.join(out,`${runLabel}-server.log`),serverLog);};
if(mode==='production') {
 const build=spawn(process.execPath,[path.join(repo,'node_modules/next/dist/bin/next'),'build'],{cwd:dir,stdio:['ignore','pipe','pipe'],windowsHide:true});build.stdout.on('data',capture);build.stderr.on('data',capture);
 const code=await new Promise(r=>build.on('exit',r));assert.equal(code,0,'Fixture production build');
}
const server=spawn(process.execPath,[path.join(repo,'node_modules/next/dist/bin/next'),mode==='production'?'start':'dev','-p',String(port)],{cwd:dir,stdio:['ignore','pipe','pipe'],windowsHide:true});server.stdout.on('data',capture);server.stderr.on('data',capture);
const browser=await chromium.launch({executablePath:'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',headless:true});
let p;const errors=[];
try {
 for(let i=0;i<120;i++){try{await fetch(base+'/dashboard');break;}catch{await new Promise(r=>setTimeout(r,500));}}
 p=await browser.newPage({viewport:{width:1440,height:1000},recordVideo:{dir:path.join(out,'videos'),size:{width:1440,height:1000}}});
 p.on('pageerror',e=>errors.push(e.message));
 p.on('console',m=>{if(m.type()==='error'&&m.text().includes('[navigation]'))errors.push(m.text());});
 await p.goto(base+'/dashboard?traceNavigation');await p.waitForSelector('[data-route-entered] h1',{timeout:90000});
 // External instrumentation works in production, where app diagnostics are off.
 await p.evaluate(()=>{
  window.__qaFade=[];window.__navEvents=[];
  document.addEventListener('click',e=>{const a=e.target.closest('a[href]');if(a)window.__navEvents.push({t:performance.now(),href:a.getAttribute('href'),transitionCaptured:e.defaultPrevented});},true);
  const sample=()=>{
   const wrapper=document.querySelector('[data-page-wrapper]');
   const nodes=wrapper?[wrapper]:[document.querySelector('[data-transition-state]'),document.querySelector('[data-route-entered]')].filter(Boolean);
   const active=document.querySelector('.sidebar-nav [aria-current=page]');
   window.__qaFade.push({t:performance.now(),phase:wrapper?.dataset.phase||document.querySelector('[data-transition-state]')?.dataset.transitionState,routerRoute:location.pathname,targetRoute:document.querySelector('[data-route-page]')?.dataset.route,renderRoute:document.querySelector('[data-render-route]')?.dataset.renderRoute,opacity:nodes.reduce((a,n)=>a*Number(getComputedStyle(n).opacity),1),pageRootCount:document.querySelectorAll(wrapper?'[data-page-root]':'[data-route-page]').length,skeleton:!!document.querySelector('[data-route-loading]'),title:document.querySelector('header h2')?.textContent?.trim(),active:active?.textContent?.trim()});requestAnimationFrame(sample);
  };sample();
 });
 const navigate=async route=>{
  const clickCount=await p.evaluate(()=>window.__navEvents.length);
  await p.locator(`.sidebar-nav a[href="/${route}"]`).click();
  await p.waitForFunction(route=>document.querySelector('[data-route-entered] h1')?.textContent===route,route,{timeout:90000});
  await p.waitForTimeout(250);
  assert(await p.evaluate(({clickCount,route})=>window.__navEvents.slice(clickCount).some(e=>e.href===`/${route}`&&e.transitionCaptured),{clickCount,route}),`${route}: must use shared transition`);
 };
 if(baseline) {
  for(const route of ['portfolio','ledger','cashflow','dashboard','portfolio','ledger','cashflow','dashboard'])await navigate(route);
  const result=await p.evaluate(()=>({frames:window.__qaFade,fadeLog:window.__fadeLog,navigation:window.__navigationLog,clicks:window.__navEvents}));
  writeFileSync(path.join(out,`before-${mode}.json`),JSON.stringify({...result,errors},null,2));
  const jumps=result.frames.flatMap((f,i)=>i&&f.opacity-result.frames[i-1].opacity>.15&&f.renderRoute===result.frames[i-1].renderRoute?[{before:result.frames[i-1],after:f}]:[]);
  console.log(JSON.stringify({mode,frames:result.frames.length,jumps,errors},null,2));
 } else {
  const cdp=await p.context().newCDPSession(p);await cdp.send('Network.enable');
  const conditions=process.env.QA_EXTRA||process.env.QA_VIDEO?[]:mode==='production'?['production']:['cold-dev','normal','cpu6','slow3g','burst','reduced'];
  let seed=18217;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  const reports=[];
  for(const condition of conditions) {
   await cdp.send('Emulation.setCPUThrottlingRate',{rate:condition==='cpu6'?6:1});
   await cdp.send('Network.setCacheDisabled',{cacheDisabled:condition==='slow3g'});
   await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:condition==='slow3g'?400:0,downloadThroughput:condition==='slow3g'?50000:-1,uploadThroughput:condition==='slow3g'?50000:-1});
   await p.emulateMedia({reducedMotion:condition==='reduced'?'reduce':'no-preference'});
   await p.evaluate(()=>{window.__qaFade=[];window.__navEvents=[];window.__sidebar=document.querySelector('aside');window.__header=document.querySelector('header');});
   const order=[];let last=await p.evaluate(()=>location.pathname.slice(1));
   for(let i=0;i<30;i++) {let route=routes[i%routes.length];if(i>=routes.length)do {route=routes[Math.floor(random()*routes.length)];}while(route===last);if(route===last)route=routes[(routes.indexOf(route)+1)%routes.length];order.push(route);last=route;}
   for(let i=0;i<30;i++) {
    if(i===15) await p.evaluate(()=>document.documentElement.classList.toggle('light-mode'));
    if(condition==='burst') {
     const batch=order.slice(i,i+5);i+=4;
     await p.evaluate(async batch=>{for(const route of batch){document.querySelector(`.sidebar-nav a[href="/${route}"]`).click();await new Promise(r=>setTimeout(r,75));}},batch);
     await p.waitForFunction(route=>document.querySelector('[data-route-entered] h1')?.textContent===route,batch.at(-1),{timeout:90000});
     await p.waitForTimeout(250);
    } else await navigate(order[i]);
   }
   const audit=await p.evaluate(()=>({frames:window.__qaFade,events:window.__navEvents,sidebarStable:window.__sidebar===document.querySelector('aside'),headerStable:window.__header===document.querySelector('header'),fadeLog:window.__fadeLog}));
   const violations=[];const frames=audit.frames;
   for(let i=0;i<frames.length;i++) {
    const f=frames[i],previous=frames[i-1];
    if(f.pageRootCount!==1)violations.push({kind:'roots',f});
    const title=f.title.toLowerCase()==='transaction history'?'history':f.title.toLowerCase();
    if(title!==f.active.toLowerCase())violations.push({kind:'title',f});
    if(f.phase==='held'&&f.opacity>.02)violations.push({kind:'held-not-zero',f});
    if(previous&&f.phase==='leaving'&&f.opacity>previous.opacity+.02)violations.push({kind:'exit-increased',previous,f});
    if(previous&&f.phase==='leaving'&&previous.phase!=='held'&&f.opacity>.05&&f.renderRoute!==previous.renderRoute)violations.push({kind:'outgoing-route-replaced-before-zero',previous,f});
    if(previous&&f.phase==='leaving'&&previous.skeleton&&!f.skeleton&&f.opacity>.02)violations.push({kind:'outgoing-page-resurrected',previous,f});
    if(previous&&['entering','idle'].includes(f.phase)&&['entering'].includes(previous.phase)&&f.opacity<previous.opacity-.02)violations.push({kind:'entry-decreased',previous,f});
    if(previous&&previous.phase==='leaving'&&f.phase==='idle'&&condition!=='reduced')violations.push({kind:'exit-skipped-zero',previous,f});
    if(f.phase==='entering'&&previous?.phase!=='entering'&&condition!=='reduced'&&f.opacity>.02)violations.push({kind:'first-entry-not-zero',previous,f});
    if(['entering','idle'].includes(f.phase)&&f.renderRoute!==f.targetRoute&&previous&&['leaving','held'].includes(previous.phase)&&f.opacity>.05)violations.push({kind:'obsolete-route-visible',previous,f});
    if(previous&&['leaving','held'].includes(previous.phase)&&['entering','idle'].includes(f.phase)&&f.renderRoute===previous.renderRoute&&!f.skeleton&&previous.routerRoute!==f.routerRoute&&f.opacity>.05)violations.push({kind:'old-page-reappeared',previous,f});
   }
   const report={condition,clicks:30,order,frames:frames.length,violations,errors:[...errors],sidebarStable:audit.sidebarStable,headerStable:audit.headerStable};reports.push(report);
   writeFileSync(path.join(out,`after-${condition}.json`),JSON.stringify({...report,...audit},null,2));
   writeFileSync(path.join(out,`summary-${mode}.json`),JSON.stringify(reports,null,2));console.log(JSON.stringify(report));
   assert.equal(violations.length,0,`${condition}: opacity invariant`);assert.ok(audit.sidebarStable&&audit.headerStable);assert.deepEqual(errors,[]);
  }
  await cdp.send('Emulation.setCPUThrottlingRate',{rate:1});await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});await p.emulateMedia({reducedMotion:'no-preference'});
  if(process.env.QA_VIDEO) {
   for(const route of ['portfolio','ledger','cashflow','dashboard'])await navigate(route);
   await p.evaluate(async()=>{
    document.documentElement.classList.remove('light-mode');
    const marker=document.createElement('div');marker.style.cssText='position:fixed;left:0;top:0;width:64px;height:64px;background:black;z-index:999999';document.body.append(marker);
    await new Promise(r=>setTimeout(r,300));window.__videoMark=performance.now();marker.style.background='white';
    await new Promise(r=>setTimeout(r,200));marker.style.background='black';window.__qaFade=[];window.__navEvents=[];
   });
   for(const route of ['portfolio','ledger','cashflow','dashboard','portfolio','cashflow','ledger','dashboard','portfolio','dashboard'])await navigate(route);
   await p.waitForTimeout(250);
   writeFileSync(path.join(out,`video-${mode}.json`),JSON.stringify(await p.evaluate(()=>({mark:window.__videoMark,frames:window.__qaFade,events:window.__navEvents})),null,2));
   console.log('Recorded 10 warm transitions with an out-of-crop synchronization marker');
  } else {
  await navigate('portfolio');await navigate('ledger');
  await p.evaluate(async()=>{window.__qaFade=[];const link=document.querySelector('.sidebar-nav a[href="/portfolio"]');for(let i=0;i<5;i++){link.click();await new Promise(r=>setTimeout(r,20));}});
  await p.waitForFunction(()=>document.querySelector('[data-route-entered] h1')?.textContent==='portfolio'&&document.querySelector('[data-page-wrapper]')?.dataset.phase==='idle');
  const repeated=await p.evaluate(()=>window.__qaFade);
  assert.ok(repeated.every(f=>f.phase!=='leaving'||f.renderRoute==='/ledger'||f.opacity<=.02),'Repeated Next Link click cannot commit the destination before exit finishes');
  await navigate('ledger');
  await p.evaluate(()=>{window.__qaFade=[];window.__qaPush('/portfolio');});
  await p.waitForFunction(()=>document.querySelector('[data-page-wrapper]')?.dataset.phase==='entering',null,{polling:'raf'});
  await p.evaluate(async()=>{await new Promise(r=>setTimeout(r,45));window.__interruptedOpacity=Number(getComputedStyle(document.querySelector('[data-page-wrapper]')).opacity);window.__qaPush('/ledger');});
  await p.waitForFunction(()=>document.querySelector('[data-route-entered] h1')?.textContent==='ledger'&&document.querySelector('[data-page-wrapper]')?.dataset.phase==='idle');
  const interrupted=await p.evaluate(()=>({from:window.__interruptedOpacity,frames:window.__qaFade}));
  assert.ok(interrupted.from>0&&interrupted.from<1,'Actually interrupt entering');
  assert.ok(interrupted.frames.every((f,i)=>f.phase!=='leaving'||!i||f.opacity<=interrupted.frames[i-1].opacity+.02),'Interrupted exit never jumps');
  // Native history must not add another entry or strand the wrapper at held.
  await p.goBack();await p.waitForFunction(()=>document.querySelector('[data-route-entered] h1')?.textContent==='portfolio'&&document.querySelector('[data-page-wrapper]')?.dataset.phase==='idle');
  await p.goForward();await p.waitForFunction(()=>document.querySelector('[data-route-entered] h1')?.textContent==='ledger'&&document.querySelector('[data-page-wrapper]')?.dataset.phase==='idle');
  await p.evaluate(()=>window.__qaPush('/portfolio'));await p.waitForFunction(()=>document.querySelector('[data-page-wrapper]')?.dataset.phase==='leaving',null,{polling:'raf'});
  const cancelled=await p.evaluate(()=>{const el=document.querySelector('[data-page-wrapper]');el.getAnimations().forEach(a=>a.cancel());return Number(getComputedStyle(el).opacity);});assert.equal(cancelled,0,'Cancelled exit keeps zero base');
  await p.waitForFunction(()=>document.querySelector('[data-route-entered] h1')?.textContent==='portfolio'&&document.querySelector('[data-page-wrapper]')?.dataset.phase==='idle');
  await p.evaluate(()=>{window.__qaFade=[];window.__qaSetReady(false);window.__qaPush('/budget');});
  await p.waitForFunction(()=>document.querySelector('[data-route-loading]')&&document.querySelector('[data-page-wrapper]')?.dataset.phase==='entering',null,{polling:'raf'});
  await p.evaluate(async()=>{await new Promise(r=>setTimeout(r,45));window.__qaPush('/ledger');});
  await p.waitForTimeout(450);await p.evaluate(()=>window.__qaSetReady(true));
  await p.waitForFunction(()=>document.querySelector('[data-route-entered] h1')?.textContent==='ledger'&&document.querySelector('[data-page-wrapper]')?.dataset.phase==='idle');
  const pendingInterruption=await p.evaluate(()=>window.__qaFade);
  assert.ok(pendingInterruption.every((f,i)=>!i||f.phase!=='leaving'||!pendingInterruption[i-1].skeleton||f.skeleton||f.opacity<=.02),'Outgoing skeleton cannot turn back into an old page');
  await p.evaluate(()=>{window.__qaSetReady(false);window.__qaPush('/budget');});
  await p.getByText('Taking longer than usual…',{exact:true}).waitFor({timeout:15000});await p.getByRole('button',{name:'Retry',exact:true}).waitFor({timeout:16000});
  await p.getByRole('button',{name:'Retry',exact:true}).click();await p.waitForSelector('[data-route-entered] h1',{timeout:60000});
  const beforeFaultErrors=errors.length;
  await p.evaluate(()=>window.__qaPush('/fault'));
  await p.getByRole('button',{name:'Retry',exact:true}).waitFor({timeout:60000});
  await p.waitForFunction(()=>document.querySelector('[data-page-wrapper]')?.dataset.phase==='idle');
  assert.equal(await p.locator('[data-page-root]').count(),1,'Server error is a single acknowledged page root');
  // This route intentionally throws on the server; retain its expected browser
  // diagnostics separately instead of confusing them with navigation failures.
  const expectedServerError=errors.splice(beforeFaultErrors);
  assert.ok(expectedServerError.every(message=>!message.includes('[navigation]')),'Do not suppress navigation assertions during the expected server error');
  writeFileSync(path.join(out,`extras-${mode}.json`),JSON.stringify({repeated,interrupted,pendingInterruption,backForward:true,cancelledExitOpacity:cancelled,watchdog8s:true,error20s:true,retry:true,serverErrorVisible:true,expectedServerError,errors},null,2));assert.deepEqual(errors,[]);console.log('PASS repeated click, entering/skeleton interruption, Back/Forward, cancelled animation, 8s/20s watchdog, Retry, server-error boundary');
  }
 }
}finally{if(p){const video=p.video();await p.close();if(video)await video.saveAs(path.join(out,`${runLabel}.webm`));}await browser.close();server.kill();}
