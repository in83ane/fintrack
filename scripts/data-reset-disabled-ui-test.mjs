// Standalone static HTTP fixture only. All SDK calls fail fast; no PGlite or DB.
import {createRequire} from 'node:module';
import {readFileSync,mkdtempSync,writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import ts from 'typescript';
const require=createRequire(path.join(os.tmpdir(),'fintrack-cashflow-qa/package.json'));
const {build}=require('esbuild'),{chromium}=require('playwright');
const {default:postcss}=await import('postcss'),{default:tailwind}=await import('@tailwindcss/postcss');
const repo=process.cwd(),fixture=path.join(repo,'scripts/data-reset-disabled-fixture.tsx');
const out=mkdtempSync(path.join(os.tmpdir(),'fintrack-reset-disabled-'));
const source=ts.createSourceFile('app.tsx',readFileSync('src/context/AppContext.tsx','utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let dictionary;function visit(n){if(ts.isVariableDeclaration(n)&&n.name.getText(source)==='translations')dictionary=n.initializer.getText(source);ts.forEachChild(n,visit);}visit(source);
assert.ok(dictionary);
const modules={
  '@/src/context/AppContext':`export {useApp} from ${JSON.stringify(fixture)};`,
  'qa-translations':`export const translations=${dictionary};`,
  '@/src/lib/supabase':`const forbidden=()=>{window.__resetQA.sdkCalls++;throw Error('SDK forbidden');};export const supabase=new Proxy({}, {get:forbidden});export const db=new Proxy({}, {get:forbidden});`,
};
const bundle=await build({entryPoints:[fixture],bundle:true,write:false,format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"development"'},plugins:[{name:'offline',setup(b){
  b.onResolve({filter:/.*/},a=>modules[a.path]?{path:a.path,namespace:'qa'}:undefined);
  b.onLoad({filter:/.*/,namespace:'qa'},a=>({contents:modules[a.path],loader:'tsx',resolveDir:repo}));
}}]});
const css=(await postcss([tailwind()]).process(readFileSync('src/index.css','utf8'),{from:path.join(repo,'src/index.css')})).css;
const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost');
  res.setHeader('Content-Type',url.pathname==='/qa.js'?'application/javascript':url.pathname==='/qa.css'?'text/css':'text/html');
  res.end(url.pathname==='/qa.js'?bundle.outputFiles[0].contents:url.pathname==='/qa.css'?css:`<!doctype html><html class="${url.searchParams.get('theme')==='light'?'light-mode':''}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/qa.css"></head><body class="bg-background text-foreground"><div id="root"></div><script src="/qa.js"></script></body></html>`);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH||'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',headless:true});
const origin=`http://127.0.0.1:${server.address().port}`,results=[],errors=[];
try {
  for(const width of [390,1280])for(const lang of ['th','en'])for(const theme of ['dark','light']){
    const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block'});
    const unexpected=[];
    await context.route('**/*',route=>{
      const u=new URL(route.request().url());
      if(u.origin===origin&&['/','/qa.js','/qa.css','/favicon.ico'].includes(u.pathname))return route.continue();
      unexpected.push(u.origin+u.pathname);return route.abort();
    });
    await context.addInitScript(()=>{
      window.__resetQA={sdkCalls:0,networkCalls:0,storageChanges:0};
      localStorage.setItem('fintrack-buckets','synthetic-preserved');
      const remove=Storage.prototype.removeItem,clear=Storage.prototype.clear;
      Storage.prototype.removeItem=function(...a){window.__resetQA.storageChanges++;return remove.apply(this,a);};
      Storage.prototype.clear=function(...a){window.__resetQA.storageChanges++;return clear.apply(this,a);};
      window.fetch=()=>{window.__resetQA.networkCalls++;throw Error('fetch forbidden');};
      XMLHttpRequest.prototype.open=()=>{window.__resetQA.networkCalls++;throw Error('XHR forbidden');};
      window.WebSocket=class{constructor(){window.__resetQA.networkCalls++;throw Error('WebSocket forbidden');}};
    });
    const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));
    for(const variant of ['page','skeleton']){
      await p.goto(`${origin}/?lang=${lang}&theme=${theme}${variant==='skeleton'?'&skeleton':''}`);
      let navigations=0;p.on('framenavigated',()=>navigations++);
      const section=p.getByRole('region',{name:lang==='th'?'การล้างข้อมูล':'Data reset',exact:true});
      const button=section.getByRole('button',{name:lang==='th'?'ปิดชั่วคราว':'Temporarily unavailable',exact:true});
      await button.waitFor();await section.scrollIntoViewIfNeeded();
      assert.equal(await button.isDisabled(),true);
      assert.equal(await button.getAttribute('aria-describedby'),'data-reset-description');
      assert.equal(await section.locator('input').count(),0);
      assert.equal(await section.getByRole('button').count(),1);
      assert.ok((await section.innerText()).includes(lang==='th'?'ข้อมูลของคุณยังอยู่':'Your data remains unchanged'));
      const rect=await button.boundingBox();assert.ok(rect&&rect.x>=0&&rect.x+rect.width<=width);
      await p.mouse.click(rect.x+rect.width/2,rect.y+rect.height/2);
      await button.evaluate(el=>{el.click();el.focus();});
      assert.equal(await button.evaluate(el=>document.activeElement===el),false);
      // Start keyboard traversal at the last preceding control. Disabled reset is skipped.
      await button.evaluate(el=>{const bs=[...document.querySelectorAll('button')];bs[bs.indexOf(el)-1].focus();});
      await p.keyboard.press('Tab');
      assert.equal(await button.evaluate(el=>document.activeElement===el),false);
      await p.keyboard.press('Enter');await p.keyboard.press('Space');
      await p.waitForTimeout(1700); // Would catch the retired 1500ms destructive reload.
      assert.equal(navigations,0);p.removeAllListeners('framenavigated');
      assert.equal(await p.evaluate(()=>localStorage.getItem('fintrack-buckets')),'synthetic-preserved');
      assert.deepEqual(await p.evaluate(()=>window.__resetQA),{sdkCalls:0,networkCalls:0,storageChanges:0});
      assert.doesNotMatch(await p.locator('#qa-toast').innerText(),/deleted|ถูกลบ|Failed to delete/);
      await section.screenshot({path:path.join(out,`${width}-${lang}-${theme}-${variant}.png`)});
    }
    assert.deepEqual(unexpected,[]);results.push({width,lang,theme,page:true,skeleton:true,sdkCalls:0});await context.close();
  }
  assert.deepEqual(errors,[]);
  writeFileSync(path.join(out,'results.json'),JSON.stringify({passed:results.length,results,errors},null,2));
  console.log(JSON.stringify({passed:results.length,renderChecks:results.length*2,errors,evidence:out}));
}finally{await browser.close();await new Promise(r=>server.close(r));}
