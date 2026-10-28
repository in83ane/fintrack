import {createRequire} from 'node:module';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {writerDatabase,bucket,portfolio} from './bucket-writer-db-fixture.mjs';
const require=createRequire(path.join(os.tmpdir(),'fintrack-cashflow-qa/package.json'));
const {build}=require('esbuild'),{chromium}=require('playwright');
const {default:postcss}=await import('postcss'),{default:tailwind}=await import('@tailwindcss/postcss');
const repo=process.cwd(),out=path.join(repo,'output/bucket-writer');mkdirSync(out,{recursive:true});
const fixture=path.join(repo,'scripts/bucket-writer-ui-fixture.tsx');
const source=ts.createSourceFile('app.tsx',readFileSync('src/context/AppContext.tsx','utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let dictionary;function visit(n){if(ts.isVariableDeclaration(n)&&n.name.getText(source)==='translations')dictionary=n.initializer.getText(source);ts.forEachChild(n,visit);}visit(source);
const modules={'@/src/context/AppContext':`export {useApp} from ${JSON.stringify(fixture)};`,'qa-translations':`export const translations=${dictionary};`};
const bundle=await build({entryPoints:[fixture],outfile:path.join(out,'qa.js'),bundle:true,write:false,format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"development"'},plugins:[{name:'qa',setup(b){b.onResolve({filter:/.*/},a=>modules[a.path]?{path:a.path,namespace:'qa'}:undefined);b.onLoad({filter:/.*/,namespace:'qa'},a=>({contents:modules[a.path],loader:'tsx',resolveDir:repo}));}}]});
const js=bundle.outputFiles.find(f=>f.path.endsWith('.js')||f.path==='<stdout>')?.contents||bundle.outputFiles[0].contents;
const css=(await postcss([tailwind()]).process(readFileSync('src/index.css','utf8'),{from:path.join(repo,'src/index.css')})).css+'\n'+(bundle.outputFiles.find(f=>f.path.endsWith('.css'))?.text||'');
let db,loseResponse=false,requests=[];
const q=async(s,a=[])=>(await db.query(s,a)).rows;
const server=http.createServer(async(req,res)=>{
 if(req.url==='/write'){
  let raw='';for await(const c of req)raw+=c;const body=JSON.parse(raw);requests.push(body);let data,error;
  try{data=(await q('select write_bucket_cash($1,$2) result',[body.request_id,body.command]))[0].result;if(loseResponse){loseResponse=false;data=null;error={message:'Simulated lost response after commit'};}}
  catch(e){error={code:e.code,message:e.message};}
  res.setHeader('Content-Type','application/json');res.end(JSON.stringify({data,error}));return;
 }
 res.setHeader('Content-Type',req.url==='/qa.js'?'application/javascript':req.url==='/qa.css'?'text/css':'text/html');
 res.end(req.url==='/qa.js'?js:req.url==='/qa.css'?css:'<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/qa.css"></head><body><div id="root"></div><script src="/qa.js"></script></body></html>');
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({executablePath:'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',headless:true});
const results=[],errors=[];
const fresh=async()=>{db=await writerDatabase();requests=[];await q('select save_cash_bucket($1,$2,$3,35)',[crypto.randomUUID(),'55555555-5555-4555-8555-555555555555',{name:'Second wallet',portfolio_id:portfolio,currency:'THB'}]);};
try{
 for(const width of [390,1280])for(const lang of ['en','th'])for(const theme of ['dark','light']){
  await fresh();const context=await browser.newContext({viewport:{width,height:900},timezoneId:'Asia/Bangkok'}),p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));
  await p.goto(`http://127.0.0.1:${server.address().port}/?lang=${lang}`);if(theme==='light')await p.evaluate(()=>document.documentElement.classList.add('light-mode'));
  await p.getByRole('button',{name:'QA expense',exact:true}).click();await p.locator('[data-record-amount]').fill('800');
  const [goal]=await q("insert into daily_plans(name,amount,bucket_id,starts_on) values('Concurrent PLAN',800,$1,'2026-10-01') returning id",[bucket]);await q("insert into plan_checks(plan_id,day) values($1,'2026-10-01')",[goal.id]);
  await p.locator('button[type=submit]').click();await p.getByRole('status').filter({hasText:lang==='th'?'ยอดเงินไม่พอ':'Insufficient funds'}).waitFor();
  assert.equal(await p.locator('[data-record-amount]').inputValue(),'800');assert.equal(Number((await q('select current_amount from money_buckets where id=$1',[bucket]))[0].current_amount),200);
  await p.screenshot({path:path.join(out,`insufficient-${width}-${lang}-${theme}.png`),fullPage:true});
  await p.locator('[data-record-amount]').fill('100');loseResponse=true;await p.locator('button[type=submit]').click();await p.getByRole('status').filter({hasText:lang==='th'?'บันทึกไม่สำเร็จ':'Could not save'}).waitFor();
  await p.locator('button[type=submit]').click();await p.locator('[data-record-amount]').waitFor({state:'hidden'});
  assert.equal(requests.length,3);assert.deepEqual(requests[1],requests[2]);assert.equal(Number((await q('select current_amount from money_buckets where id=$1',[bucket]))[0].current_amount),100);
  await p.getByRole('button',{name:'QA income',exact:true}).click();await p.locator('[data-record-amount]').fill('1.01');await p.locator('button[type=submit]').click();await p.locator('[data-record-amount]').waitFor({state:'hidden'});
  assert.equal(requests.at(-1).command.op,'distribute');assert.deepEqual(requests.at(-1).command.rows.map(r=>r.original_amount),[0.5,0.51]);
  results.push({width,lang,theme,staleBalance:true,uncertainRetry:true,distribution:true});await context.close();await db.close();db=null;
 }
 // Identical intentional entries after success are distinct payments, not retries.
 await fresh();
 const repeatPage=await browser.newPage({viewport:{width:1280,height:900},timezoneId:'Asia/Bangkok'});
 repeatPage.on('pageerror',e=>errors.push(e.message));
 await repeatPage.goto(`http://127.0.0.1:${server.address().port}/?lang=th`);
 await repeatPage.clock.install({time:new Date('2026-10-28T09:00:00Z')});
 for(let i=0;i<2;i++){
  await repeatPage.getByRole('button',{name:'QA expense',exact:true}).click();
  await repeatPage.locator('[data-record-amount]').fill('153');
  await repeatPage.locator('button[type=submit]').click();
  await repeatPage.locator('[data-record-amount]').waitFor({state:'hidden'});
 }
 assert.equal(requests.length,2);
 assert.notEqual(requests[0].request_id,requests[1].request_id);
 assert.notEqual(requests[0].command.rows[0].id,requests[1].command.rows[0].id);
 assert.equal(Number((await q('select current_amount from money_buckets where id=$1',[bucket]))[0].current_amount),694);
 assert.equal(Number((await q("select count(*) n from cash_activities where bucket_id=$1 and type='EXPENSE'",[bucket]))[0].n),2);
 results.push({identicalIntentionalEntries:true,distinctIds:true,balance:694});
 await repeatPage.close();await db.close();db=null;
 // Real Bucket page: pair is submitted once and remains atomic.
 await fresh();const p=await browser.newPage({viewport:{width:1280,height:1000}});p.on('pageerror',e=>errors.push(e.message));await p.goto(`http://127.0.0.1:${server.address().port}/?bucket`);
 await p.getByRole('button',{name:'โอนระหว่าง Bucket',exact:true}).first().click();
 await p.getByRole('button',{name:/Select Bucket|selectBucket/}).click();await p.getByRole('button',{name:'Second wallet',exact:true}).click();
 await p.locator('input[placeholder="0.00"]:visible').fill('100');await p.getByRole('button',{name:'Transfer',exact:true}).click();
 await p.waitForFunction(()=>document.getElementById('toast').textContent.includes('100'));
 assert.equal(requests.length,1);assert.equal(requests[0].command.op,'transfer');assert.equal(requests[0].command.rows.length,2);
 assert.equal(Number((await q('select current_amount from money_buckets where id=$1',[bucket]))[0].current_amount),900);
 await p.getByRole('button',{name:'Withdraw',exact:true}).first().click();
 await p.getByPlaceholder('Amount',{exact:true}).fill('950');await p.getByPlaceholder('Amount',{exact:true}).press('Enter');
 await p.getByRole('status').filter({hasText:'Insufficient funds'}).waitFor();
 assert.equal(Number((await q('select current_amount from money_buckets where id=$1',[bucket]))[0].current_amount),900);
 assert.equal(requests.at(-1).command.rows[0].type,'WITHDRAW');
 results.push({bucketTransfer:true,bucketWithdrawRejection:true});await p.close();await db.close();db=null;
 assert.deepEqual(errors,[]);writeFileSync(path.join(out,'ui-report.json'),JSON.stringify({passed:results.length,results,errors},null,2));console.log(JSON.stringify({passed:results.length,errors}));
}finally{if(db)await db.close();await browser.close();server.close();}
