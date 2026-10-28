import { createRequire } from 'node:module';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
const repo = process.cwd(), out = path.join(repo, 'output/price-inbox-alerts'); mkdirSync(out, { recursive: true });
const require = createRequire(path.join(os.tmpdir(), 'fintrack-cashflow-qa/package.json'));
const { build } = require('esbuild'), { chromium } = require('playwright');
const { default: postcss } = await import('postcss'), { default: tailwind } = await import('@tailwindcss/postcss');
const css = (await postcss([tailwind()]).process(readFileSync('src/index.css', 'utf8'), { from: path.join(repo, 'src/index.css') })).css;
const fixture = path.join(repo, 'scripts/price-alert-fixture.tsx');
const bundle = await build({ entryPoints: [fixture], bundle: true, write: false, format: 'iife', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"development"' }, plugins: [{ name: 'context', setup(b) {
  b.onResolve({ filter: /^@\/src\/lib\/supabase$/ }, () => ({ path: path.join(repo,'scripts/price-alert-supabase-fixture.ts') }));
  b.onResolve({ filter: /^@\/src\/context\/AppContext$/ }, () => ({ path: 'context', namespace: 'qa' }));
  b.onLoad({ filter: /.*/, namespace: 'qa' }, () => ({ contents: `export {useApp} from ${JSON.stringify(fixture)}`, loader: 'tsx', resolveDir: repo }));
} }] });
const server = http.createServer((req, res) => { res.setHeader('Content-Type', req.url === '/qa.js' ? 'application/javascript' : req.url === '/qa.css' ? 'text/css' : 'text/html'); res.end(req.url === '/qa.js' ? bundle.outputFiles[0].contents : req.url === '/qa.css' ? css : '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/qa.css"></head><body><div id="root"></div><script src="/qa.js"></script></body></html>'); });
await new Promise(r => server.listen(0, '127.0.0.1', r)); const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', headless: true });
const results=[],errors=[];
try {
 for(const width of [390,1280])for(const theme of ['dark','light'])for(const lang of ['en','th']){
  const context=await browser.newContext({viewport:{width,height:900}}),p=await context.newPage();
  p.on('pageerror',e=>errors.push(e.message));let ready=false,rows=[],failSave=false,saves=0,localRequests=0;
  await context.route('**/qa-email-status',route=>route.fulfill({json:{data:{configured:ready,ready,recipientAllowed:ready,schedulerHealthy:true,testMode:true},error:null}}));
  await context.route('**/qa-email-rows',route=>{
    const request=route.request().postDataJSON();
    if(request.operation==='create'){
      if(failSave)return route.fulfill({json:{data:null,error:{message:'failure'}}});
      saves++;rows.unshift({id:crypto.randomUUID(),...request.body,status:'active',current_price:null,last_error:null,checked_at:null,sent_at:null});
    }
    if(request.operation==='delete')rows=rows.filter(r=>r.id!==request.id);
    return route.fulfill({json:{data:rows,error:null}});
  });
  await context.route('**/api/market?**',route=>{localRequests++;return route.fulfill({json:{results:[]}});});
  // Even with the site's currency set to JPY, this form defaults to USD and only offers USD/THB.
  await p.goto(`${base}/?lang=${lang}&currency=JPY`);
  if(theme==='light')await p.evaluate(()=>document.documentElement.classList.add('light-mode'));
  await p.getByRole('button',{name:'Manage price alerts',exact:true}).click();
  await p.getByText(lang==='th'?/กำลังตรวจระบบเบื้องหลัง/:/Checking background monitoring/).waitFor();
  assert.equal(await p.getByRole('checkbox').count(),0);assert.equal(await p.getByRole('button',{name:lang==='th'?'เพิ่มการแจ้งเตือน':'Add Alert',exact:true}).isDisabled(),true);
  const currency=p.getByRole('combobox',{name:lang==='th'?'สกุลเงินของราคาเป้าหมาย':'Target currency',exact:true});assert.ok((await currency.textContent()).includes('USD'));
  await currency.click();assert.deepEqual(await p.getByRole('option').allTextContents(),['USD','THB']);
  await p.getByRole('option',{name:'THB',exact:true}).click();
  await p.screenshot({path:path.join(out,`${width}-${theme}-${lang}-not-configured.png`)});
  ready=true;await p.getByRole('button',{name:lang==='th'?'กำลังตรวจระบบเบื้องหลัง / กดลองอีกครั้ง':'Checking background monitoring / Retry'}).click();
  await p.waitForTimeout(100);
  await p.locator('input[list]').fill('AAPL');await p.locator('input[type=number]').fill('3400');
  failSave=true;
  await p.getByRole('button',{name:lang==='th'?'เพิ่มการแจ้งเตือน':'Add Alert',exact:true}).click();
  await p.getByRole('alert').waitFor();assert.equal(saves,0);
  failSave=false;
  await p.getByRole('button',{name:lang==='th'?'เพิ่มการแจ้งเตือน':'Add Alert',exact:true}).click();
  await p.getByText(lang==='th'?'กำลังติดตามบนเซิร์ฟเวอร์':'Monitoring on server',{exact:true}).waitFor();
  assert.equal(rows[0].currency,'THB');assert.equal(rows[0].target_price,3400);assert.equal(saves,1);assert.equal(localRequests,0);
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await p.screenshot({path:path.join(out,`${width}-${theme}-${lang}-active.png`)});
  // The server changes delivery state while the app is closed. Reopening fetches it from the server.
  rows[0].status='triggered';rows[0].last_error=null;
  await p.reload();await p.getByRole('button',{name:'Manage price alerts',exact:true}).click();
  await p.getByText(lang==='th'?'บันทึกในกระดิ่งแล้ว':'Saved in notification inbox',{exact:true}).waitFor();
  await p.getByRole('button',{name:`${lang==='th'?'ลบเงื่อนไขแจ้งเตือน':'Delete alert'} AAPL`}).click();
  await p.getByText(lang==='th'?'ยังไม่มีการแจ้งเตือน':'No alerts yet',{exact:true}).waitFor();assert.equal(rows.length,0);
  results.push({width,theme,lang,limitedCurrencies:true,serverSave:true,inboxDelivery:true});await context.close();
 }
 assert.deepEqual(errors,[]);console.log(JSON.stringify(results));
}finally{writeFileSync(path.join(out,'results.json'),JSON.stringify({results,errors},null,2));await browser.close();await new Promise(r=>server.close(r));}
