// Real Next routing, isolated from authentication and customer data.
// Run with PLAYWRIGHT_MODULE pointing to an installed playwright(-core) package.
import { mkdirSync, readFileSync, writeFileSync, existsSync, symlinkSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';

const repo=process.cwd(), dir=path.join(os.tmpdir(),'fintrack-nested-navigation');
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || path.join(os.tmpdir(),'fintrack-spending-qa/node_modules/playwright-core'));
const write=(name,contents)=>{const file=path.join(dir,name);mkdirSync(path.dirname(file),{recursive:true});writeFileSync(file,contents);};
mkdirSync(dir,{recursive:true});
if(!existsSync(path.join(dir,'node_modules')))symlinkSync(path.join(repo,'node_modules'),path.join(dir,'node_modules'),process.platform==='win32'?'junction':'dir');
write('package.json',JSON.stringify({private:true}));
write('tsconfig.json',JSON.stringify({compilerOptions:{target:'ES2020',lib:['dom','esnext'],jsx:'preserve',module:'esnext',moduleResolution:'bundler',esModuleInterop:true,skipLibCheck:true,baseUrl:'.',paths:{'@/src/context/AppContext':['./context.tsx'],'@/src/lib/supabase':['./supabase.ts'],'@/src/*':[path.join(repo,'src/*')]}},include:['**/*.ts','**/*.tsx']}));
const aliases={'@/src/context/AppContext$':path.join(dir,'context.tsx'),'@/src/lib/supabase$':path.join(dir,'supabase.ts'),'@/src/components/RouteContent$':path.join(dir,'route-content.tsx'),'@/src':path.join(repo,'src')};
write('next.config.mjs',`export default {reactStrictMode:true,devIndicators:false,webpack(config){Object.assign(config.resolve.alias,${JSON.stringify(aliases)});return config;}};`);
write('supabase.ts',`export const supabase={auth:{}};export const db={};`);
write('context.tsx',`'use client';export const useApp=()=>({isDataLoaded:true,isDataRefreshing:false,dataLoadError:null,language:'en',t:k=>k});`);
// Keep the real transition wrapper, but omit data-dependent skeleton artwork.
write('route-content.tsx',readFileSync('src/components/RouteContent.tsx','utf8').replace("'./RouteLoading'","'./loading'").replace("'./PageTransition'","'@/src/components/PageTransition'"));
write('loading.tsx',`export function RouteLoading(){return <div data-route-loading style={{height:400}}>Loading destination</div>}`);
write('postcss.config.mjs',`export default {plugins:{'@tailwindcss/postcss':{}}};`);
write('app/style.css',`@import "${repo.replaceAll('\\','/')}/src/index.css";`);
write('app/layout.tsx',`import {PageTransition} from '@/src/components/PageTransition';import './style.css';export default function Layout({children}){return <html><body><PageTransition>{children}</PageTransition></body></html>}`);
const routes=['ledger','ledger/spending','portfolio','portfolio/example'];
write('app/(app)/layout.tsx',`import Link from 'next/link';import {RouteViewport} from '@/src/components/RouteContent';export default function Layout({children}){return <><nav>${routes.map(route=>`<Link href="/${route}" prefetch={false}>${route}</Link>`).join(' ')}</nav><main><RouteViewport>{children}</RouteViewport></main></>}`);
write('app/(app)/template.tsx',readFileSync('src/app/(app)/template.tsx','utf8'));
for(const route of routes)write(`app/(app)/${route}/page.tsx`,`export const dynamic='force-dynamic';export default async function Page(){await new Promise(r=>setTimeout(r,150));return <section><h1>${route}</h1><p>Destination ready</p></section>}`);
const port=3127,base=`http://localhost:${port}`;
const server=spawn(process.execPath,[path.join(repo,'node_modules/next/dist/bin/next'),'dev','-p',String(port)],{cwd:dir,stdio:['ignore','pipe','pipe'],windowsHide:true});
let logs='';const log=d=>{logs+=d;writeFileSync(path.join(dir,'server.log'),logs);};server.stdout.on('data',log);server.stderr.on('data',log);
let browser;
try {
  for(let i=0;i<90;i++){let response;try{response=await fetch(base+'/ledger');}catch{}if(response){assert.equal(response.status,200,logs);break;}await new Promise(r=>setTimeout(r,500));}
  // Compile fixtures before measuring navigation rather than compiler speed.
  for(const route of routes)assert.equal((await fetch(base+'/'+route)).status,200);
  browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
  const page=await browser.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  let documents=0;page.on('request',r=>{if(r.isNavigationRequest()&&r.frame()===page.mainFrame())documents++;});
  const ready=async route=>{
    await page.waitForFunction(route=>document.querySelector('[data-route-entered] h1')?.textContent===route && document.querySelector('[data-page-wrapper]')?.getAttribute('data-phase')==='idle',route,{timeout:6000});
    assert.equal(await page.locator('[data-route-loading]').count(),0);
    assert.equal(await page.locator('[data-page-root]').count(),1);
  };
  await page.goto(base+'/ledger');await ready('ledger');
  const timings=[];
  for(const motion of ['no-preference','reduce']){
    await page.emulateMedia({reducedMotion:motion});
    for(const route of ['ledger/spending','ledger','portfolio','portfolio/example','portfolio','ledger']){
      const start=Date.now();await page.locator(`nav a[href="/${route}"]`).click();await ready(route);timings.push({motion,route,ms:Date.now()-start});
    }
    await page.goBack();await ready('portfolio');await page.goForward();await ready('ledger');
    await page.evaluate(()=>{document.querySelector('a[href="/ledger/spending"]').click();document.querySelector('a[href="/portfolio"]').click();});await ready('portfolio');
    await page.locator('nav a[href="/ledger"]').click();await ready('ledger');
  }
  assert.equal(documents,1,'Every navigation must stay client-side, without reloading');
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({result:'PASS nested and top-level navigation, back/forward, rapid clicks, reduced motion; no reload',timings}));
} finally {
  await browser?.close();server.kill();writeFileSync(path.join(dir,'server.log'),logs);
}
