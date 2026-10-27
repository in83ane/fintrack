import {createRequire} from 'node:module';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {planDatabase,sql} from './plan-phase2-db-fixture.mjs';
const require=createRequire(path.join(os.tmpdir(),'fintrack-cashflow-qa/package.json'));
const {build}=require('esbuild'),{chromium}=require('playwright');
const {default:postcss}=await import('postcss'),{default:tailwind}=await import('@tailwindcss/postcss');
const repo=process.cwd(),out=path.join(repo,'output/plan-phase2');mkdirSync(out,{recursive:true});
const fixture=path.join(repo,'scripts/plan-phase2-fixture.tsx');
const bundle=await build({entryPoints:[fixture],bundle:true,write:false,format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"development"'},plugins:[{name:'fixture',setup(b){
 b.onResolve({filter:/^@\/src\/lib\/supabase$/},()=>({path:path.join(repo,'scripts/plan-phase1-adapter.ts')}));
 b.onResolve({filter:/^@\/src\/context\/AppContext$/},()=>({path:'context',namespace:'qa'}));
 b.onLoad({filter:/.*/,namespace:'qa'},()=>({contents:`export {useApp} from ${JSON.stringify(fixture)}`,loader:'tsx',resolveDir:repo}));
}}]});
const css=(await postcss([tailwind()]).process(readFileSync('src/index.css','utf8'),{from:path.join(repo,'src/index.css')})).css;
let db;
const q=async(query,args=[])=>(await db.query(query,args)).rows;
const server=http.createServer(async(req,res)=>{
 if(req.url==='/qa-db'){
  let raw='';for await(const chunk of req)raw+=chunk;const request=JSON.parse(raw);let data=[],error=null;
  try {
   const tables=['daily_plans','plan_checks','plan_rule_versions','plan_month_locks','plan_status_events'];
   if(request.operation==='rpc') {if(request.name!=='remove_daily_plan')throw Error('Unknown RPC');data=(await q('select remove_daily_plan($1) result',[request.body.target_id]))[0].result;}
   else {
    if(!tables.includes(request.table))throw Error('Unknown table');
    const ident=key=>{if(!/^[a-z_]+$/.test(key))throw Error('Invalid column');return '"'+key+'"';};
    const params=[];const bind=value=>{params.push(value);return '$'+params.length;};
    let query='',where=request.filters.length?' where '+request.filters.map(([op,key,value])=>ident(key)+({eq:'=',gte:'>=',lte:'<='}[op])+bind(value)).join(' and '):'';
    if(request.operation==='select')query='select * from '+request.table+where+' order by '+request.orders.map(([key,options])=>ident(key)+(options?.ascending===false?' desc':' asc')).join(',')+' limit '+(request.range[1]-request.range[0]+1)+' offset '+request.range[0];
    else if(request.operation==='insert'){const keys=Object.keys(request.body);query='insert into '+request.table+'('+keys.map(ident).join(',')+') values('+keys.map(k=>bind(request.body[k])).join(',')+') returning *';}
    else if(request.operation==='update')query='update '+request.table+' set '+Object.entries(request.body).map(([k,v])=>ident(k)+'='+bind(v)).join(',')+where+' returning *';
    else if(request.operation==='delete')query='delete from '+request.table+where+' returning *';
    data=(await q(query,params)).map(row=>Object.fromEntries(Object.entries(row).map(([key,value])=>[key,['day','starts_on','ends_on','effective_on','month_key'].includes(key)&&value instanceof Date?value.toISOString().slice(0,10):value])));
   }
  }catch(e){error={message:e.message,code:e.code};}
  res.setHeader('Content-Type','application/json');res.end(JSON.stringify({data,error}));return;
 }
 res.setHeader('Content-Type',req.url==='/qa.js'?'application/javascript':req.url==='/qa.css'?'text/css':'text/html');
 res.end(req.url==='/qa.js'?bundle.outputFiles[0].contents:req.url==='/qa.css'?css:'<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/qa.css"></head><body><div id="root"></div><script src="/qa.js"></script></body></html>');
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({executablePath:'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',headless:true});
const results=[],errors=[];let activePage;
try{
 for(const width of [390,1280])for(const lang of ['en','th'])for(const theme of ['dark','light']){
  db=await planDatabase();
  const context=await browser.newContext({viewport:{width,height:900}}),p=await context.newPage();activePage=p;p.on('pageerror',e=>errors.push(e.message));
  await p.clock.install({time:new Date('2026-10-27T05:00:00Z')});
  let dialogMessages=[];p.on('dialog',dialog=>{dialogMessages.push(dialog.message());return dialog.accept(dialog.type()==='prompt'?'3.50':undefined);});
  const th=lang==='th',t=(en,thai)=>th?thai:en;
  await p.goto(`http://127.0.0.1:${server.address().port}/?lang=${lang}`);
  if(theme==='light')await p.evaluate(()=>document.documentElement.classList.add('light-mode'));
  await p.getByRole('button',{name:t('New goal','เพิ่มเป้าหมาย'),exact:true}).click();
  const submit=p.getByRole('button',{name:t('Create goal','สร้างเป้าหมาย'),exact:true});
  await p.getByLabel(t('Goal name','ชื่อเป้าหมาย'),{exact:true}).fill('Savings test');
  await p.getByRole('combobox',{name:t('Goal type','ประเภทเป้าหมาย'),exact:true}).click();await p.getByRole('option',{name:t('Money goal','เป้าหมายเงิน'),exact:true}).click();
  await p.getByRole('combobox',{name:t('Money action','การบันทึกเงิน'),exact:true}).click();await p.getByRole('option',{name:t('Save · transfer to PLAN (total unchanged)','เก็บออม · โอนไป PLAN (ยอดรวมไม่ลด)'),exact:true}).click();
  await p.getByRole('combobox',{name:t('Amount frequency','ช่วงเป้าหมายเงิน'),exact:true}).click();await p.getByRole('option',{name:t('Monthly target','เป้าหมายต่อเดือน'),exact:true}).click();
  await p.getByLabel(t('Monthly target','ยอดเป้าหมายต่อเดือน'),{exact:true}).fill('100');
  await p.getByRole('combobox',{name:t('Source bucket','กระเป๋าที่หักเงิน'),exact:true}).click();await p.getByRole('option',{name:'QA wallet · THB',exact:true}).click();
  await p.getByRole('combobox',{name:t('Repeat','ความถี่'),exact:true}).click();await p.getByRole('option',{name:t('X times per week','X ครั้งต่อสัปดาห์'),exact:true}).click();
  await p.getByLabel(t('Checks per week (Monday–Sunday)','จำนวนครั้งต่อสัปดาห์ (จันทร์–อาทิตย์)'),{exact:true}).fill('1');
  await p.getByLabel(t('Start','เริ่ม'),{exact:true}).fill('2026-10-26');
  assert.equal(await submit.isEnabled(),true);await submit.click();await p.getByText('Savings test',{exact:true}).waitFor();
  const first=p.getByRole('checkbox',{name:'Savings test 2026-10-26',exact:true});await first.click();
  await p.waitForFunction(()=>document.querySelector('input[aria-label="Savings test 2026-10-26"]')?.checked);
  const [{id}]=await q('select id from daily_plans');const [locked]=await q('select * from plan_month_locks');assert.equal(Number(locked.target_minor),10000);
  const sum=await q('select sum(current_amount) sum from money_buckets');assert.equal(Number(sum[0].sum),1000);
  const extra=p.getByRole('checkbox',{name:'Savings test 2026-10-27',exact:true});await extra.click();await p.waitForFunction(()=>document.querySelector('input[aria-label="Savings test 2026-10-27"]')?.checked);
  assert.ok(dialogMessages.some(s=>s.includes(th?'ไม่หักเงิน':'without moving money')));
  const [zero]=await q("select * from plan_checks where day='2026-10-27'");assert.equal(Number(zero.amount_minor),0);assert.equal(zero.cash_id,null);assert.equal(zero.credited,false);
  await p.getByRole('button',{name:t('Edit','แก้ไข')+' Savings test',exact:true}).click();
  await p.getByText(th?'เดือนนี้ล็อกยอดและกฎเดิมแล้ว การแก้ยอด/กฎมีผลตั้งแต่ 2026-11-01':'This month is locked at its original target. Amount/rule changes apply from 2026-11-01.',{exact:true}).waitFor();
  await p.getByLabel(t('Monthly target','ยอดเป้าหมายต่อเดือน'),{exact:true}).fill('200');await p.getByRole('button',{name:t('Save changes','บันทึกการแก้ไข'),exact:true}).click();await p.getByText('Savings test',{exact:true}).waitFor();
  assert.equal(Number((await q('select target_minor from plan_month_locks'))[0].target_minor),10000);
  await p.screenshot({path:path.join(out,`${width}-${lang}-${theme}-locked.png`),fullPage:true});
  await first.click();await p.waitForFunction(()=>!document.querySelector('input[aria-label="Savings test 2026-10-26"]')?.checked);
  assert.equal((await q('select * from plan_month_locks')).length,1);assert.equal(Number((await q('select amount_minor from plan_checks'))[0].amount_minor),0);
  await extra.click();await p.waitForFunction(()=>!document.querySelector('input[aria-label="Savings test 2026-10-27"]')?.checked);
  assert.equal((await q('select * from plan_month_locks')).length,0);assert.equal(Number((await q("select current_amount from money_buckets where id='33333333-3333-4333-8333-333333333333'"))[0].current_amount),1000);
  await p.screenshot({path:path.join(out,`${width}-${lang}-${theme}.png`),fullPage:true});
  await db.close();db=null;
  results.push({width,lang,theme,passed:true});await context.close();
 }
 assert.deepEqual(errors,[]);writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify({passed:results.length,errors}));
}catch(e){if(activePage){await activePage.screenshot({path:path.join(out,'failure.png'),fullPage:true});console.error(await activePage.locator('body').innerText());console.error(JSON.stringify(await q('select * from daily_plans')));console.error(JSON.stringify(await q('select * from plan_rule_versions')));}throw e;}finally{if(db)await db.close();await browser.close();server.close();}
