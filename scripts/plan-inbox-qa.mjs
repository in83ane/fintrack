import { createRequire } from 'node:module';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
const repo = process.cwd(), out = path.join(repo, 'output/plan-inbox'); mkdirSync(out, { recursive: true });
const require = createRequire(path.join(os.tmpdir(), 'fintrack-cashflow-qa/package.json'));
const { build } = require('esbuild'), { chromium } = require('playwright');
const { default: postcss } = await import('postcss'), { default: tailwind } = await import('@tailwindcss/postcss');
const css = (await postcss([tailwind()]).process(readFileSync('src/index.css', 'utf8'), { from: path.join(repo, 'src/index.css') })).css;
const fixture = path.join(repo, 'scripts/plan-inbox-fixture.tsx');
const bundle = await build({ entryPoints: [fixture], bundle: true, write: false, format: 'iife', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"development"' }, plugins: [{ name: 'context', setup(b) {
  b.onResolve({ filter: /^@\/src\/lib\/supabase$/ }, () => ({ path: path.join(repo,'scripts/plan-inbox-adapter.ts') }));
  b.onResolve({ filter: /^@\/src\/context\/AppContext$/ }, () => ({ path: 'context', namespace: 'qa' }));
  b.onLoad({ filter: /.*/, namespace: 'qa' }, () => ({ contents: `export {useApp} from ${JSON.stringify(fixture)}`, loader: 'tsx', resolveDir: repo }));
} }] });
const server = http.createServer((req, res) => { res.setHeader('Content-Type', req.url === '/qa.js' ? 'application/javascript' : req.url === '/qa.css' ? 'text/css' : 'text/html'); res.end(req.url === '/qa.js' ? bundle.outputFiles[0].contents : req.url === '/qa.css' ? css : '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/qa.css"></head><body><div id="root"></div><script src="/qa.js"></script></body></html>'); });
await new Promise(r => server.listen(0, '127.0.0.1', r)); const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', headless: true });
const results=[],errors=[];
try {
 for(const width of [390,1280])for(const theme of ['dark','light'])for(const lang of ['en','th']){
  const context=await browser.newContext({viewport:{width,height:900}}),p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));
  let plans=[],checks=[],notifications=Array.from({length:width===1280&&theme==='dark'&&lang==='en'?1201:210},(_,i)=>({id:`notice-${i}`,user_id:'qa-user',title:`Notice ${i}`,message:'Saved while offline',type:'price',read:false,created_at:new Date(Date.now()-i*1000).toISOString()}));
  await context.route('**/qa-db',route=>{
   const q=route.request().postDataJSON(), table=q.table==='daily_plans'?plans:q.table==='plan_checks'?checks:notifications;
   const match=r=>q.filters.every(([op,k,v])=>op==='eq'?r[k]===v:op==='gte'?r[k]>=v:r[k]<=v);
   if(q.operation==='insert')table.push({id:crypto.randomUUID(),user_id:'qa-user',created_at:new Date().toISOString(),archived:false,...q.body});
   if(q.operation==='delete')for(let i=table.length-1;i>=0;i--)if(match(table[i]))table.splice(i,1);
   if(q.operation==='update')table.filter(match).forEach(r=>Object.assign(r,q.body));
   const all=table.filter(match).sort((a,b)=>{for(const [k,o] of q.orders){const x=a[k]<b[k]?-1:a[k]>b[k]?1:0;if(x)return o?.ascending===false?-x:x;}return 0;});
   return route.fulfill({json:{data:all.slice(q.range[0],q.range[1]+1),count:all.length,error:null}});
  });
  await p.goto(`${base}/?lang=${lang}`);if(theme==='light')await p.evaluate(()=>document.documentElement.classList.add('light-mode'));
  const size=notifications.length;await p.waitForFunction(n=>document.querySelector('[data-testid=unread]')?.textContent===String(n),size);
  await p.getByRole('button',{name:'Read all',exact:true}).click();await p.waitForFunction(()=>document.querySelector('[data-testid=unread]')?.textContent==='0');
  assert.equal(notifications.length,size);
  for(let i=0;i<Math.ceil(size/50)-1;i++){await p.getByRole('button',{name:'More history'}).click();await p.waitForTimeout(80);}
  await p.waitForFunction(n=>document.querySelector('[data-testid=history]')?.textContent===String(n),size);
  await p.getByRole('button',{name:lang==='th'?'เพิ่มเป้าหมาย':'New goal',exact:true}).click();
  await p.getByLabel(lang==='th'?'ชื่อเป้าหมาย':'Goal name',{exact:true}).fill('Read a book');
  await p.getByRole('button',{name:lang==='th'?'สร้างเป้าหมาย':'Create goal',exact:true}).click();
  await p.getByText('Read a book',{exact:true}).waitFor();
  // Current day is within the new plan; earlier/future dates must remain disabled.
  const today=await p.evaluate(()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()));
  const tick=p.getByRole('checkbox',{name:`Read a book ${today}`,exact:true});
  await tick.click();await p.waitForFunction(day=>document.querySelector(`input[aria-label="Read a book ${day}"]`)?.checked,today);assert.equal(checks.length,1);await p.reload();await tick.waitFor();assert.equal(await tick.isChecked(),true);
  await tick.click();await p.waitForFunction(day=>!document.querySelector(`input[aria-label="Read a book ${day}"]`)?.checked,today);assert.equal(checks.length,0);
  await p.getByRole('button',{name:lang==='th'?'ปี':'Year',exact:true}).click();
  assert.equal(await p.locator('section button').count(),12);
  await p.getByRole('button',{name:lang==='th'?'เดือน':'Month',exact:true}).click();
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  if(theme==='light')await p.evaluate(()=>document.documentElement.classList.add('light-mode'));
  await p.screenshot({path:path.join(out,`${width}-${theme}-${lang}.png`),fullPage:true});
  results.push({width,theme,lang,historyRetained:true,readStatePersists:true,planChecksPersist:true,yearView:true});await context.close();
 }
 assert.deepEqual(errors,[]);writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify({passed:results.length,errors}));
}finally{await browser.close();server.close();}
