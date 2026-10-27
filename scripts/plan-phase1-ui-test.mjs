import {createRequire} from 'node:module';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
const require=createRequire(path.join(os.tmpdir(),'fintrack-cashflow-qa/package.json'));
const {build}=require('esbuild'),{chromium}=require('playwright');
const {default:postcss}=await import('postcss'),{default:tailwind}=await import('@tailwindcss/postcss');
const repo=process.cwd(),out=path.join(repo,'output/plan-phase1');mkdirSync(out,{recursive:true});
const fixture=path.join(repo,'scripts/plan-phase1-fixture.tsx');
const bundle=await build({entryPoints:[fixture],bundle:true,write:false,format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"development"'},plugins:[{name:'fixture',setup(b){
 b.onResolve({filter:/^@\/src\/lib\/supabase$/},()=>({path:path.join(repo,'scripts/plan-phase1-adapter.ts')}));
 b.onResolve({filter:/^@\/src\/context\/AppContext$/},()=>({path:'context',namespace:'qa'}));
 b.onLoad({filter:/.*/,namespace:'qa'},()=>({contents:`export {useApp} from ${JSON.stringify(fixture)}`,loader:'tsx',resolveDir:repo}));
}}]});
const css=(await postcss([tailwind()]).process(readFileSync('src/index.css','utf8'),{from:path.join(repo,'src/index.css')})).css;
let tables={},lastWrite;
const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const server=http.createServer(async(req,res)=>{
 if(req.url==='/qa-db'){
  let raw='';for await(const chunk of req)raw+=chunk;const q=JSON.parse(raw);let data=[];
  if(q.operation==='rpc'){
   const p=tables.daily_plans.find(p=>p.id===q.body.target_id);
   if(p.has_money_history){p.archived=true;p.status='archived';data='archived';}else{tables.daily_plans=tables.daily_plans.filter(x=>x!==p);tables.plan_checks=tables.plan_checks.filter(x=>x.plan_id!==p.id);data='deleted';}
  }else{
   const rows=tables[q.table]||[],matched=rows.filter(r=>q.filters.every(([op,key,v])=>op==='eq'?r[key]===v:op==='gte'?r[key]>=v:r[key]<=v));
   if(q.operation==='select')data=matched.slice(q.range[0],q.range[1]+1);
   if(q.operation==='insert'){
    lastWrite=q.body;
    const row={id:crypto.randomUUID(),archived:false,has_money_history:false,...q.body};rows.push(row);tables[q.table]=rows;
    if(q.table==='daily_plans')tables.plan_rule_versions.push({plan_id:row.id,effective_on:row.starts_on,rule:{...row}});
   }
   if(q.operation==='update')for(const row of matched){lastWrite=q.body;Object.assign(row,q.body);row.archived=row.status==='archived';tables.plan_rule_versions=tables.plan_rule_versions.filter(v=>v.plan_id!==row.id||v.effective_on!==today);tables.plan_rule_versions.push({plan_id:row.id,effective_on:today,rule:{...row}});}
   if(q.operation==='delete')tables[q.table]=rows.filter(r=>!matched.includes(r));
  }
  res.setHeader('Content-Type','application/json');res.end(JSON.stringify({data,error:null}));return;
 }
 res.setHeader('Content-Type',req.url==='/qa.js'?'application/javascript':req.url==='/qa.css'?'text/css':'text/html');
 res.end(req.url==='/qa.js'?bundle.outputFiles[0].contents:req.url==='/qa.css'?css:'<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/qa.css"></head><body><div id="root"></div><script src="/qa.js"></script></body></html>');
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({executablePath:'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',headless:true});
const results=[],errors=[];
try{
 for(const width of [390,1280])for(const lang of ['en','th'])for(const theme of ['dark','light']){
  tables={daily_plans:[],plan_checks:[],plan_rule_versions:[]};lastWrite=null;
  const context=await browser.newContext({viewport:{width,height:900}}),p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));p.on('dialog',dialog=>dialog.accept());
  const th=lang==='th',t=(en,thai)=>th?thai:en;
  await p.goto(`http://127.0.0.1:${server.address().port}/?lang=${lang}`);
  if(theme==='light')await p.evaluate(()=>document.documentElement.classList.add('light-mode'));
  await p.getByRole('button',{name:t('New goal','เพิ่มเป้าหมาย'),exact:true}).click();
  const submit=p.getByRole('button',{name:t('Create goal','สร้างเป้าหมาย'),exact:true});assert.equal(await submit.isEnabled(),false);
  assert.equal(await p.getByLabel(t('No end date','ไม่มีวันสิ้นสุด'),{exact:true}).isChecked(),true);
  assert.equal(await p.getByLabel(t('End','สิ้นสุด'),{exact:true}).count(),0);
  await p.getByLabel(t('Goal name','ชื่อเป้าหมาย'),{exact:true}).fill('QA goal');
  await p.getByRole('combobox',{name:t('Repeat','ความถี่'),exact:true}).click();
  await p.getByRole('option',{name:t('Selected weekdays','เฉพาะวันที่เลือก'),exact:true}).click();
  assert.equal(await submit.isEnabled(),false);
  await p.getByRole('checkbox',{name:th?'จ':'Mon',exact:true}).check();
  assert.equal(await submit.isEnabled(),true);
  await p.getByRole('combobox',{name:t('Goal type','ประเภทเป้าหมาย'),exact:true}).click();
  await p.getByRole('option',{name:t('Money goal · expense from bucket','เป้าหมายเงิน · รายจ่ายจาก bucket'),exact:true}).click();
  await p.getByRole('combobox',{name:t('Amount frequency','ช่วงเป้าหมายเงิน'),exact:true}).click();
  await p.getByRole('option',{name:t('Monthly target','เป้าหมายต่อเดือน'),exact:true}).click();
  await p.getByLabel(t('Monthly target','ยอดเป้าหมายต่อเดือน'),{exact:true}).fill('100');
  await p.getByRole('combobox',{name:t('Source bucket','กระเป๋าที่หักเงิน'),exact:true}).click();
  await p.getByRole('option',{name:'QA wallet · THB',exact:true}).click();
  assert.equal(await submit.isEnabled(),false);await p.getByRole('alert').waitFor();
  await p.getByRole('combobox',{name:t('Repeat','ความถี่'),exact:true}).click();
  await p.getByRole('option',{name:t('Every day','ทุกวัน'),exact:true}).click();
  assert.equal(await submit.isEnabled(),true);
  await p.getByRole('combobox',{name:t('Goal type','ประเภทเป้าหมาย'),exact:true}).click();
  await p.getByRole('option',{name:t('Habit · no money movement','เป้าหมายทั่วไป · ไม่หักเงิน'),exact:true}).click();
  await submit.click();await p.getByText('QA goal',{exact:true}).waitFor();
  assert.equal(lastWrite.ends_on,null);assert.equal(lastWrite.frequency,'daily');
  const tick=p.getByRole('checkbox',{name:`QA goal ${today}`,exact:true});await tick.click();
  await p.waitForFunction(day=>document.querySelector(`input[aria-label="QA goal ${day}"]`)?.checked,today);
  await p.getByRole('button',{name:`${t('Pause','พัก')} QA goal`,exact:true}).click();
  await p.getByRole('button',{name:`${t('Resume','ทำต่อ')} QA goal`,exact:true}).waitFor();
  assert.equal(await tick.isEnabled(),true);await tick.click(); // Undo stays available during a pause.
  await p.waitForFunction(()=>!document.querySelector('input[aria-label^="QA goal 20"]:checked'));
  await p.getByRole('button',{name:`${t('Resume','ทำต่อ')} QA goal`,exact:true}).click();
  await p.getByRole('button',{name:`${t('Edit','แก้ไข')} QA goal`,exact:true}).click();
  await p.getByRole('combobox',{name:t('Repeat','ความถี่'),exact:true}).click();
  await p.getByRole('option',{name:t('Every month','ทุกเดือน'),exact:true}).click();
  await p.getByLabel(t('Day of month','วันที่ของเดือน'),{exact:true}).fill('31');
  await p.screenshot({path:path.join(out,`${width}-${lang}-${theme}-editor.png`),fullPage:true});
  await p.getByRole('combobox',{name:t('Goal type','ประเภทเป้าหมาย'),exact:true}).click();
  await p.getByRole('option',{name:t('Money goal · expense from bucket','เป้าหมายเงิน · รายจ่ายจาก bucket'),exact:true}).click();
  await p.getByLabel(t('Monthly target','ยอดเป้าหมายต่อเดือน'),{exact:true}).fill('100');
  await p.getByRole('combobox',{name:t('Source bucket','กระเป๋าที่หักเงิน'),exact:true}).click();
  await p.getByRole('option',{name:'QA wallet · THB',exact:true}).click();
  assert.equal(await p.getByRole('button',{name:t('Save changes','บันทึกการแก้ไข'),exact:true}).isEnabled(),false);
  await p.getByRole('alert').waitFor();
  await p.getByRole('combobox',{name:t('Goal type','ประเภทเป้าหมาย'),exact:true}).click();
  await p.getByRole('option',{name:t('Habit · no money movement','เป้าหมายทั่วไป · ไม่หักเงิน'),exact:true}).click();
  await p.getByRole('button',{name:t('Save changes','บันทึกการแก้ไข'),exact:true}).click();
  await p.getByText('QA goal',{exact:true}).waitFor();
  assert.equal(lastWrite.monthly_day,31);assert.equal(Object.hasOwn(lastWrite,'id'),false);assert.equal(Object.hasOwn(lastWrite,'has_money_history'),false);
  await p.getByRole('button',{name:`${t('Archive','เก็บเข้ารายการ archive')} QA goal`,exact:true}).click();
  await p.getByRole('checkbox',{name:t('Include archived','รวมเป้าหมายที่ archive'),exact:true}).check();
  await p.getByRole('button',{name:`${t('Restore','คืนแผน')} QA goal`,exact:true}).click();
  await p.getByRole('button',{name:`${t('Delete','ลบ')} QA goal`,exact:true}).click();
  await p.getByText(t('No goals in this month. Add your first goal.','ยังไม่มีเป้าหมายในเดือนนี้ เพิ่มเป้าหมายแรกได้เลย'),{exact:true}).waitFor();
  assert.equal(tables.daily_plans.length,0);
  results.push({width,lang,theme,passed:true});await context.close();
 }
 assert.deepEqual(errors,[]);writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify({passed:results.length,errors}));
}finally{await browser.close();server.close();}
