// Isolated Next App Router integration. Real shell/transition code; no credentials
// or financial writes. Server pages deliberately wait to reproduce cold routing.
import { mkdirSync, readFileSync, writeFileSync, existsSync, symlinkSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import ts from 'typescript';
const repo=process.cwd(),dir=path.join(os.tmpdir(),'fintrack-navigation-round7-fixture'),out=path.join(repo,'output/navigation-round7');
const require=createRequire(path.join(os.tmpdir(),'fintrack-cashflow-qa/package.json'));
const {chromium}=require('playwright');
mkdirSync(dir,{recursive:true});mkdirSync(out,{recursive:true});
if(!existsSync(path.join(dir,'node_modules')))symlinkSync(path.join(repo,'node_modules'),path.join(dir,'node_modules'),'junction');
const write=(name,contents)=>{const file=path.join(dir,name);mkdirSync(path.dirname(file),{recursive:true});writeFileSync(file,contents);};
const source=ts.createSourceFile('app.tsx',readFileSync('src/context/AppContext.tsx','utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let dictionary;function visit(n){if(ts.isVariableDeclaration(n)&&n.name.getText(source)==='translations')dictionary=n.initializer.getText(source);ts.forEachChild(n,visit);}visit(source);
write('package.json',JSON.stringify({private:true,scripts:{dev:'next dev'}}));
write('tsconfig.json',JSON.stringify({compilerOptions:{target:'ES2020',lib:['dom','esnext'],jsx:'preserve',module:'esnext',moduleResolution:'bundler',esModuleInterop:true,skipLibCheck:true,baseUrl:'.',paths:{'@/src/context/AppContext':['./context.tsx'],'@/src/hooks/useFxRate':['./fx.ts'],'@/src/components/SettingsModal':['./settings.tsx'],'@/src/lib/supabase':['./supabase.ts'],'@/src/app/actions':['./actions.ts'],'@/src/*':[path.join(repo,'src/*')]}},include:['**/*.ts','**/*.tsx']}));
write('next.config.mjs',`export default {reactStrictMode:true,devIndicators:false,webpack(config){Object.assign(config.resolve.alias,${JSON.stringify({'@/src/context/AppContext$':path.join(dir,'context.tsx'),'@/src/hooks/useFxRate$':path.join(dir,'fx.ts'),'@/src/components/SettingsModal$':path.join(dir,'settings.tsx'),'@/src/lib/supabase$':path.join(dir,'supabase.ts'),'@/src/app/actions$':path.join(dir,'actions.ts'),'@/src':path.join(repo,'src')})});return config;}};`);
write('context.tsx',`'use client';import React from 'react';const empty=[];const defaults={assets:empty,trades:empty,cashActivities:empty,bucketActivities:empty,moneyBuckets:empty,allMoneyBuckets:empty,brokerageAccounts:empty,allBrokerageAccounts:empty,brokerageCashBalances:empty,brokerageCashEntries:empty,netWorthHistory:empty,allocations:empty,customCategories:empty,marketQuotes:{},netWorthSettings:{},notifPreferences:{priceAlerts:true,rebalanceAlerts:true,weeklyReport:false},exchangeRates:{USD:1,THB:33.723},activePortfolioId:null,totalInvested:0,totalUnrealizedPL:0,totalRealizedPL:0,totalDividends:0,formatMoney:v=>String(v),selectPortfolio:()=>{},addToast:()=>{},setNetWorthSettings:()=>{}};const translations=${dictionary};let readyState=true;const listeners=new Set();const subscribe=fn=>{listeners.add(fn);return()=>listeners.delete(fn);};export function useApp(){const ready=React.useSyncExternalStore(subscribe,()=>readyState,()=>true);React.useEffect(()=>{window.__qaSetReady=value=>{readyState=value;listeners.forEach(fn=>fn());};},[]);return {...defaults,language:'en',t:k=>translations.en[k]||k,isDataLoaded:ready,dataLoadError:null,portfolios:empty,activePortfolio:null,isAllPortfolios:true,notifications:[],userProfile:null,currency:'THB',setCurrency:()=>{},setLanguage:()=>{}};}`);
write('fx.ts',`export const useFxRate=()=>({rate:33.723,mode:'auto',stale:false,quote:{fetchedAt:'2026-10-26T02:00:00Z'}});`);
write('settings.tsx',`export const SettingsModal=()=>null;`);
write('supabase.ts',`export const db={};export const supabase={auth:{signOut:async()=>{},getSession:async()=>({data:{session:null}})}};`);
write('actions.ts',`export const logoutAction=async()=>{};`);
write('app/layout.tsx',`import React from 'react';import {PageTransition} from '@/src/components/PageTransition';import {MotionSettings} from '@/src/components/MotionSettings';import './style.css';export default function Root({children}){return <html><body><MotionSettings><PageTransition>{children}</PageTransition></MotionSettings></body></html>}`);
write('app/style.css',`@import "${repo.replaceAll('\\','/')}/src/index.css";`);
write('postcss.config.mjs',`export default {plugins:{'@tailwindcss/postcss':{}}};`);
write('app/(app)/layout.tsx',`import React from 'react';import {Sidebar} from '@/src/components/Sidebar';import {TopBar} from '@/src/components/TopBar';import {RouteViewport} from '@/src/components/RouteContent';export default function Layout({children}){return <><Sidebar/><div style={{marginLeft:'var(--sidebar-w)'}}><TopBar/><main data-page-content><RouteViewport>{children}</RouteViewport></main></div></>}`);
write('app/(app)/template.tsx',readFileSync('src/app/(app)/template.tsx','utf8'));
write('app/(app)/loading.tsx',readFileSync('src/app/(app)/loading.tsx','utf8'));
write('app/(app)/error.tsx',readFileSync('src/app/(app)/error.tsx','utf8'));
const routes=['dashboard','portfolio','ledger','cashflow','terminal','trade/plan','budget','history','settings'];
for(const route of routes)write(`app/(app)/${route}/page.tsx`,`export const dynamic='force-dynamic';export default async function Page(){await new Promise(r=>setTimeout(r,1200));return <div className="app-page-container py-8"><h1>${route}</h1><section className="border border-border rounded-2xl bg-surface p-5 h-[420px]">${route} content ready</section></div>}`);
write('app/(app)/fault/page.tsx',`export const dynamic='force-dynamic';export default async function Page(){throw new Error('Intentional QA route failure')}`);
const port=3108,base=`http://localhost:${port}`;
const server=spawn(process.execPath,[path.join(repo,'node_modules/next/dist/bin/next'),'dev','-p',String(port)],{cwd:dir,stdio:['ignore','pipe','pipe'],windowsHide:true});
let serverLog='';const log=d=>{serverLog+=d;writeFileSync(path.join(out,'next-server.log'),serverLog);};server.stdout.on('data',log);server.stderr.on('data',log);
const browser=await chromium.launch({executablePath:'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',headless:true});
const results=[],errors=[];let p;
try{
 for(let i=0;i<90;i++){try{await fetch(base+'/dashboard');break;}catch{await new Promise(r=>setTimeout(r,500));}}
 p=await browser.newPage({viewport:{width:1440,height:1000}});
 p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error'&&m.text().includes('[navigation]'))errors.push(m.text());});
 await p.goto(base+'/dashboard?traceNavigation');await p.waitForSelector('[data-route-entered] h1',{timeout:60000});
 await p.evaluate(()=>{window.__sidebar=document.querySelector('aside');window.__header=document.querySelector('header');window.__frames=[];const check=()=>{const root=document.querySelector('[data-route-page]'),shell=document.querySelector('main');const active=document.querySelector('.sidebar-nav [aria-current=page]');window.__frames.push({at:performance.now(),path:location.pathname,title:document.querySelector('header h2')?.textContent?.trim().toLowerCase(),active:active?.textContent?.trim().toLowerCase(),roots:document.querySelectorAll('[data-route-page]').length,pageHeadings:document.querySelectorAll('main h1').length,visible:!!root&&root.getBoundingClientRect().height>0&&getComputedStyle(shell).opacity!=='0',skeleton:!!document.querySelector('[data-route-loading]'),entered:!!document.querySelector('[data-route-entered] h1')});requestAnimationFrame(check)};check();});
 const cdp=await p.context().newCDPSession(p);if(!process.env.QA_DIAG) {await cdp.send('Network.enable');await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});await cdp.send('Emulation.setCPUThrottlingRate',{rate:6});await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:400,downloadThroughput:50000,uploadThroughput:50000});}
 if(process.env.QA_DIAG){await p.locator('.sidebar-nav a[href="/portfolio"]').click();await p.waitForTimeout(7000);const diag=await p.evaluate(()=>({path:location.pathname,html:document.querySelector('main').innerHTML,logs:window.__navigationLog}));console.log(JSON.stringify(diag));writeFileSync(path.join(out,'diagnostic.json'),JSON.stringify(diag,null,2));} else {
 for(const theme of ['dark','light']){
  await p.evaluate(theme=>document.documentElement.classList.toggle('light-mode',theme==='light'),theme);
  for(const route of [...routes.slice(1),'dashboard']){
   const start=await p.evaluate(()=>performance.now());await p.locator(`.sidebar-nav a[href="/${route}"]`).click();
   await p.waitForSelector('[data-route-loading]',{timeout:10000});
   const skeleton=await p.evaluate(()=>performance.now());
   if(route==='cashflow'){await p.waitForTimeout(180);await p.screenshot({path:path.join(out,`after-${theme}-skeleton.png`)});}
   await p.waitForFunction(route=>document.querySelector('[data-route-entered] h1')?.textContent===route,route,{timeout:60000});
   const paint=await p.evaluate(()=>performance.now());const timing=await p.evaluate(route=>{const logs=window.__navigationLog||[];const index=logs.findLastIndex(l=>l.phase==='requested'&&l.target==='/'+route);const tail=logs.slice(index);return {request:tail[0]?.at,skeleton:tail.find(l=>l.phase==='loading')?.at,data:tail.find(l=>l.phase==='content-ready')?.at,paint:tail.find(l=>l.phase==='paint')?.at};},route);results.push({theme,route,clickToSkeleton:timing.skeleton-timing.request,clickToData:timing.data-timing.request,clickToContent:(timing.paint||paint)-timing.request});writeFileSync(path.join(out,'timings-progress.json'),JSON.stringify(results,null,2));
  }
 }
 await p.evaluate(()=>{document.querySelector('.sidebar-nav a[href="/cashflow"]').click();document.querySelector('.sidebar-nav a[href="/ledger"]').click();document.querySelector('.sidebar-nav a[href="/portfolio"]').click();});
 await p.waitForFunction(()=>document.querySelector('[data-route-entered] h1')?.textContent==='portfolio',null,{timeout:60000});
 await p.evaluate(()=>{document.querySelector('.sidebar-nav a[href="/cashflow"]').click();document.querySelector('.sidebar-nav a[href="/portfolio"]').click();});await p.waitForFunction(()=>document.querySelector('[data-route-entered] h1')?.textContent==='portfolio',null,{timeout:60000});
 await p.emulateMedia({reducedMotion:'reduce'});await p.locator('.sidebar-nav a[href="/cashflow"]').click();await p.waitForFunction(()=>document.querySelector('[data-route-entered] h1')?.textContent==='cashflow',null,{timeout:60000});
 const audit=await p.evaluate(()=>({frames:window.__frames,logs:window.__navigationLog,sidebarStable:window.__sidebar===document.querySelector('aside'),headerStable:window.__header===document.querySelector('header')}));
 assert.ok(audit.sidebarStable&&audit.headerStable);assert.ok(audit.frames.every(f=>f.visible&&f.roots===1),'Visible single root every sampled frame');assert.ok(audit.frames.every(f=>(f.title==='transaction history'?'history':f.title)===f.active),'Title and active menu identify the same route every frame (existing History title alias retained)');assert.deepEqual(errors,[]);
 writeFileSync(path.join(out,'after-next.json'),JSON.stringify({scope:'Real Next router, actual shell, deterministic 1200ms server pages; Slow 3G 400ms/50KBps, CPU6x, cache disabled',results,...audit,errors},null,2));console.log(JSON.stringify({results,frames:audit.frames.length,errors}));
 await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});await cdp.send('Emulation.setCPUThrottlingRate',{rate:1});
 await p.evaluate(()=>window.__qaSetReady(false));await p.locator('.sidebar-nav a[href="/settings"]').click();await p.getByText('Taking longer than usual…',{exact:true}).waitFor({timeout:12000});await p.getByRole('button',{name:'Retry',exact:true}).waitFor({timeout:15000});await p.getByRole('button',{name:'Retry',exact:true}).click();await p.waitForSelector('[data-route-entered] h1',{timeout:30000});console.log('PASS watchdog 8s/20s and Retry');
 await p.evaluate(()=>window.dispatchEvent(new CustomEvent('fintrack:navigate',{detail:'/fault'})));await p.getByRole('button',{name:'Retry',exact:true}).waitFor({timeout:15000});console.log('PASS route error renders Retry');
 writeFileSync(path.join(out,'watchdog.json'),JSON.stringify({slowMessage:true,errorAfter20Seconds:true,retryReloads:true,routeError:true},null,2));
 }

}catch(error){if(p)writeFileSync(path.join(out,'failure.json'),JSON.stringify(await p.evaluate(()=>({html:document.querySelector('main')?.innerHTML,logs:window.__navigationLog,frames:window.__frames})),null,2));throw error;}finally{await browser.close();server.kill();writeFileSync(path.join(out,'next-server.log'),serverLog);}
